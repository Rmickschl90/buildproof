import { supabaseServer } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import {
  getUserOrganizationContext,
  canUserManageOrganization,
} from "@/lib/organizationAuth";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeTeamPriceId = process.env.STRIPE_TEAM_PRICE_ID;

const ACTIVE_STATUSES = ["active", "trialing"];

export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    if (!stripeSecretKey || !stripeTeamPriceId) {
      return NextResponse.json(
        { error: "Stripe team checkout is not configured" },
        { status: 500 }
      );
    }

    const context = await getUserOrganizationContext(user.id);
    if (!context) {
      return NextResponse.json(
        { error: "You do not belong to an organization." },
        { status: 403 }
      );
    }

    const canManage = await canUserManageOrganization(
      user.id,
      context.organizationId
    );
    if (!canManage) {
      return NextResponse.json(
        { error: "Only the organization owner can manage billing." },
        { status: 403 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    // 2026-08-06: see lib/capacitorCheckout.ts's withNativeFlag() comment.
    const isNativeRequest = req.nextUrl.searchParams.get("platform") === "native";
    const nativeSuffix = isNativeRequest ? "&native=1" : "";

    const { data: existingOrgSubscription, error: orgSubscriptionLookupError } =
      await supabaseServer
        .from("organization_subscriptions")
        .select("id")
        .eq("organization_id", context.organizationId)
        .maybeSingle();

    if (orgSubscriptionLookupError) {
      return NextResponse.json(
        { error: "Unable to verify trial eligibility" },
        { status: 500 }
      );
    }

    const isTrialEligible = !existingOrgSubscription;

    // Per Phase 6 design decision: no state where a user pays both individually and
    // for a team simultaneously. If the owner has an active/trialing individual
    // subscription, cancel it immediately, BEFORE creating the team checkout session,
    // so there's never a window where both could be active at once. Cancellation uses
    // Stripe's proration credit option (prorate=true, no invoice_now) rather than a
    // bare cancellation, per Additional Decision #2 (resolved 2026-07-17): any unused
    // paid time becomes a credit balance that applies automatically to the next
    // invoice - which will be the new team subscription's first invoice.
    const { data: existingIndividualSubscription, error: individualLookupError } =
      await supabaseServer
        .from("user_subscriptions")
        .select("stripe_customer_id,stripe_subscription_id,status")
        .eq("user_id", user.id)
        .maybeSingle();

    if (individualLookupError) {
      return NextResponse.json(
        { error: "Unable to verify existing individual subscription" },
        { status: 500 }
      );
    }

    if (
      existingIndividualSubscription?.stripe_subscription_id &&
      ACTIVE_STATUSES.includes(existingIndividualSubscription.status)
    ) {
      const cancelParams = new URLSearchParams();
      cancelParams.append("prorate", "true");

      const cancelRes = await fetch(
        `https://api.stripe.com/v1/subscriptions/${existingIndividualSubscription.stripe_subscription_id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: cancelParams.toString(),
        }
      );

      if (!cancelRes.ok) {
        const cancelErrorText = await cancelRes.text();

        // Added 2026-08-27: found via a real, reproducible failure on the
        // App Review demo account (rmickschl23@gmail.com) -- its
        // user_subscriptions row still pointed at a Stripe subscription ID
        // that no longer exists in Stripe at all (confirmed directly via
        // the Stripe dashboard: "No such subscription"). This row was
        // stale (last updated 2026-06-22, long before this session), most
        // likely from an earlier manual cancellation or test cleanup that
        // never round-tripped back through the webhook to update/clear
        // this row. Previously ANY non-2xx from Stripe's cancel call hard-
        // failed the entire team-upgrade flow, even when the real reason
        // was "there's nothing left to cancel" -- which is a fine outcome,
        // not an error, since the intent (no active individual subscription
        // standing in the way of the team subscription) is already true.
        // Only this specific, unambiguous Stripe error code is treated as
        // non-fatal; any other cancellation failure still hard-fails exactly
        // as before, since those could reflect a real problem (auth error,
        // rate limit, etc.) worth surfacing rather than silently ignoring.
        let isAlreadyGone = false;
        try {
          const parsed = JSON.parse(cancelErrorText);
          isAlreadyGone = parsed?.error?.code === "resource_missing";
        } catch {
          // Non-JSON body -- fall through, isAlreadyGone stays false.
        }

        if (!isAlreadyGone) {
          return NextResponse.json(
            {
              error: "Failed to cancel existing individual subscription",
              status: cancelRes.status,
              bodyPreview: cancelErrorText.slice(0, 500),
            },
            { status: 500 }
          );
        }

        console.log(
          `[billing/team-checkout] Individual subscription ${existingIndividualSubscription.stripe_subscription_id} already gone in Stripe (resource_missing) -- treating as already-canceled and proceeding with team checkout for user ${user.id}.`
        );
      }
    }

    const params = new URLSearchParams();
    params.append("mode", "subscription");
    params.append("payment_method_types[0]", "card");
    params.append("line_items[0][price]", stripeTeamPriceId);
    params.append("line_items[0][quantity]", "1");
    params.append("client_reference_id", context.organizationId);
    params.append("metadata[organization_id]", context.organizationId);
    params.append("metadata[billing_owner_id]", user.id);
    if (isTrialEligible) {
      params.append("subscription_data[trial_period_days]", "30");
      // No-card free trial (2026-08-13) -- see the matching comment in
      // app/api/billing/checkout/route.ts and "No-Card Free Trial -
      // Implementation Plan.md" in the Obsidian vault for the full
      // reasoning.
      params.append("payment_method_collection", "if_required");
      params.append(
        "subscription_data[trial_settings][end_behavior][missing_payment_method]",
        "cancel"
      );
    }
    params.append(
      "subscription_data[metadata][organization_id]",
      context.organizationId
    );
    params.append("subscription_data[metadata][billing_owner_id]", user.id);
    // 2026-08-06: routed through /checkout-return -- see
    // lib/capacitorCheckout.ts and app/api/billing/checkout/route.ts's
    // matching comment for the full explanation.
    params.append(
      "success_url",
      `${appUrl}/checkout-return?dest=%2Fdashboard&billing=success${nativeSuffix}`
    );
    params.append(
      "cancel_url",
      `${appUrl}/checkout-return?dest=%2Fdashboard&billing=cancelled${nativeSuffix}`
    );

    // Reuse the owner's existing Stripe customer when one exists, rather than
    // customer_email (which creates a brand new Customer object). This matters
    // beyond tidiness: if an individual subscription was just cancelled above with
    // a proration credit, that credit lives on the OLD customer object - a new
    // Checkout customer would never see it, and the credit would be orphaned
    // instead of applying to this team subscription's first invoice.
    if (existingIndividualSubscription?.stripe_customer_id) {
      params.append("customer", existingIndividualSubscription.stripe_customer_id);
    } else if (user.email) {
      params.append("customer_email", user.email);
    }

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const text = await stripeRes.text();

    if (!stripeRes.ok) {
      return NextResponse.json(
        {
          error: "Stripe team checkout failed",
          status: stripeRes.status,
          bodyPreview: text.slice(0, 500),
        },
        { status: 500 }
      );
    }

    const session = JSON.parse(text);

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("Billing team checkout failed", e);

    return NextResponse.json(
      {
        error: e?.message ?? "Team checkout failed",
        name: e?.name ?? null,
      },
      { status: 500 }
    );
  }
}
