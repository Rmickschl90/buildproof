import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // ✅ AUTH PROTECTION — verifies logged-in user
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;

    // 1) Read proofId without forcing Number() (bigint/string-safe)
    const body = await req.json().catch(() => ({}));
    const proofId = body?.proofId;

    if (proofId === undefined || proofId === null || proofId === "") {
      return NextResponse.json({ error: "Missing proofId" }, { status: 400 });
    }

    // 2) Load proof (entry) first
    const { data: proof, error: proofErr } = await supabaseServer
      .from("proofs")
      .select("id, project_id, locked_at")
      .eq("id", proofId)
      .maybeSingle();

    if (proofErr) return NextResponse.json({ error: proofErr.message }, { status: 400 });
    if (!proof) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    // 3) Ownership check via project
    const { data: project, error: projectErr } = await supabaseServer
      .from("projects")
      .select("id, user_id")
      .eq("id", proof.project_id)
      .maybeSingle();

    if (projectErr) return NextResponse.json({ error: projectErr.message }, { status: 400 });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (project.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // 4) Finalize once
    const { error: lockErr } = await supabaseServer
      .from("proofs")
      .update({ locked_at: new Date().toISOString(), locked_by: userId })
      .eq("id", proofId)
      .is("locked_at", null);

    if (lockErr) return NextResponse.json({ error: lockErr.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Finalize failed" }, { status: 500 });
  }
}
