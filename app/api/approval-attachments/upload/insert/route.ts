import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);

    if (errorResponse || !user) {
      return errorResponse;
    }

    const body = await req.json().catch(() => null);

    const id = body?.id;
    const approvalId = body?.approvalId;
    const path = body?.path;
    const fileName = body?.fileName;
    const mimeType = body?.mimeType;
    const sizeBytes = body?.sizeBytes;

    if (!id || !approvalId || !path || !fileName) {
      return NextResponse.json(
        { error: "id, approvalId, path, and fileName are required" },
        { status: 400 }
      );
    }

    const { data: approval, error: approvalError } = await supabaseServer
      .from("approvals")
      .select("id, created_by, status")
      .eq("id", approvalId)
      .eq("created_by", user.id)
      .single();

    if (approvalError || !approval) {
      return NextResponse.json(
        { error: "Approval not found" },
        { status: 404 }
      );
    }

    if (approval.status && approval.status !== "draft") {
      return NextResponse.json(
        { error: "Attachments can only be added to draft approvals" },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabaseServer
      .from("approval_attachments")
      .insert({
        id,
        approval_id: approvalId,
        filename: fileName,
        mime_type: mimeType ?? null,
        path,
        size_bytes: typeof sizeBytes === "number" ? sizeBytes : null,
      });

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message || "Failed to insert approval attachment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Approval attachment insert failed" },
      { status: 500 }
    );
  }
}