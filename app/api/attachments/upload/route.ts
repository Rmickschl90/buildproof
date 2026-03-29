import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;

    const body = await req.json();

    const projectId = body.projectId;
    const proofId = body.proofId;
    const fileName = body.fileName;

    if (!projectId || !proofId || !fileName) {
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

    const attachmentId = crypto.randomUUID();
    const safeName = sanitizeFilename(fileName);
    const path = `${userId}/${projectId}/proof/${proofId}/${attachmentId}-${safeName}`;

    // 🔥 NEW: create signed upload URL
    const { data, error } = await supabaseServer.storage
      .from("attachments")
      .createSignedUploadUrl(path);

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Failed to create upload URL" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      uploadUrl: data.signedUrl,
      path,
      attachmentId,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to prepare upload" },
      { status: 500 }
    );
  }
}