import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";
import { canUserAccessProject } from "@/lib/organizationAuth";

export const runtime = "nodejs";

// POST body: { id, projectId, path, fileName, mimeType, sizeBytes, label? }
// Mirrors app/api/attachments/insert/route.ts's metadata-insert step, run
// after the file has been PUT to the signed upload URL from
// /api/documents/upload.
export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;
    const body = await req.json();

    const id = body?.id;
    const projectId = body?.projectId;
    const path = body?.path;
    const fileName = body?.fileName;
    const mimeType = body?.mimeType;
    const sizeBytes = Number(body?.sizeBytes);
    const label =
      typeof body?.label === "string" && body.label.trim()
        ? body.label.trim()
        : null;

    if (!id || !projectId || !path || !fileName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { data: project, error: projectErr } = await supabaseServer
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .single();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    if (!(await canUserAccessProject(userId, projectId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error: insertErr } = await supabaseServer
      .from("project_documents")
      .insert({
        id,
        project_id: projectId,
        path,
        filename: fileName,
        mime_type: mimeType || null,
        size_bytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
        label,
        uploaded_by: userId,
      })
      .select(
        "id, project_id, path, filename, mime_type, size_bytes, label, include_in_dispute_packet, created_at, uploaded_by"
      )
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 400 });
    }

    return NextResponse.json({ document: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Metadata insert failed" },
      { status: 500 }
    );
  }
}
