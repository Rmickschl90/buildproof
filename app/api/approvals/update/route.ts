import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import { canEditApproval } from "@/lib/approvals/approvalStatusGuards";
import { canUserAccessProject } from "@/lib/organizationAuth";

const ALLOWED_TYPES = [
  "change_order",
  "scope",
  "material",
  "schedule",
  "general",
] as const;

// Statuses that no longer count as an "active" baseline occupying a project's
// one-baseline slot -- see approvals/create's own comment and the Phase 2
// migration's header for the full reasoning.
const INACTIVE_BASELINE_STATUSES = ["declined", "expired"];

type RawLineItem = {
  description?: unknown;
  quantity?: unknown;
  unitCost?: unknown;
};

function normalizeLineItems(
  input: unknown
): { items: Array<Record<string, unknown>> | null; error: string | null } {
  if (input === undefined) return { items: null, error: null };
  if (!Array.isArray(input)) {
    return { items: null, error: "lineItems must be an array." };
  }

  const normalized: Array<Record<string, unknown>> = [];

  for (const raw of input as RawLineItem[]) {
    const description = String(raw?.description ?? "").trim();
    const quantity = Number(raw?.quantity);
    const unitCost = Number(raw?.unitCost);

    if (!description) {
      return { items: null, error: "Each line item needs a description." };
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { items: null, error: "Each line item needs a valid quantity." };
    }

    if (!Number.isFinite(unitCost) || unitCost < 0) {
      return { items: null, error: "Each line item needs a valid unit cost." };
    }

    const lineTotal = Math.round(quantity * unitCost * 100) / 100;

    normalized.push({
      description,
      quantity,
      unit_cost: unitCost,
      line_total: lineTotal,
    });
  }

  return { items: normalized, error: null };
}

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

    const { items: lineItems, error: lineItemsError } = normalizeLineItems(
      body?.lineItems
    );

    if (lineItemsError) {
      return NextResponse.json({ error: lineItemsError }, { status: 400 });
    }

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

    if (!(await canUserAccessProject(user.id, approval.project_id))) {
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

    const updatePayload: Record<string, unknown> = {
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
    };

    // Only touch line_items/is_baseline when the caller actually sent them --
    // leaves them untouched for any edit coming from a client that doesn't
    // know about these fields yet (e.g. the current ApprovalComposer UI,
    // ahead of Phase 5). Never silently wipe stored line items or the
    // baseline flag just because a request omitted them.
    if (lineItems !== null) {
      updatePayload.line_items = lineItems;
    }

    if (body?.isBaseline !== undefined) {
      const isBaseline = body.isBaseline === true;

      if (isBaseline) {
        // See approvals/create's identical comment: filter status in JS
        // rather than relying on a PostgREST `.not(col, "in", "(a,b)")`
        // filter, which was the actual cause of a 500 here previously.
        const { data: existingBaselineRows, error: baselineCheckError } =
          await supabaseServer
            .from("approval_requests")
            .select("id, status")
            .eq("project_id", approval.project_id)
            .eq("is_baseline", true)
            .neq("id", approvalId);

        if (baselineCheckError) {
          console.error(
            "[approvals/update] baseline uniqueness check error",
            baselineCheckError
          );
          return NextResponse.json(
            { error: "Failed to validate baseline uniqueness." },
            { status: 500 }
          );
        }

        const activeExistingBaseline = (existingBaselineRows || []).find(
          (row) => !INACTIVE_BASELINE_STATUSES.includes(row.status)
        );

        if (activeExistingBaseline) {
          return NextResponse.json(
            { error: "This project already has an active baseline estimate." },
            { status: 409 }
          );
        }

        // Data-hygiene fix (2026-07-27): see approvals/create's identical
        // comment -- clear is_baseline on any declined/expired rows so this
        // approval becomes the sole is_baseline=true row for the project,
        // rather than leaving a stale flag on the old one.
        const inactiveBaselineIds = (existingBaselineRows || [])
          .filter((row) => INACTIVE_BASELINE_STATUSES.includes(row.status))
          .map((row) => row.id);

        if (inactiveBaselineIds.length > 0) {
          const { error: clearOldBaselineError } = await supabaseServer
            .from("approval_requests")
            .update({ is_baseline: false })
            .in("id", inactiveBaselineIds);

          if (clearOldBaselineError) {
            console.error(
              "[approvals/update] failed to clear stale baseline flag",
              clearOldBaselineError
            );
          }
        }
      }

      updatePayload.is_baseline = isBaseline;
    }

    const { data: updatedApproval, error: updateError } = await supabaseServer
      .from("approval_requests")
      .update(updatePayload)
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