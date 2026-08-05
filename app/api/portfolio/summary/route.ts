import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import { getUserOrganizationContext } from "@/lib/organizationAuth";
import { computeProjectFinancials } from "@/lib/estimateCalc";

export const runtime = "nodejs";

// POST, no body required. Returns Total/Paid/Balance Due for every
// non-archived record the caller can access (individually-owned + active
// org membership), for the Portfolio tab. Mirrors the same access
// resolution app/api/schedule/list-for-org/route.ts already established
// (this route reads through the service-role client, which bypasses RLS,
// so the equivalent access logic has to be resolved explicitly here).
//
// Computation must exactly match the per-record Estimate tab
// (estimateSummary/paymentsSummary in app/dashboard/page.tsx) or the
// Portfolio rollup would disagree with what a contractor sees when they
// open that specific record -- see lib/estimateCalc.ts's header for why
// this is a single shared implementation, not a second copy of the math.
export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const context = await getUserOrganizationContext(user.id);

    let projectsQuery = supabaseServer
      .from("projects")
      .select("id, title, closed_at, tax_rate")
      .is("archived_at", null);

    projectsQuery = context
      ? projectsQuery.or(
          `user_id.eq.${user.id},organization_id.eq.${context.organizationId}`
        )
      : projectsQuery.eq("user_id", user.id);

    const { data: accessibleProjects, error: projectsError } =
      await projectsQuery;

    if (projectsError) {
      return NextResponse.json(
        {
          error:
            projectsError.message || "Failed to resolve accessible records.",
        },
        { status: 500 }
      );
    }

    const projectIds = (accessibleProjects ?? []).map((p) => p.id);

    if (projectIds.length === 0) {
      return NextResponse.json({ projects: [] });
    }

    const [approvalsResult, paymentsResult] = await Promise.all([
      supabaseServer
        .from("approval_requests")
        .select("project_id, status, is_baseline, line_items, cost_delta")
        .in("project_id", projectIds)
        .is("archived_at", null),
      supabaseServer
        .from("project_payments")
        .select("project_id, amount")
        .in("project_id", projectIds),
    ]);

    if (approvalsResult.error) {
      return NextResponse.json(
        {
          error:
            approvalsResult.error.message || "Failed to load approvals.",
        },
        { status: 500 }
      );
    }

    if (paymentsResult.error) {
      return NextResponse.json(
        { error: paymentsResult.error.message || "Failed to load payments." },
        { status: 500 }
      );
    }

    const approvalsByProject = new Map<string, any[]>();
    for (const row of approvalsResult.data ?? []) {
      const list = approvalsByProject.get(row.project_id) ?? [];
      list.push(row);
      approvalsByProject.set(row.project_id, list);
    }

    const paymentsByProject = new Map<string, any[]>();
    for (const row of paymentsResult.data ?? []) {
      const list = paymentsByProject.get(row.project_id) ?? [];
      list.push(row);
      paymentsByProject.set(row.project_id, list);
    }

    const results = (accessibleProjects ?? []).map((project) => {
      const approvals = approvalsByProject.get(project.id) ?? [];
      const payments = paymentsByProject.get(project.id) ?? [];
      const financials = computeProjectFinancials(
        approvals,
        payments,
        project.tax_rate ?? null
      );

      return {
        id: project.id,
        title: project.title,
        closedAt: project.closed_at,
        hasBaseline: financials.hasBaseline,
        totalWithTax: financials.totalWithTax,
        paidTotal: financials.paidTotal,
        balanceDue: financials.balanceDue,
      };
    });

    return NextResponse.json({ projects: results });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
