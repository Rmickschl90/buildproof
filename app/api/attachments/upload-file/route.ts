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
    const form = await req.formData();

    const projectId = String(form.get("projectId") || "");
    const proofId = Number(form.get("proofId"));
    const fileName = String(form.get("fileName") || "");
    const mimeType = String(form.get("mimeType") || "application/octet-stream");
    const file = form.get("file");

    if (!projectId || !proofId || !fileName || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!mimeType.toLowerCase().startsWith("image/")) {
      return NextResponse.json(
        { error: "Server upload lane only accepts images" },
        { status: 400 }
      );
    }

    const maxBytes = 8 * 1024 * 1024;

    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: "Image is too large after compression" },
        { status: 413 }
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

    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadErr } = await supabaseServer.storage
      .from("attachments")
      .upload(path, Buffer.from(arrayBuffer), {
        contentType: mimeType || "application/octet-stream",
        upsert: false,
      });

    if (uploadErr) {
      return NextResponse.json(
        { error: uploadErr.message || "Storage upload failed" },
        { status: 500 }
      );
    }

    const { error: insertErr } = await supabaseServer
      .from("attachments")
      .insert({
        id: attachmentId,
        user_id: userId,
        project_id: projectId,
        proof_id: proofId,
        path,
        filename: fileName,
        mime_type: mimeType,
        size_bytes: file.size,
      });

    if (insertErr) {
      await supabaseServer.storage.from("attachments").remove([path]);

      return NextResponse.json(
        { error: insertErr.message || "Metadata insert failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      attachmentId,
      path,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Server image upload failed" },
      { status: 500 }
    );
  }
}