import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import { getUserOrganizationContext } from "@/lib/organizationAuth";

export const runtime = "nodejs";

// POST, no body required. Returns every schedule event across every record
// the caller can access (individually-owned + active org membership),
// enriched with the record's title/client name for the global calendar view.
// This mirrors the same access resolution the dashboard's own project list
// relies on via RLS (loadActiveProjects) - but since this route reads
// through the service-role client (which bypasses RLS), the equivalent
// access logic has to be resolved explicitly here rather than left to
// Postgres.
export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const context = await getUserOrganizationContext(user.id);

    let projectsQuery = supabaseServer
      .from("projects")
      .select("id, title, client_name")
      .is("archived_at", null);

    projectsQuery = context
      ? projectsQuery.or(`user_id.eq.${user.id},organization_id.eq.${context.organizationId}`)
      : projectsQuery.eq("user_id", user.id);

    const { data: accessibleProjects, error: projectsError } = await projectsQuery;

    if (projectsError) {
      return NextResponse.json(
        { error: projectsError.message || "Failed to resolve accessible records." },
        { status: 500 }
      );
    }

    const projectIds = (accessibleProjects ?? []).map((p) => p.id);

    if (projectIds.length === 0) {
      return NextResponse.json({ events: [] });
    }

    const projectsById = new Map(
      (accessibleProjects ?? []).map((p) => [p.id, { title: p.title, clientName: p.client_name }])
    );

    const { data: events, error: eventsError } = await supabaseServer
      .from("project_schedule_events")
      .select("id, project_id, event_type, custom_label, event_date, event_time, note, created_at, created_by")
      .in("project_id", projectIds)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true });

    if (eventsError) {
      return NextResponse.json(
        { error: eventsError.message || "Failed to load schedule." },
        { status: 500 }
      );
    }

    const enriched = (events ?? []).map((e) => ({
      ...e,
      projectTitle: projectsById.get(e.project_id)?.title ?? null,
      clientName: projectsById.get(e.project_id)?.clientName ?? null,
    }));

    return NextResponse.json({ events: enriched });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
