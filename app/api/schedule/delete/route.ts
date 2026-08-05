import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";
import { canUserAccessProject } from "@/lib/organizationAuth";

export const runtime = "nodejs";

// POST body: { eventId }
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

    const { data: event, error: eventErr } = await supabaseServer
      .from("project_schedule_events")
      .select("id, project_id")
      .eq("id", eventId)
      .single();

    if (eventErr || !event) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }

    if (!(await canUserAccessProject(userId, event.project_id))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const { error: deleteErr } = await supabaseServer
      .from("project_schedule_events")
      .delete()
      .eq("id", eventId);

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
