import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;
    const body = await req.json();

    const id = body.id;
    const projectId = body.projectId;
    const proofId = Number(body.proofId);
    const path = body.path;
    const fileName = body.fileName;
    const mimeType = body.mimeType;
    const sizeBytes = Number(body.sizeBytes);

    if (!id || !projectId || !proofId || !path || !fileName || !mimeType || !sizeBytes) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
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

    const { data: proof, error: proofErr } = await supabaseServer
      .from("proofs")
      .select("id,project_id")
      .eq("id", proofId)
      .single();

    if (proofErr || !proof) {
      return NextResponse.json({ error: "Proof not found" }, { status: 404 });
    }

    if (proof.project_id !== projectId) {
      return NextResponse.json(
        { error: "Proof does not belong to project" },
        { status: 400 }
      );
    }

    const { error: insertErr } = await supabaseServer
      .from("attachments")
      .insert({
        id,
        user_id: userId,
        project_id: projectId,
        proof_id: proofId,
        path,
        filename: fileName,
        mime_type: mimeType,
        size_bytes: sizeBytes,
      });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Metadata insert failed" },
      { status: 500 }
    );
  }
}