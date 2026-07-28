import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";
import { canUserAccessProject } from "@/lib/organizationAuth";

export const runtime = "nodejs";

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

// POST body: { projectId, fileName }
// Mirrors app/api/attachments/upload/route.ts's signed-upload-url prep step,
// but stores under a `documents/` path prefix (distinct from the entry-tied
// `proof/` prefix attachments use) since project_documents is a separate,
// record-level file vault, not tied to any specific Timeline entry.
export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;
    const body = await req.json();

    const projectId = body?.projectId;
    const fileName = body?.fileName;

    if (!projectId || !fileName) {
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

    const documentId = crypto.randomUUID();
    const safeName = sanitizeFilename(fileName);
    const path = `${userId}/${projectId}/documents/${documentId}-${safeName}`;

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
      documentId,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to prepare upload" },
      { status: 500 }
    );
  }
}
