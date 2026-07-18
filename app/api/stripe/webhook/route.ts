import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      maxNetworkRetries: 0,
    })
  : null;

function toIsoFromStripeTimestamp(value: number | null | undefined) {
  return value ? new Date(value * 1000).toISOString() : null;
}

async function upsertSubscription(subscription: Stripe.Subscription) {
  const sub = subscription as any;

  const userId = subscription.metadata?.user_id;
  if (!userId) {
    throw new Error("Missing subscription metadata.user_id");
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const priceId = subscription.items.data[0]?.price?.id ?? null;

  const { error } = await supabaseServer
    .from("user_subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        status: subscription.status,
        current_period_start: toIsoFromStripeTimestamp(
          sub.current_period_start
        ),
        current_period_end: toIsoFromStripeTimestamp(sub.current_period_end),
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: toIsoFromStripeTimestamp(sub.canceled_at),
        trial_start: toIsoFromStripeTimestamp(sub.trial_start),
        trial_end: toIsoFromStripeTimestamp(sub.trial_end),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "stripe_subscription_id",
      }
    );

  if (error) {
    throw new Error(error.message);
  }
}

async function upsertOrganizationSubscription(subscription: Stripe.Subscription) {
  const sub = subscription as any;

  const organizationId = subscription.metadata?.organization_id;
  if (!organizationId) {
    throw new Error("Missing subscription metadata.organization_id");
  }

  const billingOwnerId = subscription.metadata?.billing_owner_id;
  if (!billingOwnerId) {
    throw new Error("Missing subscription metadata.billing_owner_id");
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const priceId = subscription.items.data[0]?.price?.id ?? null;

  // onConflict targets organization_id, not stripe_subscription_id (unlike
  // upsertSubscription above) - organization_subscriptions has a unique(organization_id)
  // constraint (one subscription per org), and the subscription id itself can change over
  // a cancel/resubscribe cycle. Targeting stripe_subscription_id here would let a changed
  // subscription id slip past onConflict and attempt an INSERT that then collides with the
  // unrelated unique(organization_id) constraint instead of gracefully updating the
  // existing row - a real failure mode for a webhook handler Stripe will keep retrying.
  const { error } = await supabaseServer
    .from("organization_subscriptions")
    .upsert(
      {
        organization_id: organizationId,
        billing_owner_id: billingOwnerId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        status: subscription.status,
        current_period_start: toIsoFromStripeTimestamp(
          sub.current_period_start
        ),
        current_period_end: toIsoFromStripeTimestamp(sub.current_period_end),
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: toIsoFromStripeTimestamp(sub.canceled_at),
        trial_start: toIsoFromStripeTimestamp(sub.trial_start),
        trial_end: toIsoFromStripeTimestamp(sub.trial_end),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "organization_id",
      }
    );

  if (error) {
    throw new Error(error.message);
  }
}

export async function POST(req: Request) {
  if (!stripe || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook not configured" },
      { status: 500 }
    );
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err.message}` },
      { status: 400 }
    );
  }

  try {
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;

      if (subscription.metadata?.organization_id) {
        await upsertOrganizationSubscription(subscription);
      } else {
        await upsertSubscription(subscription);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Webhook processing failed" },
      { status: 500 }
    );
  }
}

