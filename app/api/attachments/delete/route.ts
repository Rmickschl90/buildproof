import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;

    const body = await req.json();
    const attachmentId = String(body?.attachmentId || "");
    const kind = String(body?.kind || "proof");

    if (!attachmentId) {
      return NextResponse.json({ error: "Missing attachmentId" }, { status: 400 });
    }

    if (kind === "approval") {
      const { data: attachment, error: attachmentErr } = await supabaseServer
        .from("approval_attachments")
        .select("id,project_id,path,approval_id")
        .eq("id", attachmentId)
        .single();

      if (attachmentErr || !attachment) {
        return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
      }

      const { data: project, error: projectErr } = await supabaseServer
        .from("projects")
        .select("id,user_id")
        .eq("id", attachment.project_id)
        .single();

      if (projectErr || !project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }

      if (project.user_id !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { data: approval, error: approvalErr } = await supabaseServer
        .from("approval_requests")
        .select("id,status")
        .eq("id", attachment.approval_id)
        .single();

      if (approvalErr || !approval) {
        return NextResponse.json({ error: "Parent approval not found" }, { status: 404 });
      }

      if (approval.status && approval.status !== "draft") {
        return NextResponse.json(
          { error: "Sent approvals cannot be modified." },
          { status: 403 }
        );
      }

      const { error: storageErr } = await supabaseServer.storage
        .from("attachments")
        .remove([attachment.path]);

      if (storageErr) {
        return NextResponse.json({ error: storageErr.message }, { status: 400 });
      }

      const { error: dbErr } = await supabaseServer
        .from("approval_attachments")
        .delete()
        .eq("id", attachmentId);

      if (dbErr) {
        return NextResponse.json({ error: dbErr.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true });
    }

    const { data: attachment, error: attachmentErr } = await supabaseServer
      .from("attachments")
      .select("id,user_id,path,proof_id")
      .eq("id", attachmentId)
      .single();

    if (attachmentErr || !attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    if (attachment.user_id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: proof, error: proofErr } = await supabaseServer
      .from("proofs")
      .select("id,project_id,locked_at")
      .eq("id", attachment.proof_id)
      .single();

    if (proofErr || !proof) {
      return NextResponse.json({ error: "Parent entry not found" }, { status: 404 });
    }

    if (proof.locked_at) {
      return NextResponse.json(
        { error: "Finalized entries cannot be modified." },
        { status: 403 }
      );
    }

    const { error: storageErr } = await supabaseServer.storage
      .from("attachments")
      .remove([attachment.path]);

    if (storageErr) {
      return NextResponse.json({ error: storageErr.message }, { status: 400 });
    }

    const { error: dbErr } = await supabaseServer
      .from("attachments")
      .delete()
      .eq("id", attachmentId);

    if (dbErr) {
      return NextResponse.json({ error: dbErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Delete failed" },
      { status: 500 }
    );
  }
}