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

    const { data: share, error: shareErr } = await supabaseServer
      .from("project_shares")
      .select("id, token, created_at")
      .eq("project_id", projectId)
      .is("revoked_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (shareErr) {
      return NextResponse.json({ error: shareErr.message }, { status: 400 });
    }

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