import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  getUserOrganizationContext,
  canUserManageOrganization,
} from "@/lib/organizationAuth";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

const ACTIVE_STATUSES = ["active", "trialing"];

// "Cancel Team & Return to Solo" -- owner-only.
//
// Deliberately does NOT touch the owner's own organization_members row, or the
// organizations row itself. A DB trigger from the Phase 1 migration
// (prevent_owner_removal_from_organization_members) hard-blocks ever soft-
// removing or deleting the owner's own membership row -- "no ownership-transfer
// feature exists in V1" is a deliberate, locked constraint, not an oversight.
// Rather than relaxing that trigger (a protected, already-tested system), this
// route works around it: individual billing (user_subscriptions) is a fully
// separate table from org membership, and GET /api/billing/status already
// checks individual status before org status. So the owner can immediately buy
// an Individual plan after dissolving and be fully functional solo again, while
// their organization_members/organizations rows stay inert in the DB
// (invisible to them, and available again if they ever resume Team billing on
// the same org later instead of starting a brand new one).
//
// What this route actually does:
//   1. Cancel the org's Stripe subscription (if one exists and is active/trialing).
//   2. Reassign every org project to the owner individually
//      (organization_id = null, user_id = owner's user id) -- per explicit
//      product decision: the paying business owner keeps the records, not
//      whichever member happened to create a given project.
//   3. Soft-remove every NON-owner organization_members row (removed_at = now()).
//      The owner's own row is excluded from this update entirely, so the
//      trigger above is never even invoked.
//   4. organizations and organization_subscriptions rows are left untouched
//      (soft-delete/historical convention, same as every other table in this
//      schema -- archived_at, revoked_at, removed_at, never a hard delete).
//
// Known, accepted gap: cancellation uses prorate=true (consistent with the
// existing individual-to-team cancellation in POST /api/billing/team-checkout),
// but unlike that route, this one does not attempt to carry the resulting
// Stripe credit balance forward into a future individual checkout (that would
// require /api/billing/checkout to know about and reuse the org's Stripe
// customer id, which it does not today). Any credit sits on the org's Stripe
// customer object and may go unused if the owner's next individual checkout
// creates a new customer. Not blocking -- documented, same posture as other
// accepted V1 gaps.
export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const context = await getUserOrganizationContext(user.id);
    if (!context) {
      return NextResponse.json(
        { error: "You do not belong to an organization." },
        { status: 403 }
      );
    }

    const canManage = await canUserManageOrganization(user.id, context.organizationId);
    if (!canManage) {
      return NextResponse.json(
        { error: "Only the organization owner can dissolve the organization." },
        { status: 403 }
      );
    }

    const { data: organization, error: orgError } = await supabaseServer
      .from("organizations")
      .select("id, name")
      .eq("id", context.organizationId)
      .single();

    if (orgError || !organization) {
      console.error("[organization/dissolve] organization fetch error", orgError);
      return NextResponse.json(
        { error: "Failed to load organization." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const confirmName = String(body?.confirmName ?? "").trim();

    if (!confirmName) {
      return NextResponse.json(
        { error: "Missing confirmName." },
        { status: 400 }
      );
    }

    if (confirmName !== organization.name) {
      return NextResponse.json(
        { error: "Organization name confirmation does not match." },
        { status: 400 }
      );
    }

    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Stripe is not configured" },
        { status: 500 }
      );
    }

    const { data: orgSubscription, error: subLookupError } = await supabaseServer
      .from("organization_subscriptions")
      .select("stripe_subscription_id, status")
      .eq("organization_id", organization.id)
      .maybeSingle();

    if (subLookupError) {
      console.error("[organization/dissolve] subscription lookup error", subLookupError);
      return NextResponse.json(
        { error: "Failed to check organization billing." },
        { status: 500 }
      );
    }

    if (
      orgSubscription?.stripe_subscription_id &&
      ACTIVE_STATUSES.includes(orgSubscription.status)
    ) {
      const cancelParams = new URLSearchParams();
      cancelParams.append("prorate", "true");

      const cancelRes = await fetch(
        `https://api.stripe.com/v1/subscriptions/${orgSubscription.stripe_subscription_id}`,
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
        console.error("[organization/dissolve] Stripe cancel failed", cancelErrorText);

        return NextResponse.json(
          {
            error: "Failed to cancel organization subscription",
            status: cancelRes.status,
            bodyPreview: cancelErrorText.slice(0, 500),
          },
          { status: 500 }
        );
      }
    }

    const { error: reassignError } = await supabaseServer
      .from("projects")
      .update({ organization_id: null, user_id: user.id })
      .eq("organization_id", organization.id);

    if (reassignError) {
      console.error("[organization/dissolve] project reassignment error", reassignError);
      return NextResponse.json(
        {
          error:
            "Billing was cancelled, but reassigning projects failed. Contact support before retrying.",
        },
        { status: 500 }
      );
    }

    const { error: removeMembersError } = await supabaseServer
      .from("organization_members")
      .update({ removed_at: new Date().toISOString() })
      .eq("organization_id", organization.id)
      .neq("user_id", user.id)
      .is("removed_at", null);

    if (removeMembersError) {
      console.error("[organization/dissolve] member removal error", removeMembersError);
      return NextResponse.json(
        {
          error:
            "Billing was cancelled and projects were reassigned, but removing members failed. Contact support before retrying.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[organization/dissolve] unexpected error", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
