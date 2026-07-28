import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";
import { canUserAccessProject } from "@/lib/organizationAuth";

export const runtime = "nodejs";

// POST body: { documentId }
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
      .select("id, project_id, path")
      .eq("id", documentId)
      .single();

    if (documentErr || !document) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    if (!(await canUserAccessProject(userId, document.project_id))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const { error: storageErr } = await supabaseServer.storage
      .from("attachments")
      .remove([document.path]);

    if (storageErr) {
      return NextResponse.json({ error: storageErr.message }, { status: 400 });
    }

    const { error: deleteErr } = await supabaseServer
      .from("project_documents")
      .delete()
      .eq("id", documentId);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Delete failed" },
      { status: 500 }
    );
  }
}
