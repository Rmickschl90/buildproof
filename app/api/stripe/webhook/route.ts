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

  // Added 2026-08-25, found via real behavioral testing of the new
  // self-service account-deletion route (POST /api/account/delete): that
  // route synchronously cancels the user's Stripe subscription and
  // deletes their user_subscriptions row as part of a real account
  // deletion, then deletes the auth.users row itself. But Stripe's
  // resulting customer.subscription.updated/deleted webhook event
  // arrives asynchronously, sometimes after the deletion request has
  // already finished -- and without this guard, this upsert would
  // silently RE-CREATE a user_subscriptions row for a user_id that no
  // longer exists in auth.users, leaving a genuinely orphaned billing
  // record behind (confirmed happening on staging: a canceled-status row
  // for a just-deleted test account, timestamped seconds after the
  // deletion). Since there's no foreign key from user_subscriptions.user_id
  // to auth.users (confirmed via pg_constraint while building the
  // deletion route -- not every user-referencing column in this schema is
  // FK-enforced), Postgres itself would not have caught this. A no-op
  // here for a genuinely deleted user is always correct: there is no
  // account left for this billing state to matter to, and the event
  // isn't retried as a failure -- Stripe's webhook just gets a normal
  // success response, since silently skipping is the correct behavior,
  // not an error condition.
  const { data: userLookup, error: userLookupError } =
    await supabaseServer.auth.admin.getUserById(userId);

  if (userLookupError || !userLookup?.user) {
    console.log(
      `[stripe/webhook] Skipping user_subscriptions upsert for deleted/nonexistent user_id ${userId} (subscription ${subscription.id})`
    );
    return;
  }

  // No-card free trial (2026-08-13): onConflict targets user_id, not
  // stripe_subscription_id. user_subscriptions has a unique(user_id)
  // constraint (one subscription per individual), and the subscription id
  // itself changes across a cancel/resubscribe cycle -- which is now a
  // normal, expected path (trial lapses with no card -> cancel -> user
  // returns later and starts a real paid subscription with a brand-new
  // Stripe subscription id). Targeting stripe_subscription_id here let a
  // changed subscription id slip past onConflict and attempt an INSERT
  // that then collided with the unrelated unique(user_id) constraint
  // instead of updating the existing row -- a real 500/retry failure mode,
  // caught behaviorally testing this exact scenario on staging. Mirrors
  // the fix already applied to upsertOrganizationSubscription below
  // (targets organization_id, same reasoning) -- that function had this
  // right already; this one never got the matching fix until now.
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
        onConflict: "user_id",
      }
    );

  if (error) {
    throw new Error(error.message);
  }
}

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || process.env.RESEND_FROM_EMAIL || "";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://app.getleeward.com").replace(
  /\/+$/,
  ""
);

// No-card free trial (2026-08-13): Stripe fires this event ~3 days before
// a trial ends, for every trial regardless of whether a card is on file.
// Only send the reminder when there's genuinely no payment method yet --
// legacy subscriptions from before this change (or a future reversion,
// see "No-Card Free Trial - Implementation Plan.md" in the Obsidian
// vault) already have a card and don't need this email. Best-effort and
// non-fatal by design, same pattern as this repo's other fire-and-forget
// notification calls -- a failure here must never make the webhook
// itself fail/retry, since the subscription upsert above is the part
// that actually matters for billing correctness.
async function sendTrialEndingReminderIfNoPaymentMethod(
  subscription: Stripe.Subscription
) {
  try {
    if (!stripe || !RESEND_API_KEY || !RESEND_FROM) return;

    if (subscription.default_payment_method) return;

    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;

    const customer = await stripe.customers.retrieve(customerId);
    if (!customer || (customer as any).deleted) return;

    const email = (customer as Stripe.Customer).email;
    if (!email) return;

    const invoiceSettingsDefaultPm = (customer as Stripe.Customer)
      .invoice_settings?.default_payment_method;
    if (invoiceSettingsDefaultPm) return;

    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null;
    const trialEndText = trialEnd
      ? trialEnd.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "in a few days";

    const subject = "Your Leeward trial ends soon";
    // Wording note (2026-08-13): says "end", not "pause" -- this matches the
    // actual Stripe config (subscription_data[trial_settings][end_behavior]
    // [missing_payment_method] = "cancel"), which fully cancels the
    // subscription rather than pausing it. "Pause" was the original wording
    // here but implies something that resumes on its own, which isn't what
    // happens -- caught during behavioral verification of this exact email
    // via a real Resend send. The practical effect for the customer is
    // unchanged either way (access blocked until they check out again, data
    // preserved), so this is a copy fix only, not a behavior change.
    // 2026-08-14: link carries ?billing=manage, which the dashboard's boot
    // effect reads and uses to auto-open the Stripe billing portal once the
    // user is confirmed signed in (see openManageBillingPortal in
    // app/dashboard/page.tsx). Previously this linked to a bare /dashboard
    // with a parenthetical "(click Manage Billing once you're signed in)"
    // instruction -- Ryan flagged that a link reading "Add a payment
    // method" landing on a plain dashboard felt like it didn't do what it
    // said. Sign-in (if needed) still has to happen in between since a
    // static email link can't carry a live session, but the click-through
    // now actually lands on Stripe with no extra manual tap required.
    const manageBillingUrl = `${APP_URL}/dashboard?billing=manage`;
    const text = `Your 30-day Leeward trial ends on ${trialEndText}. No payment method is on file yet, so your access will end automatically at that point unless you add one first.

Add a payment method any time before then: ${manageBillingUrl} (you may need to sign in first).

No action needed if you'd rather let the trial lapse.`;
    const html = `<p>Your 30-day Leeward trial ends on <strong>${trialEndText}</strong>. No payment method is on file yet, so your access will end automatically at that point unless you add one first.</p><p><a href="${manageBillingUrl}">Add a payment method</a> any time before then (you may need to sign in first).</p><p>No action needed if you'd rather let the trial lapse.</p>`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [email],
        subject,
        text,
        html,
      }),
    });
  } catch (err) {
    console.error(
      "[stripe/webhook] trial-ending reminder email failed (non-fatal)",
      err
    );
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

    if (event.type === "customer.subscription.trial_will_end") {
      const subscription = event.data.object as Stripe.Subscription;
      await sendTrialEndingReminderIfNoPaymentMethod(subscription);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Webhook processing failed" },
      { status: 500 }
    );
  }
}
