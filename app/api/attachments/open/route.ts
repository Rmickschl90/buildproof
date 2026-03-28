import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const attachmentId = String(searchParams.get("id") || "").trim();
    const kind = String(searchParams.get("kind") || "proof").trim();

    if (!attachmentId) {
      return NextResponse.json({ error: "Missing attachment id" }, { status: 400 });
    }

    const table = kind === "approval" ? "approval_attachments" : "attachments";

    const { data: attachment, error: attachmentErr } = await supabaseServer
      .from(table)
      .select("id, path")
      .eq("id", attachmentId)
      .single();

    if (attachmentErr || !attachment?.path) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    const { data, error } = await supabaseServer.storage
      .from("attachments")
      .createSignedUrl(attachment.path, 60 * 10);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: error?.message || "Could not create signed URL" },
        { status: 500 }
      );
    }

    return Response.redirect(data.signedUrl, 302);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to open attachment" },
      { status: 500 }
    );
  }
}