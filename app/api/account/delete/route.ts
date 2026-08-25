import { NextResponse } from "next/server";
import { requireUser } from "@/lib/requireUser";
import { supabaseServer } from "@/lib/supabaseServer";
import { getUserOrganizationContext } from "@/lib/organizationAuth";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const ACTIVE_STATUSES = ["active", "trialing"];

// Added 2026-08-24 for Apple App Review Guideline 5.1.1(v) (Data Collection
// and Storage: account creation must be paired with self-service account
// deletion). Leeward previously had no way for a user to delete their own
// account at all -- this route is that path, reached from the Account tab.
//
// Deliberately confirm-by-typing-the-account-email (same UX pattern as
// /api/organization/dissolve's confirm-by-typing-the-org-name), since this
// is genuinely irreversible and the UI must warn the user their data is
// gone forever before calling this.
//
// Two locked product decisions (confirmed with Ryan 2026-08-24):
//   1. If the account is an organization owner with other active
//      (non-removed) members, deletion is refused outright -- the owner
//      must remove those members or Dissolve the team first via the
//      existing, already-tested flow. This route never silently kicks
//      teammates out of a shared org as a side effect of one person
//      deleting their own account.
//   2. Deletion is a REAL, full delete of the user's own data -- not a
//      soft-deactivate. Records/entries/attachments/approvals/payments/
//      documents/schedule events they own are permanently removed, not
//      anonymized or retained. This matches what "delete my account"
//      means to a user, and is what Apple's guideline is checking for.
//
// Cascade behavior this route relies on (confirmed directly against
// production via pg_constraint before writing this, not assumed):
//   - Deleting a `projects` row CASCADEs to: proofs, attachments,
//     approval_requests, approval_attachments, project_documents,
//     project_payments, project_schedule_events, project_shares,
//     message_deliveries, send_jobs. So explicitly deleting the relevant
//     `projects` rows below is sufficient to clean up everything under
//     them -- no need to touch those child tables directly.
//   - Deleting the `auth.users` row itself CASCADEs to: organization_members,
//     organization_invites (invited_by), organization_subscriptions
//     (billing_owner_id), approval_requests/attachments/message_deliveries/
//     project_documents/project_payments/project_schedule_events/
//     project_shares (as attribution columns, separate from the
//     project-cascade above), auth.identities/sessions/mfa_factors/etc.
//   - `projects.user_id` and `user_subscriptions.user_id` have NO foreign
//     key to auth.users at all (confirmed via pg_constraint, not every
//     user-referencing column in this schema is FK-enforced) -- so both
//     must be explicitly deleted here, or deleting the auth user would
//     leave them behind as orphaned rows pointing at a user_id that no
//     longer exists.
//   - `organizations.owner_id` -> auth.users is RESTRICT (confdeltype
//     'a', not cascade) -- deleting the auth user while an organizations
//     row still names them as owner_id would fail outright. For the
//     solo-owner-deletes-their-own-account path below, the organization
//     itself (and its now-unreferenced subscription/invites/members/
//     projects) is deleted first, in FK-safe order, before the user.
//
// Known, accepted gap, flagged rather than silently skipped: this does
// NOT enumerate and delete the underlying Supabase Storage objects
// (photos/PDFs in the `attachments` bucket) -- only the database rows
// that reference them. The bucket objects become unreachable (no DB row
// points at them, and RLS/signed-URL access requires a live row), but a
// full storage sweep was judged out of scope for this first compliance
// pass given the time pressure of a second App Store rejection. Worth a
// follow-up pass.
export async function POST(req: Request) {
  try {
    const { user, errorResponse } = await requireUser(req);
    if (!user) return errorResponse;

    const body = await req.json().catch(() => ({}));
    const confirmEmail = String(body?.confirmEmail ?? "").trim().toLowerCase();
    const userEmail = String(user.email ?? "").trim().toLowerCase();

    if (!confirmEmail || confirmEmail !== userEmail) {
      return NextResponse.json(
        { error: "Email confirmation does not match your account email." },
        { status: 400 }
      );
    }

    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Stripe is not configured" },
        { status: 500 }
      );
    }

    const context = await getUserOrganizationContext(user.id);

    // --- Organization owner path -------------------------------------
    if (context?.role === "owner") {
      const { count: otherMemberCount, error: memberCountError } = await supabaseServer
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", context.organizationId)
        .is("removed_at", null)
        .neq("user_id", user.id);

      if (memberCountError) {
        console.error("[account/delete] member count error", memberCountError);
        return NextResponse.json(
          { error: "Failed to check organization membership." },
          { status: 500 }
        );
      }

      if ((otherMemberCount ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              "You're the owner of a team with other active members. Remove them or dissolve your team first (Account > Team), then you can delete your account.",
          },
          { status: 409 }
        );
      }

      // Solo owner (no other members) -- cancel org billing, then delete
      // the organization's own data and the org row itself, in FK-safe
      // order, before falling through to the shared user-data cleanup
      // and the final auth.users deletion below.
      const { data: orgSubscription, error: subLookupError } = await supabaseServer
        .from("organization_subscriptions")
        .select("stripe_subscription_id, status")
        .eq("organization_id", context.organizationId)
        .maybeSingle();

      if (subLookupError) {
        console.error("[account/delete] org subscription lookup error", subLookupError);
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
          console.error("[account/delete] Stripe org cancel failed", cancelErrorText);
          return NextResponse.json(
            { error: "Failed to cancel organization subscription." },
            { status: 500 }
          );
        }
      }

      const { error: deleteOrgProjectsError } = await supabaseServer
        .from("projects")
        .delete()
        .eq("organization_id", context.organizationId);

      if (deleteOrgProjectsError) {
        console.error("[account/delete] org project delete error", deleteOrgProjectsError);
        return NextResponse.json(
          { error: "Failed to delete organization records." },
          { status: 500 }
        );
      }

      await supabaseServer
        .from("organization_subscriptions")
        .delete()
        .eq("organization_id", context.organizationId);

      await supabaseServer
        .from("organization_invites")
        .delete()
        .eq("organization_id", context.organizationId);

      await supabaseServer
        .from("organization_members")
        .delete()
        .eq("organization_id", context.organizationId);

      const { error: deleteOrgError } = await supabaseServer
        .from("organizations")
        .delete()
        .eq("id", context.organizationId);

      if (deleteOrgError) {
        console.error("[account/delete] organization delete error", deleteOrgError);
        return NextResponse.json(
          { error: "Failed to delete organization." },
          { status: 500 }
        );
      }
    }

    // --- Shared cleanup (applies to solo users, org members, and the
    // now-org-free former solo owner from the branch above) -----------

    const { data: individualSubscription, error: subError } = await supabaseServer
      .from("user_subscriptions")
      .select("stripe_subscription_id, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subError) {
      console.error("[account/delete] individual subscription lookup error", subError);
      return NextResponse.json(
        { error: "Failed to check billing." },
        { status: 500 }
      );
    }

    if (
      individualSubscription?.stripe_subscription_id &&
      ACTIVE_STATUSES.includes(individualSubscription.status)
    ) {
      const cancelParams = new URLSearchParams();
      cancelParams.append("prorate", "true");

      const cancelRes = await fetch(
        `https://api.stripe.com/v1/subscriptions/${individualSubscription.stripe_subscription_id}`,
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
        console.error("[account/delete] Stripe individual cancel failed", cancelErrorText);
        return NextResponse.json(
          { error: "Failed to cancel your subscription." },
          { status: 500 }
        );
      }
    }

    await supabaseServer.from("user_subscriptions").delete().eq("user_id", user.id);

    // Individually-owned projects: organization_id null (org-owned ones,
    // if any, were already deleted above via the owner path -- a
    // non-owner member never owns org projects individually).
    const { error: deleteOwnProjectsError } = await supabaseServer
      .from("projects")
      .delete()
      .eq("user_id", user.id)
      .is("organization_id", null);

    if (deleteOwnProjectsError) {
      console.error("[account/delete] individual project delete error", deleteOwnProjectsError);
      return NextResponse.json(
        { error: "Failed to delete your records." },
        { status: 500 }
      );
    }

    const { error: deleteUserError } = await supabaseServer.auth.admin.deleteUser(user.id);

    if (deleteUserError) {
      console.error("[account/delete] auth user delete error", deleteUserError);
      return NextResponse.json(
        {
          error:
            "Billing was cancelled and your records were deleted, but removing your account failed. Contact support.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[account/delete] unexpected error", error);
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
