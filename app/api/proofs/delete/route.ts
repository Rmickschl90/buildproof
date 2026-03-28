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

    // 1) Read body
    const body = await req.json();
    const proofId = Number(body?.proofId);
    if (!Number.isFinite(proofId) || proofId <= 0) {
      return NextResponse.json({ error: "Missing/invalid proofId" }, { status: 400 });
    }

    // 2) Load proof
    const { data: proof, error: proofErr } = await supabaseServer
      .from("proofs")
      .select("id, project_id, locked_at")
      .eq("id", proofId)
      .single();

    if (proofErr || !proof) return NextResponse.json({ error: "Proof not found" }, { status: 404 });
    if (proof.locked_at) {
  return NextResponse.json(
    { error: "Finalized entries cannot be deleted." },
    { status: 400 }
  );
}

    // 3) Ownership check via project
    const { data: project, error: projErr } = await supabaseServer
      .from("projects")
      .select("id, user_id")
      .eq("id", proof.project_id)
      .single();

    if (projErr || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (project.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // 4) Get attachments for this proof
    const { data: attachments, error: attErr } = await supabaseServer
      .from("attachments")
      .select("id, path")
      .eq("proof_id", proofId);

    if (attErr) return NextResponse.json({ error: attErr.message }, { status: 400 });

    const paths = (attachments ?? []).map((a: any) => a.path).filter(Boolean);

    // 5) Remove from storage first (best-effort)
    if (paths.length > 0) {
      const { error: storageErr } = await supabaseServer.storage.from("attachments").remove(paths);
      if (storageErr) {
        return NextResponse.json({ error: storageErr.message }, { status: 400 });
      }
    }

    // 6) Remove attachment rows
    const { error: delAttErr } = await supabaseServer.from("attachments").delete().eq("proof_id", proofId);
    if (delAttErr) return NextResponse.json({ error: delAttErr.message }, { status: 400 });

    // 7) Delete proof row
    const { error: delProofErr } = await supabaseServer.from("proofs").delete().eq("id", proofId);
    if (delProofErr) return NextResponse.json({ error: delProofErr.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Delete proof failed" }, { status: 500 });
  }
}
