import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseServer } from "@/lib/supabaseServer";
import { getUserOrganizationContext } from "@/lib/organizationAuth";

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

async function upsertOrganizationSubscription(
  subscription: Stripe.Subscription,
  organizationIdOverride?: string
) {
  const sub = subscription as any;

  // organizationIdOverride is passed by createOrganizationFromSignupAndUpsertSubscription
  // for first-time Team signups, where the organization didn't exist yet when the
  // Checkout Session was created - so subscription.metadata never carries organization_id
  // in that case (see that function for the full first-time-signup path).
  const organizationId = organizationIdOverride ?? subscription.metadata?.organization_id;
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

// Best-effort promotion of a first-time-signup subscription's Stripe metadata to carry
// organization_id, once the organization actually exists. Without this, every future event
// for this subscription's entire lifetime (renewals, trial-ending, cancellation, plan
// changes) would keep arriving with the original pending_organization_name/no-organization_id
// shape, perpetually routing through createOrganizationFromSignupAndUpsertSubscription
// instead of the normal upsertOrganizationSubscription branch every other org subscription
// uses. That's not incorrect on its own (getUserOrganizationContext reuse makes it
// idempotent), but it means correctness for the rest of this subscription's life depends on
// that lookup never transiently failing - getUserOrganizationContext swallows errors as "no
// org found," which would otherwise risk creating a duplicate organization on some future
// event for an already-onboarded, paying team. Deliberately non-fatal: failure here is logged
// but never thrown, so it can never turn an otherwise-successful subscription/org creation
// into a Stripe-visible failed webhook delivery.
async function promoteSubscriptionMetadataToOrganizationId(
  subscriptionId: string,
  organizationId: string
) {
  if (!stripeSecretKey) return;

  try {
    const params = new URLSearchParams();
    params.append("metadata[organization_id]", organizationId);

    const res = await fetch(
      `https://api.stripe.com/v1/subscriptions/${subscriptionId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error(
        "[stripe/webhook] failed to promote subscription metadata with organization_id",
        subscriptionId,
        organizationId,
        text
      );
    }
  } catch (e) {
    console.error(
      "[stripe/webhook] error promoting subscription metadata with organization_id",
      subscriptionId,
      organizationId,
      e
    );
  }
}

// Handles first-time Team signup (see "Signup Flow Redesign and Invite UI" design doc,
// Current Implement/ in the Obsidian vault). Organization creation is deliberately deferred
// until this webhook fires with a confirmed real payment - the checkout session for a
// brand-new Team signup is created before any organization exists, so it carries
// subscription.metadata.pending_organization_name + billing_owner_id instead of
// organization_id. If checkout is abandoned, nothing is ever created here - no orphaned org.
//
// Idempotency: reuses getUserOrganizationContext(billingOwnerId) as the guard rather than
// a new DB transaction/migration, since "one org per user" is already the locked V1 rule
// enforced at the application layer everywhere else in this codebase. A full webhook retry
// after success finds the existing org via context and skips straight to the (idempotent,
// unique(stripe_subscription_id)) subscription upsert below. A retry after a partial failure
// (org + membership created, but the subscription row not yet written) also finds the
// existing org via context and just writes the missing subscription row, rather than
// creating a second organization.
//
// Known accepted gap (flagged, not fixed, per discussion): organization_members only has
// unique(organization_id, user_id), not unique(user_id) - so two genuinely concurrent
// webhook deliveries for the same brand-new user (e.g. two tabs completing checkout at
// nearly the same instant) could both pass the getUserOrganizationContext check before
// either writes, producing two organizations for one user. Treated as a low-probability V1
// edge case, same as other flagged known gaps in this project, not worth a new migration.
async function createOrganizationFromSignupAndUpsertSubscription(
  subscription: Stripe.Subscription
) {
  const billingOwnerId = subscription.metadata?.billing_owner_id;
  if (!billingOwnerId) {
    throw new Error("Missing subscription metadata.billing_owner_id");
  }

  const pendingOrganizationName = subscription.metadata?.pending_organization_name;
  if (!pendingOrganizationName) {
    throw new Error("Missing subscription metadata.pending_organization_name");
  }

  let organizationId: string;

  const existingContext = await getUserOrganizationContext(billingOwnerId);

  if (existingContext) {
    // Guards against a narrow but real race: the user started this Team checkout while
    // orgless (enforced by team-signup-checkout's own guard at session-creation time), then
    // joined a DIFFERENT organization as a member (e.g. accepted an unrelated invite in
    // another tab) before completing payment. Without this check, this branch would
    // silently attach the new paid subscription to that unrelated org via
    // upsertOrganizationSubscription's onConflict: organization_id, overwriting its real
    // billing_owner_id/subscription data. Only reuse the existing org if this user is
    // actually its owner - i.e. this really is the same signup being retried/re-delivered,
    // not a different org they merely joined in the meantime.
    if (existingContext.role !== "owner") {
      throw new Error(
        `User ${billingOwnerId} already belongs to a different organization as a non-owner member; refusing to attach a new Team subscription to it.`
      );
    }

    organizationId = existingContext.organizationId;
  } else {
    const { data: organization, error: orgError } = await supabaseServer
      .from("organizations")
      .insert({ name: pendingOrganizationName, owner_id: billingOwnerId })
      .select("id")
      .single();

    if (orgError || !organization) {
      throw new Error(
        orgError?.message ?? "Failed to create organization from signup"
      );
    }

    const { error: memberError } = await supabaseServer
      .from("organization_members")
      .insert({
        organization_id: organization.id,
        user_id: billingOwnerId,
        role: "owner",
      });

    if (memberError) {
      // Compensating cleanup, same pattern as /api/organization/create's insert path -
      // don't leave an orphaned organization with no owner membership behind.
      const { error: cleanupError } = await supabaseServer
        .from("organizations")
        .delete()
        .eq("id", organization.id);

      if (cleanupError) {
        console.error(
          "[stripe/webhook] failed to clean up orphaned organization",
          cleanupError
        );
      }

      throw new Error(memberError.message);
    }

    organizationId = organization.id;
  }

  await upsertOrganizationSubscription(subscription, organizationId);
  await promoteSubscriptionMetadataToOrganizationId(subscription.id, organizationId);
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
      } else if (subscription.metadata?.pending_organization_name) {
        await createOrganizationFromSignupAndUpsertSubscription(subscription);
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
