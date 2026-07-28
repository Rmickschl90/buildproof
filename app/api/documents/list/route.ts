import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import { canUserAccessProject } from "@/lib/organizationAuth";

export const runtime = "nodejs";

// POST body: { projectId }
export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const body = await req.json();
    const projectId = String(body?.projectId ?? "").trim();

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabaseServer
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Record not found." }, { status: 404 });
    }

    if (!(await canUserAccessProject(user.id, projectId))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const { data: documents, error: documentsError } = await supabaseServer
      .from("project_documents")
      .select(
        "id, project_id, path, filename, mime_type, size_bytes, label, include_in_dispute_packet, created_at, uploaded_by"
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (documentsError) {
      return NextResponse.json(
        { error: documentsError.message || "Failed to load documents." },
        { status: 500 }
      );
    }

    return NextResponse.json({ documents: documents ?? [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
