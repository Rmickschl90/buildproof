import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;
    const { searchParams } = new URL(req.url);
    const projectId = String(searchParams.get("projectId") || "");

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const { data: project, error: projectErr } = await supabaseServer
      .from("projects")
      .select("id,user_id")
      .eq("id", projectId)
      .single();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: activeShares, error: shareErr } = await supabaseServer
      .from("project_shares")
      .select("id, token, created_at")
      .eq("project_id", projectId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (shareErr) {
      return NextResponse.json({ error: shareErr.message }, { status: 400 });
    }

    if (!activeShares || activeShares.length === 0) {
      return NextResponse.json({ ok: true, share: null });
    }

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

    const share = activeShares.find((s) => !sendShareIdSet.has(s.id)) ?? null;

    if (!share?.token) {
      return NextResponse.json({ ok: true, share: null });
    }

    return NextResponse.json({
      ok: true,
      share: {
        id: share.id,
        token: share.token,
        created_at: share.created_at,
        shareUrl: `/share/${share.token}`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Load share failed" }, { status: 500 });
  }
}