import { supabaseServer } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripePriceId = process.env.STRIPE_PRICE_ID;

export async function POST(req: NextRequest) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (errorResponse) return errorResponse;

    if (!stripeSecretKey || !stripePriceId) {
      return NextResponse.json(
        { error: "Stripe checkout is not configured" },
        { status: 500 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    // 2026-08-06: see lib/capacitorCheckout.ts's withNativeFlag() comment --
    // this has to be read from a query param set at checkout-initiation
    // time, not re-detected on the bridge page, since /checkout-return runs
    // inside a Chrome Custom Tab that has no Capacitor JS bridge.
    const isNativeRequest = req.nextUrl.searchParams.get("platform") === "native";
    const nativeSuffix = isNativeRequest ? "&native=1" : "";

    const { data: existingSubscription, error: subscriptionLookupError } =
      await supabaseServer
        .from("user_subscriptions")
        .select("id,trial_start,trial_end,stripe_subscription_id,status")
        .eq("user_id", user.id)
        .maybeSingle();

    if (subscriptionLookupError) {
      return NextResponse.json(
        { error: "Unable to verify trial eligibility" },
        { status: 500 }
      );
    }

    const isTrialEligible = !existingSubscription;

    const params = new URLSearchParams();
    params.append("mode", "subscription");
    params.append("payment_method_types[0]", "card");
    params.append("line_items[0][price]", stripePriceId);
    params.append("line_items[0][quantity]", "1");
    params.append("client_reference_id", user.id);
    params.append("metadata[user_id]", user.id);
    if (isTrialEligible) {
      params.append("subscription_data[trial_period_days]", "30");
      // No-card free trial (2026-08-13): skip requiring a payment method
      // upfront during the trial -- see "No-Card Free Trial -
      // Implementation Plan.md" in the Obsidian vault for the full
      // reasoning (cold ad clicks converting at 0% with a card gate in
      // front of them was the trigger). If the trial ends and the
      // customer never added a card, cancel rather than pause -- this
      // repo's existing billing enforcement only ever checks Stripe
      // subscription `status`, and a canceled subscription already
      // produces a status this app correctly understands with zero new
      // code, unlike an untested `paused` status.
      params.append("payment_method_collection", "if_required");
      params.append(
        "subscription_data[trial_settings][end_behavior][missing_payment_method]",
        "cancel"
      );
    }
    params.append("subscription_data[metadata][user_id]", user.id);
    // 2026-08-06: routed through /checkout-return (not straight to
    // /dashboard) so native Android checkout can hand back into the app
    // instead of getting stranded in the system browser -- see
    // lib/capacitorCheckout.ts for the full explanation. No effect on web.
    params.append(
      "success_url",
      `${appUrl}/checkout-return?dest=%2Fdashboard&billing=success${nativeSuffix}`
    );
    params.append(
      "cancel_url",
      `${appUrl}/checkout-return?dest=%2Fdashboard&billing=cancelled${nativeSuffix}`
    );

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
          error: "Stripe checkout failed",
          status: stripeRes.status,
          bodyPreview: text.slice(0, 500),
        },
        { status: 500 }
      );
    }

    const session = JSON.parse(text);

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("Billing checkout failed", e);

    return NextResponse.json(
      {
        error: e?.message ?? "Checkout failed",
        name: e?.name ?? null,
      },
      { status: 500 }
    );
  }
}

