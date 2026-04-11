import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";

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

    const createdTimezoneId =
      typeof body?.createdTimezoneId === "string"
        ? body.createdTimezoneId
        : null;

    const createdTimezoneOffsetMinutes =
      typeof body?.createdTimezoneOffsetMinutes === "number"
        ? body.createdTimezoneOffsetMinutes
        : null;

    const approvalId = String(body?.approvalId ?? "").trim();
    const projectId = String(body?.projectId ?? "").trim();
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

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
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

    const { data: project, error: projectError } = await supabaseServer
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    if (project.user_id !== user.id) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const { data: approval, error: insertError } = await supabaseServer
      .from("approval_requests")
      .insert({
        project_id: projectId,
        created_by: user.id,
        title,
        approval_type: approvalType,
        description,
        recipient_name: recipientName,
        recipient_email: recipientEmail,
        cost_delta: costDelta,
        schedule_delta: scheduleDelta,
        due_at: dueAt,
        status: "draft",
        created_timezone_id: createdTimezoneId,
        created_timezone_offset_minutes: createdTimezoneOffsetMinutes,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("[approvals/create] insert error", insertError);
      return NextResponse.json(
        { error: "Failed to create approval draft." },
        { status: 500 }
      );
    }

    return NextResponse.json({ approval });
  } catch (error) {
    console.error("[approvals/create] unexpected error", error);
    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 }
    );
  }
}