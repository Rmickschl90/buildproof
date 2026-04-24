import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import { canEditApproval } from "@/lib/approvals/approvalStatusGuards";

const ALLOWED_TYPES = [
  "change_order",
  "scope",
  "material",
  "schedule",
  "general",
] as const;

export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const body = await req.json();

    const approvalId = String(body?.approvalId ?? "").trim();
    const title = String(body?.title ?? "").trim();
    const approvalType = String(body?.approvalType ?? "").trim();
    const description = String(body?.description ?? "").trim();
    const recipientName = body?.recipientName
      ? String(body.recipientName).trim()
      : null;
    const recipientEmail = String(body?.recipientEmail ?? "")
      .trim()
      .toLowerCase();

    const costDelta =
      body?.costDelta === "" ||
        body?.costDelta === null ||
        body?.costDelta === undefined
        ? null
        : Number(body.costDelta);

    const scheduleDelta = body?.scheduleDelta
      ? String(body.scheduleDelta).trim()
      : null;

    const dueAt = body?.dueAt ? String(body.dueAt) : null;

    if (!approvalId) {
      return NextResponse.json({ error: "Missing approvalId." }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: "Missing title." }, { status: 400 });
    }

    if (!approvalType) {
      return NextResponse.json({ error: "Missing approvalType." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(approvalType as (typeof ALLOWED_TYPES)[number])) {
      return NextResponse.json({ error: "Invalid approvalType." }, { status: 400 });
    }

    if (!description) {
      return NextResponse.json({ error: "Missing description." }, { status: 400 });
    }

    if (!recipientEmail) {
      return NextResponse.json({ error: "Missing recipientEmail." }, { status: 400 });
    }

    if (costDelta !== null && Number.isNaN(costDelta)) {
      return NextResponse.json({ error: "Invalid costDelta." }, { status: 400 });
    }

    const { data: approval, error: approvalError } = await supabaseServer
      .from("approval_requests")
      .select("id, project_id, created_by, status")
      .eq("id", approvalId)
      .single();

    if (approvalError || !approval) {
      return NextResponse.json({ error: "Approval not found." }, { status: 404 });
    }

    if (approval.created_by !== user.id) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    if (!canEditApproval(approval.status)) {
      return NextResponse.json(
        { error: "Only draft approvals can be edited." },
        { status: 400 }
      );
    }

    const { data: project, error: projectError } = await supabaseServer
      .from("projects")
      .select("id, client_email")
      .eq("id", approval.project_id)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    const projectClientEmail =
      typeof project.client_email === "string"
        ? project.client_email.trim().toLowerCase()
        : "";

    const recipientSource =
      projectClientEmail && recipientEmail === projectClientEmail
        ? "project"
        : "custom";

    const { data: updatedApproval, error: updateError } = await supabaseServer
      .from("approval_requests")
      .update({
        title,
        approval_type: approvalType,
        description,
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        recipient_source: recipientSource,
        cost_delta: costDelta,
        schedule_delta: scheduleDelta,
        due_at: dueAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", approvalId)
      .select("*")
      .single();

    if (updateError) {
      console.error("[approvals/update] update error", updateError);
      return NextResponse.json(
        { error: "Failed to update approval draft." },
        { status: 500 }
      );
    }

    return NextResponse.json({ approval: updatedApproval });
  } catch (error) {
    console.error("[approvals/update] unexpected error", error);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}