import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

function detectFileType(bytes: Uint8Array): "pdf" | "jpg" | "png" | "webp" | "unknown" {
  // PDF: %PDF
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";

  // JPG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) return "png";

  // WEBP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) return "webp";

  return "unknown";
}

export async function POST(req: Request) {
  try {
    // ✅ AUTH PROTECTION — verifies logged-in user
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;

    // 1) Parse multipart form
    const form = await req.formData();
    const projectId = String(form.get("projectId") || "");
    const proofIdRaw = String(form.get("proofId") || "");
    const approvalId = String(form.get("approvalId") || "");
    const file = form.get("file");

    const proofId = Number(proofIdRaw);
    const hasProofId = !!proofIdRaw;
    const hasApprovalId = !!approvalId;

    if (!projectId || (!hasProofId && !hasApprovalId)) {
      return NextResponse.json(
        { error: "Missing projectId and proofId or approvalId" },
        { status: 400 }
      );
    }

    if (hasProofId && (!Number.isFinite(proofId) || proofId <= 0)) {
      return NextResponse.json({ error: "Missing/invalid proofId" }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    // 2) Server-side size limit
    const maxBytes = 25 * 1024 * 1024; // 25MB
    if (file.size > maxBytes) {
      return NextResponse.json({ error: "File too large (max 25MB)" }, { status: 413 });
    }

    // 3) Read bytes + verify real type via signature
    const buf = Buffer.from(await file.arrayBuffer());
    const head = new Uint8Array(buf.subarray(0, 16));
    const kind = detectFileType(head);

    if (kind === "unknown") {
      return NextResponse.json(
        { error: "Unsupported file type (must be PDF/JPG/PNG/WebP)" },
        { status: 400 }
      );
    }

    const mimeType =
      kind === "pdf" ? "application/pdf" :
        kind === "jpg" ? "image/jpeg" :
          kind === "webp" ? "image/webp" :
            "image/png";

    // 4) Ownership checks (server-side)
    const { data: project, error: projectErr } = await supabaseServer
      .from("projects")
      .select("id,user_id")
      .eq("id", projectId)
      .single();

    if (projectErr || !project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (project.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (hasProofId) {
      const { data: proof, error: proofErr } = await supabaseServer
        .from("proofs")
        .select("id,project_id")
        .eq("id", proofId)
        .single();

      if (proofErr || !proof) {
        return NextResponse.json({ error: "Proof not found" }, { status: 404 });
      }

      if (proof.project_id !== projectId) {
        return NextResponse.json({ error: "Proof does not belong to project" }, { status: 400 });
      }
    }

    if (hasApprovalId) {
      const { data: approval, error: approvalErr } = await supabaseServer
        .from("approval_requests")
        .select("id,project_id,status")
        .eq("id", approvalId)
        .single();

      if (approvalErr || !approval) {
        return NextResponse.json({ error: "Approval not found" }, { status: 404 });
      }

      if (approval.project_id !== projectId) {
        return NextResponse.json({ error: "Approval does not belong to project" }, { status: 400 });
      }

      if (approval.status && approval.status !== "draft") {
        return NextResponse.json(
          { error: "Only draft approvals can accept attachments" },
          { status: 400 }
        );
      }
    }

    // 5) Upload + insert metadata (cleanup on failure)
    const attachmentId = crypto.randomUUID();
    const safeName = sanitizeFilename(file.name || "file");
    const ownerFolder = hasApprovalId ? approvalId : String(proofId);
    const typeFolder = hasApprovalId ? "approval" : "proof";
    const path = `${userId}/${projectId}/${typeFolder}/${ownerFolder}/${attachmentId}-${safeName}`;

    const { error: uploadErr } = await supabaseServer.storage
      .from("attachments")
      .upload(path, buf, { contentType: mimeType, upsert: false });

    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 400 });

    const insertPayload = hasApprovalId
      ? {
        id: attachmentId,
        project_id: projectId,
        approval_id: approvalId,
        path,
        filename: file.name || safeName,
        mime_type: mimeType,
      }
      : {
        id: attachmentId,
        user_id: userId,
        project_id: projectId,
        proof_id: proofId,
        path,
        filename: file.name || safeName,
        mime_type: mimeType,
        size_bytes: file.size,
      };

    const targetTable = hasApprovalId ? "approval_attachments" : "attachments";

    const { error: insertErr } = await supabaseServer
      .from(targetTable)
      .insert(insertPayload);

    if (insertErr) {
      await supabaseServer.storage.from("attachments").remove([path]);
      return NextResponse.json({ error: insertErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Upload failed" }, { status: 500 });
  }
}
