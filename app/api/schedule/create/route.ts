import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";
import { canUserAccessProject } from "@/lib/organizationAuth";

export const runtime = "nodejs";

const EVENT_TYPES = ["site_visit", "start_date", "completion_date", "inspection", "custom"];

// POST body: { projectId, eventType, customLabel?, eventDate, eventTime?, note?, creatingUserId? }
export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;
    const body = await req.json();

    const projectId = String(body?.projectId ?? "").trim();
    const eventType = String(body?.eventType ?? "").trim();
    const customLabel =
      typeof body?.customLabel === "string" && body.customLabel.trim()
        ? body.customLabel.trim()
        : null;
    const eventDate = String(body?.eventDate ?? "").trim();
    const eventTime =
      typeof body?.eventTime === "string" && body.eventTime.trim()
        ? body.eventTime.trim()
        : null;
    const note =
      typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;
    let creatingUserId =
      typeof body?.creatingUserId === "string" && body.creatingUserId
        ? body.creatingUserId
        : userId;

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    if (!EVENT_TYPES.includes(eventType)) {
      return NextResponse.json({ error: "Invalid event type." }, { status: 400 });
    }

    if (eventType === "custom" && !customLabel) {
      return NextResponse.json(
        { error: "Custom events require a label." },
        { status: 400 }
      );
    }

    if (!eventDate) {
      return NextResponse.json({ error: "Missing eventDate." }, { status: 400 });
    }

    const { data: project, error: projectErr } = await supabaseServer
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .single();

    if (projectErr || !project) {
      return NextResponse.json({ error: "Record not found." }, { status: 404 });
    }

    if (!(await canUserAccessProject(userId, projectId))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    // A client-supplied creatingUserId is only trusted if that user genuinely
    // has access to this project - otherwise it falls back to the
    // authenticated caller, matching the attribution-at-queue-time pattern
    // used elsewhere in this app (offline attachments/approvals, payments).
    if (
      creatingUserId !== userId &&
      !(await canUserAccessProject(creatingUserId, projectId))
    ) {
      creatingUserId = userId;
    }

    const { data, error } = await supabaseServer
      .from("project_schedule_events")
      .insert({
        project_id: projectId,
        event_type: eventType,
        custom_label: customLabel,
        event_date: eventDate,
        event_time: eventTime,
        note,
        created_by: creatingUserId,
      })
      .select("id, project_id, event_type, custom_label, event_date, event_time, note, created_at, created_by")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ event: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
