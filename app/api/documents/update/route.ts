import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";
import { canUserAccessProject } from "@/lib/organizationAuth";

export const runtime = "nodejs";

// POST body: { documentId, includeInDisputePacket?, label? }
// Toggles the per-document "ride along in the dispute packet export" flag,
// and/or updates the optional label. This is the entire mechanism for
// choosing what shows up in a dispute export -- decided once here, at any
// time, rather than via a checklist shown at export time.
export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;
    const body = await req.json();
    const documentId = String(body?.documentId ?? "").trim();

    if (!documentId) {
      return NextResponse.json({ error: "Missing documentId." }, { status: 400 });
    }

    const { data: document, error: documentErr } = await supabaseServer
      .from("project_documents")
      .select("id, project_id")
      .eq("id", documentId)
      .single();

    if (documentErr || !document) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    if (!(await canUserAccessProject(userId, document.project_id))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const updatePayload: Record<string, unknown> = {};

    if (typeof body?.includeInDisputePacket === "boolean") {
      updatePayload.include_in_dispute_packet = body.includeInDisputePacket;
    }

    if (typeof body?.label === "string") {
      updatePayload.label = body.label.trim() || null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const { data, error: updateErr } = await supabaseServer
      .from("project_documents")
      .update(updatePayload)
      .eq("id", documentId)
      .select(
        "id, project_id, path, filename, mime_type, size_bytes, label, include_in_dispute_packet, created_at, uploaded_by"
      )
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json({ document: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Update failed" },
      { status: 500 }
    );
  }
}
