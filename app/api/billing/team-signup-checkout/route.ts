import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { getUserOrganizationContext } from "@/lib/organizationAuth";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeTeamPriceId = process.env.STRIPE_TEAM_PRICE_ID;

// Checkout entry point for a brand-new, not-yet-subscribed user choosing "Team" at initial
// signup (Plan Choice screen on /subscribe) - distinct from /api/billing/team-checkout,
// which is for an existing org owner managing/changing an already-created org's billing.
//
// Per the "Signup Flow Redesign and Invite UI" design (Current Implement/ in the Obsidian
// vault): organization creation is deferred until the Stripe webhook confirms payment, so
// this route does NOT call /api/organization/create. It only creates a Checkout Session,
// passing the chosen team name through as subscription metadata
// (pending_organization_name) for the webhook to read once payment succeeds. If checkout is
// abandoned, nothing is ever created - the user can retry this flow cleanly at any time.
//
// No individual-subscription-cancellation/customer-reuse logic here (unlike team-checkout):
// /subscribe already redirects any user with an active individual or org subscription
// straight to /dashboard before this screen is ever reachable, so by construction anyone
// hitting this route has no existing billing to migrate.
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

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "Missing team name." }, { status: 400 });
    }

    // This route is only for users with no organization yet - an existing member/owner
    // should use the existing-org team-checkout or portal routes instead.
    const existingContext = await getUserOrganizationContext(user.id);
    if (existingContext) {
      return NextResponse.json(
        { error: "You already belong to an organization." },
        { status: 409 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

    const params = new URLSearchParams();
    params.append("mode", "subscription");
    params.append("payment_method_types[0]", "card");
    params.append("line_items[0][price]", stripeTeamPriceId);
    params.append("line_items[0][quantity]", "1");
    params.append("client_reference_id", user.id);
    params.append("metadata[billing_owner_id]", user.id);
    params.append("metadata[pending_organization_name]", name);
    // Always trial-eligible: no organization (and therefore no organization_subscriptions
    // row) can possibly exist yet for a brand-new signup, so this is definitionally the
    // first team subscription for this org-to-be.
    params.append("subscription_data[trial_period_days]", "30");
    params.append("subscription_data[metadata][billing_owner_id]", user.id);
    params.append(
      "subscription_data[metadata][pending_organization_name]",
      name
    );
    // 2026-08-06: routed through /checkout-return -- see
    // lib/capacitorCheckout.ts and app/api/billing/checkout/route.ts's
    // matching comment for the full explanation. dest carries the real
    // destination (/dashboard on success, back to /subscribe on cancel),
    // exactly as these two URLs did before this change.
    params.append(
      "success_url",
      `${appUrl}/checkout-return?dest=%2Fdashboard&billing=success&team=welcome`
    );
    params.append(
      "cancel_url",
      `${appUrl}/checkout-return?dest=%2Fsubscribe&billing=cancelled`
    );

    // Always a fresh customer - by construction (see comment above) a user reaching this
    // route has no existing Stripe customer worth reusing.
    if (user.email) {
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
          error: "Stripe team signup checkout failed",
          status: stripeRes.status,
          bodyPreview: text.slice(0, 500),
        },
        { status: 500 }
      );
    }

    const session = JSON.parse(text);

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("Billing team signup checkout failed", e);

    return NextResponse.json(
      {
        error: e?.message ?? "Team signup checkout failed",
        name: e?.name ?? null,
      },
      { status: 500 }
    );
  }
}
