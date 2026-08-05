import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";
import { canUserAccessProject } from "@/lib/organizationAuth";

export const runtime = "nodejs";

const EVENT_TYPES = ["site_visit", "start_date", "completion_date", "inspection", "custom"];

// POST body: { eventId, eventType?, customLabel?, eventDate?, eventTime?, note? }
// Edited in place, freely - no delete-and-relog requirement here (unlike
// project_payments), since schedule events carry no dispute/financial
// weight. See the design doc for the reasoning.
export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const userId = user.id;
    const body = await req.json();
    const eventId = String(body?.eventId ?? "").trim();

    if (!eventId) {
      return NextResponse.json({ error: "Missing eventId." }, { status: 400 });
    }

    const { data: existing, error: existingErr } = await supabaseServer
      .from("project_schedule_events")
      .select("id, project_id")
      .eq("id", eventId)
      .single();

    if (existingErr || !existing) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    if (!(await canUserAccessProject(userId, existing.project_id))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const updatePayload: Record<string, unknown> = {};

    if (body?.eventType !== undefined) {
      const eventType = String(body.eventType).trim();
      if (!EVENT_TYPES.includes(eventType)) {
        return NextResponse.json({ error: "Invalid event type." }, { status: 400 });
      }
      updatePayload.event_type = eventType;
    }

    if (body?.customLabel !== undefined) {
      updatePayload.custom_label =
        typeof body.customLabel === "string" && body.customLabel.trim()
          ? body.customLabel.trim()
          : null;
    }

    if (body?.eventDate !== undefined) {
      const eventDate = String(body.eventDate).trim();
      if (!eventDate) {
        return NextResponse.json({ error: "Missing eventDate." }, { status: 400 });
      }
      updatePayload.event_date = eventDate;
    }

    if (body?.eventTime !== undefined) {
      updatePayload.event_time =
        typeof body.eventTime === "string" && body.eventTime.trim()
          ? body.eventTime.trim()
          : null;
    }

    if (body?.note !== undefined) {
      updatePayload.note =
        typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from("project_schedule_events")
      .update(updatePayload)
      .eq("id", eventId)
      .select("id, project_id, event_type, custom_label, event_date, event_time, note, created_at, created_by")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ event: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Update failed" },
      { status: 500 }
    );
  }
}
