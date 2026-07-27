import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import { getUserOrganizationContext } from "@/lib/organizationAuth";

// Project status badge feature (2026-07-27): approval_requests has no
// client-readable RLS SELECT policy (all reads are funneled through
// authorized server routes, e.g. approvals/list), so the Projects list'
// per-card bid-status badge can't be computed with a direct browser
// Supabase query -- confirmed via direct REST testing on staging, which
// returned an empty array regardless of filters. This route does the
// authorization + lookup server-side instead.
//
// Batches authorization into two queries total regardless of how many
// project ids are requested (rather than calling canUserAccessProject once
// per id): fetch the caller's org context once, then fetch just the
// requested projects' ownership/org columns once, and keep only the ids
// the caller actually owns or belongs to the org for.
export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const body = await req.json().catch(() => ({}));
    const projectIds = Array.isArray(body?.projectIds)
      ? (body.projectIds as unknown[])
          .map((id) => String(id ?? "").trim())
          .filter(Boolean)
      : [];

    if (projectIds.length === 0) {
      return NextResponse.json({ statuses: {} });
    }

    const { data: projectRows, error: projectsError } = await supabaseServer
      .from("projects")
      .select("id, user_id, organization_id")
      .in("id", projectIds);

    if (projectsError) {
      return NextResponse.json(
        { error: projectsError.message || "Failed to load projects." },
        { status: 500 }
      );
    }

    const context = await getUserOrganizationContext(user.id);

    const allowedProjectIds = (projectRows || [])
      .filter(
        (row) =>
          row.user_id === user.id ||
          (row.organization_id && row.organization_id === context?.organizationId)
      )
      .map((row) => row.id);

    if (allowedProjectIds.length === 0) {
      return NextResponse.json({ statuses: {} });
    }

    const { data: baselineRows, error: baselineError } = await supabaseServer
      .from("approval_requests")
      .select("project_id, status")
      .eq("is_baseline", true)
      .in("project_id", allowedProjectIds);

    if (baselineError) {
      return NextResponse.json(
        { error: baselineError.message || "Failed to load baseline statuses." },
        { status: 500 }
      );
    }

    const statuses: Record<string, string> = {};

    for (const row of baselineRows || []) {
      if (row.project_id) {
        statuses[row.project_id] = row.status;
      }
    }

    return NextResponse.json({ statuses });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
