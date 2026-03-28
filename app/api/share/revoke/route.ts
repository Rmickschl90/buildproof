import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;

    const body = await req.json().catch(() => ({}));
    const shareId = String(body?.shareId || "").trim();

    if (!shareId) {
      return NextResponse.json({ error: "Missing shareId" }, { status: 400 });
    }

    const { data: share, error: shareErr } = await supabaseServer
      .from("project_shares")
      .select("id, project_id, revoked_at")
      .eq("id", shareId)
      .single();

    if (shareErr || !share) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    const { data: project, error: projectErr } = await supabaseServer
      .from("projects")
      .select("id, user_id")
      .eq("id", share.project_id)
      .single();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (share.revoked_at) {
      return NextResponse.json({
        ok: true,
        alreadyRevoked: true,
        revoked_at: share.revoked_at,
      });
    }

    const iso = new Date().toISOString();

    console.log("[share-revoke] revoking exact share", {
      shareId,
      projectId: share.project_id,
      revokedAt: iso,
    });

    const { error: revokeErr } = await supabaseServer
      .from("project_shares")
      .update({ revoked_at: iso })
      .eq("id", shareId)
      .is("revoked_at", null);

    if (revokeErr) {
      return NextResponse.json({ error: revokeErr.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      revoked_at: iso,
      revoked_share_id: shareId,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Revoke failed" }, { status: 500 });
  }
}