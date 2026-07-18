-- Team Accounts V1 -- Phase 6: organization_subscriptions
--
-- Design reference: "Team Accounts V1 Phase 6 - Billing Integration Design.md"
--   (Obsidian vault: Current Implement/)
--
-- STATUS: Applied to staging (leeward-staging, dnlkmxetxhcwlrjzncwp) on 2026-07-17, via
-- the Supabase Studio SQL Editor (no direct DB/Management API access available for this
-- repo's tooling, same gap noted in prior migrations).
--
-- Real gotcha hit along the way: the CREATE TABLE/index/RLS statements ran successfully
-- and the table was confirmed to exist directly in Postgres (via Table Editor and later
-- pg_class), but it was completely invisible to PostgREST -- every REST query returned
-- PGRST205 "Could not find the table in the schema cache", and this persisted through
-- multiple NOTIFY pgrst, 'reload schema' calls AND a full project restart. Root cause,
-- found via information_schema.role_table_grants: the table had been created with ZERO
-- grants to anon/authenticated/service_role, unlike tables provisioned through Supabase's
-- normal path (which get default privileges automatically). PostgREST only introspects
-- tables the API roles have at least some privilege on, so no amount of cache-reloading
-- would have found it until the grants existed. Fixed with explicit GRANT ALL ON TABLE
-- statements for postgres/anon/authenticated/service_role (matching organization_members'
-- grants), followed by one more schema reload, which then worked immediately. Confirmed
-- via direct REST query (200, empty array) and via PostgREST's own OpenAPI schema listing
-- showing the table.
--
-- Also worth noting for future migrations applied through the SQL Editor: Table Editor
-- showing a table as "existing" is not sufficient confirmation that CREATE TABLE actually
-- ran -- at one point Table Editor showed the table while pg_class showed no such relation
-- in any schema at all (the CREATE TABLE apparently hadn't been run yet at that point,
-- despite what Table Editor displayed). pg_class is the reliable source of truth, not
-- Table Editor.
--
-- Behavioral testing completed 2026-07-17: POST /api/billing/team-checkout exercised
-- end-to-end on staging, including the individual-to-team cancellation path against a
-- genuine Stripe test-mode subscription (not a placeholder row) -- confirmed the real
-- subscription was actually canceled, a real proration credit invoice item was generated,
-- and the new team checkout session correctly reused the existing Stripe customer.
-- POST /api/billing/portal/team and the extended GET /api/billing/status were also
-- exercised and confirmed correct (portal: owner gets a real Stripe portal session for the
-- org's customer, non-owner rejected; status: all three states -- individual-only,
-- organization-only, neither -- verified with exact field-level matches).
--
-- The Stripe webhook's organization_id branch (upsertOrganizationSubscription) was also
-- confirmed working, without needing a browser: created a real Stripe test-mode
-- subscription directly via the Stripe API (not Checkout) with metadata.organization_id/
-- billing_owner_id set, since Stripe fires customer.subscription.created for any new
-- subscription regardless of how it was created. Verified via three independent signals:
-- the resulting organization_subscriptions row matched exactly (only creatable via this
-- webhook function, since the table has no client-side INSERT policy), Stripe's event
-- object showed pending_webhooks: 0 (fully delivered), and Vercel's own function logs
-- showed POST /api/stripe/webhook 200 at the exact timestamp of the test.
--
-- Phase 6 is now fully behaviorally verified on staging -- every route and the webhook
-- branch.
--
-- NOT YET applied to production.
--
-- Scope (per design doc):
--   New table only -- organization_subscriptions, mirroring the existing (pre-migrations-
--   folder) user_subscriptions table's column shape, but keyed to organization_id and
--   billing_owner_id instead of user_id. Kept as a fully separate table, not a modified
--   user_subscriptions, so the existing individual billing code path (checkout, portal,
--   status, and the individual branch of the Stripe webhook) stays completely untouched --
--   per the design doc's repeated "not a rewrite" framing for this phase.
--
-- Explicitly NOT in scope for this migration:
--   - No changes to user_subscriptions.
--   - No routes, no webhook changes -- schema only. The team-checkout route, the webhook's
--     new organization_id branch, the org billing portal route, and the extended
--     GET /api/billing/status check are all separate application-code work, not part of
--     this migration.
--
-- Column shape decisions
-- -----------------------
-- Mirrors user_subscriptions exactly (id, stripe_customer_id, stripe_subscription_id,
-- stripe_price_id, status, current_period_start/end, cancel_at_period_end, canceled_at,
-- trial_start/end, created_at, updated_at), inferred from that table's actual usage across
-- app/api/billing/checkout, app/api/billing/portal, app/api/billing/status, and
-- app/api/stripe/webhook/route.ts (user_subscriptions itself predates this repo's
-- migrations/ folder, same situation as organizations/projects before Phase 1).
--
-- organization_id replaces user_id as the row's subject; billing_owner_id records which
-- org owner initiated the checkout (needed since Stripe subscription metadata is set at
-- checkout time by the initiating owner, and the webhook has no other way to recover who
-- that was when it later upserts this row).
--
-- unique(organization_id): one subscription row per organization, mirroring how
-- user_subscriptions is used as one-row-per-user everywhere it's queried (.maybeSingle()
-- throughout the individual billing routes).
--
-- unique(stripe_subscription_id): required as the webhook's upsert onConflict target
-- (mirrors the onConflict: "stripe_subscription_id" already used for user_subscriptions in
-- app/api/stripe/webhook/route.ts), and prevents duplicate rows if Stripe redelivers the
-- same subscription event.
--
-- current_period_start/end, canceled_at, trial_start/end, and stripe_price_id are nullable
-- -- the webhook's toIsoFromStripeTimestamp() helper returns null for any of these Stripe
-- may omit (e.g. before the first invoice, or when no trial applies), and
-- items.data[0]?.price?.id can itself be absent.
--
-- FK delete-behavior decisions (same reasoning as Phase 1's migration header)
-- -----------------------------------------------------------------------------
--   - billing_owner_id -> auth.users: ON DELETE CASCADE, same precedent as
--     organization_members.user_id and organization_invites.invited_by -- deleting a user
--     account should not be blocked by a leftover subscription row.
--   - organization_id -> organizations: left at default RESTRICT, same precedent as every
--     other FK pointing at organizations in Phase 1 -- no organization-deletion feature
--     exists in V1.
--
-- RLS decision
-- ------------
-- Owner-only SELECT, same pattern as organizations_select_owner (Phase 1) and
-- organization_invites_select_owner (Phase 1): billing is owner-only per the locked
-- Owner/Member design (Phase 3's design doc: "Members have no billing portal access"), and
-- per Phase 1's own documented rule, any data a MEMBER needs to see (e.g. an aggregate
-- "your team's plan is active" status, if ever added) must flow through a service-role
-- server route rather than direct client SELECT access to this table.
--
-- No client INSERT/UPDATE/DELETE policies -- deliberately, same idiom as
-- organization_invites and organization_members: all writes to this table happen through
-- service-role code paths only (the Stripe webhook's upsert, and the team-checkout route),
-- never directly from an authenticated client.

create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  billing_owner_id uuid not null references auth.users (id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null,
  stripe_price_id text,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  trial_start timestamptz,
  trial_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id),
  unique (stripe_subscription_id)
);

create index if not exists organization_subscriptions_organization_id_idx
  on public.organization_subscriptions (organization_id);
create index if not exists organization_subscriptions_billing_owner_id_idx
  on public.organization_subscriptions (billing_owner_id);

alter table public.organization_subscriptions enable row level security;

create policy "organization_subscriptions_select_owner"
  on public.organization_subscriptions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organizations o
      where o.id = organization_subscriptions.organization_id
        and o.owner_id = auth.uid()
    )
  );

-- No insert/update/delete policies for `authenticated` -- writes are server-controlled
-- (service-role only), same idiom as organization_invites and organization_members.
