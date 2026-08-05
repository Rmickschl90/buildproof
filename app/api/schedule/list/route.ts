import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import { canUserAccessProject } from "@/lib/organizationAuth";

export const runtime = "nodejs";

// POST body: { projectId }
export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const body = await req.json();
    const projectId = String(body?.projectId ?? "").trim();

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId." }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabaseServer
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Record not found." }, { status: 404 });
    }

    if (!(await canUserAccessProject(user.id, projectId))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const { data: events, error: eventsError } = await supabaseServer
      .from("project_schedule_events")
      .select("id, project_id, event_type, custom_label, event_date, event_time, note, created_at, created_by")
      .eq("project_id", projectId)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true });

    if (eventsError) {
      return NextResponse.json(
        { error: eventsError.message || "Failed to load schedule." },
        { status: 500 }
      );
    }

    return NextResponse.json({ events: events ?? [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
