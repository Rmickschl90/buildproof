import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";

// Generates a URL-safe random token
function makeToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;

    const body = await req.json().catch(() => ({}));
    const projectId = String(body?.projectId || "").trim();
    const createFresh = body?.createFresh === true;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const { data: project, error: projectErr } = await supabaseServer
      .from("projects")
      .select("id,user_id,title")
      .eq("id", projectId)
      .single();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: activeShares, error: activeSharesErr } = await supabaseServer
      .from("project_shares")
      .select("id, token, created_at")
      .eq("project_id", projectId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (activeSharesErr) {
      return NextResponse.json({ error: activeSharesErr.message }, { status: 400 });
    }

    let existing: { id: string; token: string; created_at: string } | null = null;

    if (!createFresh && activeShares && activeShares.length > 0) {
      const activeShareIds = activeShares.map((s) => s.id);

      const { data: sendShares, error: sendSharesErr } = await supabaseServer
        .from("send_jobs")
        .select("share_id")
        .in("share_id", activeShareIds);

      if (sendSharesErr) {
        return NextResponse.json({ error: sendSharesErr.message }, { status: 400 });
      }

      const sendShareIdSet = new Set(
        (sendShares ?? [])
          .map((row: any) => row.share_id)
          .filter(Boolean)
      );

      existing = activeShares.find((s) => !sendShareIdSet.has(s.id)) ?? null;
    }

    if (!createFresh && existing?.token) {
      return NextResponse.json({
        ok: true,
        reused: true,
        share: {
          id: existing.id,
          token: existing.token,
          created_at: existing.created_at,
          shareUrl: `/share/${existing.token}`,
        },
        id: existing.id,
        token: existing.token,
        shareUrl: `/share/${existing.token}`,
      });
    }

    const shareToken = makeToken();

    const { data: created, error: insertErr } = await supabaseServer
      .from("project_shares")
      .insert({
        project_id: projectId,
        created_by: userId,
        token: shareToken,
      })
      .select("id, token, created_at")
      .single();

    if (insertErr || !created) {
      return NextResponse.json(
        { error: insertErr?.message || "Create share failed" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      reused: false,
      share: {
        id: created.id,
        token: created.token,
        created_at: created.created_at,
        shareUrl: `/share/${created.token}`,
      },
      id: created.id,
      token: created.token,
      shareUrl: `/share/${created.token}`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Create share failed" },
      { status: 500 }
    );
  }
}