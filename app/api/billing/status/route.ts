import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { requireUser } from "@/lib/requireUser";
import { getUserOrganizationContext } from "@/lib/organizationAuth";

export const runtime = "nodejs";

const ACTIVE_STATUSES = ["active", "trialing"];

export async function GET(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    const { data, error } = await supabaseServer
      .from("user_subscriptions")
      .select(
        "status,current_period_end,cancel_at_period_end,stripe_customer_id,stripe_subscription_id"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Unable to load billing status" },
        { status: 500 }
      );
    }

    const individualActive = Boolean(
      data?.status && ACTIVE_STATUSES.includes(data.status)
    );

    // Access is granted if EITHER the individual OR the organization subscription is
    // active/trialing - extends the existing individual-only check rather than replacing
    // it, per the Phase 6 design. Only reached at all when the user belongs to an org;
    // users with no organization keep the exact same response as before this change.
    let orgActive = false;
    let orgData: {
      status: string | null;
      current_period_end: string | null;
      cancel_at_period_end: boolean | null;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
    } | null = null;

    const context = await getUserOrganizationContext(user.id);
    if (context) {
      const { data: orgSubscription, error: orgError } = await supabaseServer
        .from("organization_subscriptions")
        .select(
          "status,current_period_end,cancel_at_period_end,stripe_customer_id,stripe_subscription_id"
        )
        .eq("organization_id", context.organizationId)
        .maybeSingle();

      if (orgError) {
        return NextResponse.json(
          { error: "Unable to load organization billing status" },
          { status: 500 }
        );
      }

      orgData = orgSubscription;
      orgActive = Boolean(
        orgData?.status && ACTIVE_STATUSES.includes(orgData.status)
      );
    }

    const source: "individual" | "organization" | null = individualActive
      ? "individual"
      : orgActive
        ? "organization"
        : null;

    // When the organization is what's actually granting access, every field below
    // reflects the org subscription instead - an org-only user may have no individual
    // subscription row at all, so falling back to individual data here would report
    // hasStripeSubscription: false etc. alongside an "active" status. Individual and
    // null sources keep the exact same fields/values as before this change.
    const effectiveStatus =
      source === "organization" ? orgData?.status : data?.status || "inactive";
    const currentPeriodEnd =
      source === "organization"
        ? orgData?.current_period_end || null
        : data?.current_period_end || null;
    const cancelAtPeriodEnd =
      source === "organization"
        ? orgData?.cancel_at_period_end || false
        : data?.cancel_at_period_end || false;
    const hasStripeCustomer =
      source === "organization"
        ? Boolean(orgData?.stripe_customer_id)
        : Boolean(data?.stripe_customer_id);
    const hasStripeSubscription =
      source === "organization"
        ? Boolean(orgData?.stripe_subscription_id)
        : Boolean(data?.stripe_subscription_id);

    return NextResponse.json({
      status: effectiveStatus,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      hasStripeCustomer,
      hasStripeSubscription,
      source,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Billing status failed" },
      { status: 500 }
    );
  }
}
