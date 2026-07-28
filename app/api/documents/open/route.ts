import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

// GET /api/documents/open?id=<documentId>
// Mirrors app/api/attachments/open/route.ts -- redirects to a short-lived
// signed URL so the browser can view/download the original file.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const documentId = String(searchParams.get("id") || "").trim();

    if (!documentId) {
      return NextResponse.json({ error: "Missing document id" }, { status: 400 });
    }

    const { data: document, error: documentErr } = await supabaseServer
      .from("project_documents")
      .select("id, path")
      .eq("id", documentId)
      .single();

    if (documentErr || !document?.path) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { data, error } = await supabaseServer.storage
      .from("attachments")
      .createSignedUrl(document.path, 60 * 10);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: error?.message || "Could not create signed URL" },
        { status: 500 }
      );
    }

    return Response.redirect(data.signedUrl, 302);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to open document" },
      { status: 500 }
    );
  }
}
