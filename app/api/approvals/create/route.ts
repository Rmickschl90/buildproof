import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import { canUserAccessProject } from "@/lib/organizationAuth";

const ALLOWED_TYPES = [
  "change_order",
  "scope",
  "material",
  "schedule",
  "general",
] as const;

// Statuses that no longer count as an "active" baseline occupying a project's
// one-baseline slot -- a declined or expired baseline shouldn't permanently
// block a contractor from submitting a new one. See the Phase 2 migration's
// own header for why this is an application-layer check, not a DB constraint.
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

    // line_total is computed server-side, never trusted from the client --
    // protects the stored historical record from client-side rounding bugs
    // or drift. See the Phase 2 migration's header.
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

    const { items: lineItems, error: lineItemsError } = normalizeLineItems(
      body?.lineItems
    );

    if (lineItemsError) {
      return NextResponse.json({ error: lineItemsError }, { status: 400 });
    }

    const isBaseline = body?.isBaseline === true;

    let creatingUserId =
      typeof body?.creatingUserId === "string" && body.creatingUserId
        ? body.creatingUserId
        : user.id;

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
      .select("id, client_email")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }

    if (!(await canUserAccessProject(user.id, projectId))) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    // A client-supplied creatingUserId is only trusted if that user genuinely has
    // access to this project (individual owner or active org member) - otherwise it
    // falls back to the authenticated caller, same as the "missing" case.
    if (
      creatingUserId !== user.id &&
      !(await canUserAccessProject(creatingUserId, projectId))
    ) {
      creatingUserId = user.id;
    }

    const projectClientEmail =
      typeof project.client_email === "string"
        ? project.client_email.trim().toLowerCase()
        : "";

    const recipientSource =
      projectClientEmail && recipientEmail === projectClientEmail
        ? "project"
        : "custom";

    if (isBaseline) {
      // Fetch any is_baseline rows for this project and filter status in JS
      // rather than pushing a `.not(col, "in", "(a,b)")` filter down to
      // PostgREST -- at most a handful of rows per project in practice, and
      // this sidesteps any PostgREST in-list syntax/quoting pitfalls
      // entirely (this is what caused a 500 here previously).
      const { data: existingBaselineRows, error: baselineCheckError } =
        await supabaseServer
          .from("approval_requests")
          .select("id, status")
          .eq("project_id", projectId)
          .eq("is_baseline", true);

      if (baselineCheckError) {
        console.error(
          "[approvals/create] baseline uniqueness check error",
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
    }

    const insertPayload: Record<string, unknown> = {
      project_id: projectId,
      created_by: creatingUserId,
      title,
      approval_type: approvalType,
      description,
      recipient_name: recipientName,
      recipient_email: recipientEmail,
      recipient_source: recipientSource,
      cost_delta: costDelta,
      schedule_delta: scheduleDelta,
      due_at: dueAt,
      status: "draft",
      created_timezone_id: createdTimezoneId,
      created_timezone_offset_minutes: createdTimezoneOffsetMinutes,
    };

    // Only set line_items/is_baseline when the caller actually sent them --
    // otherwise let the column defaults ('[]'::jsonb, false) apply naturally,
    // same conditional-inclusion pattern used in approvals/update.
    if (lineItems !== null) {
      insertPayload.line_items = lineItems;
    }

    if (body?.isBaseline !== undefined) {
      insertPayload.is_baseline = isBaseline;
    }

    const { data: approval, error: insertError } = await supabaseServer
      .from("approval_requests")
      .insert(insertPayload)
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