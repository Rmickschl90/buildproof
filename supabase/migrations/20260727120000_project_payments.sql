-- Project Payments -- Phase 1: project_payments table
--
-- Design reference: "Project Payments - Implementation Plan.md"
--   (Obsidian vault: Current Implement/)
--
-- STATUS: Applied to PRODUCTION (uzuzwhzilhakewtbtzxh, "Buildproof" in the
-- Supabase dashboard) on 2026-07-27, ahead of leeward-staging-internal, via
-- the same early-production-migration exception the estimate Phase 2
-- migration used -- Ryan's local dev .env.local intentionally points at
-- production Supabase (see CLAUDE.md's "Local Dev Environment" section),
-- and Ryan explicitly confirmed he wanted to click through this feature
-- locally rather than deploy to staging first. Confirmed via a single
-- combined query run in one tab/connection (current_database(),
-- information_schema.columns count, information_schema.role_table_grants
-- count, and pg_class count all in the same statement, to rule out the
-- tab-mixup failure mode this repo has hit before): column_count 7,
-- grant_count 28 (7 privileges x 4 roles), pg_class_count 1. An initial,
-- separately-run information_schema.columns check had returned 0 rows
-- moments earlier while a separately-run grants check returned real grants
-- -- that mismatch turned out to be a stale tab/connection artifact, not a
-- real failure; the combined single-query check resolved it cleanly.
--
-- NOT YET applied to leeward-staging-internal (dnlkmxetxhcwlrjzncwp).
--
-- Scope (per design doc)
-- --------------------------
-- One new table only: project_payments. Records a payment the client has
-- already made against a project's contract total, logged after the fact by
-- a contractor (or any org member -- see access model below). Deliberately
-- NOT a payment-processing feature -- no Stripe charge, no card, no money
-- actually moves. Just a dated, amount, optional-note record, the same
-- shape of "documentation, not transaction" as everything else in this app.
--
-- Column shape decisions
-- --------------------------
-- amount: numeric(12,2), > 0 -- matches this repo's existing money-shape
-- convention (approval_requests.cost_delta), constrained positive since a
-- payment record only ever represents money received, never a negative
-- adjustment (a miskeyed amount is corrected via delete + relog, per the
-- design doc's confirmed decision -- not by logging a negative offsetting
-- row).
--
-- note: nullable free text -- optional per the design doc ("deposit, check
-- #1042"), never shown on any client-facing surface (see RLS/access note
-- below and the design doc's confirmed decision to keep client-facing
-- exposure to Paid/Balance Due summary figures only).
--
-- paid_at vs created_at: paid_at is the jobsite-relevant date (when the
-- money actually came in -- contractor-entered, can be backdated) kept
-- distinct from created_at (when the record was logged), matching this
-- app's established convention of preserving jobsite-local event time
-- separately from system-recorded time (see CLAUDE.md's Timestamps section).
-- Deliberately NOT storing a timezone id/offset pair on this table the way
-- proofs/approvals do for their primary display timestamp: paid_at is a
-- calendar date a contractor picks from a date field (e.g. "the client paid
-- on the 14th"), not a precise field-logged instant where jobsite-local
-- clock time materially matters the way it does for a timestamped photo/note
-- entry. created_at (the actual logging instant) is the one that could
-- eventually want that treatment if this table's timestamp handling is ever
-- revisited -- not added now since nothing currently reads created_at's
-- exact instant for display.
--
-- created_by: attribution only, not authorization -- same separation this
-- app's Team Accounts audit called out for approval_requests.created_by,
-- send_jobs.user_id, attachments.user_id. Access to project_payments derives
-- entirely from project access (individual ownership or active org
-- membership on the parent project, i.e. the same rule
-- canUserAccessProject() already implements in lib/organizationAuth.ts), not
-- from who logged a given payment -- any org member can log or see a
-- payment on any org project, matching the locked "all org members can
-- access all org projects" decision. ON DELETE CASCADE on created_by
-- (auth.users), same precedent as organization_subscriptions.billing_owner_id
-- and organization_members.user_id -- deleting a user account should not be
-- blocked by a leftover payment row.
--
-- project_id: ON DELETE CASCADE (not RESTRICT) -- deliberately different
-- from the organization_id FKs elsewhere in this repo, which stay RESTRICT
-- because no organization-deletion feature exists in V1. Projects, by
-- contrast, are already deletable in principle (though the app only ever
-- archives them in practice via archived_at, per the projects RLS
-- migration's own note) -- cascading here just means a payment record can
-- never outlive the project it belongs to, consistent with how attachments
-- and other project-scoped child records already behave.
--
-- Access model / RLS decision
-- --------------------------
-- All reads and writes to this table go through three service-role API
-- routes (POST /api/payments/create, GET /api/payments/list, POST
-- /api/payments/delete), each gated by canUserAccessProject() -- there is no
-- plan for the dashboard to query this table directly via the browser
-- Supabase client the way it does for projects (list/fetch/rename/archive).
-- Given that, this migration deliberately does NOT add any SELECT/INSERT/
-- DELETE policy for the `authenticated` role -- same idiom already used for
-- organization_subscriptions and organization_invites/organization_members'
-- write paths ("no client insert/update/delete policies -- deliberately, all
-- writes happen through service-role code paths only"). RLS is still
-- enabled on the table (so a future direct-client-read feature would fail
-- closed by default rather than silently being wide open), and explicit
-- GRANTs are still applied to all four roles below so PostgREST can see the
-- table at all for the service-role queries that do need it (same Phase 6
-- gotcha: missing grants make a table invisible to PostgREST regardless of
-- RLS policy state).
--
-- If a future feature needs the dashboard to read this table directly
-- (bypassing the API layer), add an EXISTS-based SELECT policy mirroring
-- projects_select_org_member (project_id -> projects.user_id = auth.uid() OR
-- is_active_org_member(projects.organization_id, auth.uid())) rather than
-- assuming this header's "server-only" reasoning still holds.
--
-- No unique constraints beyond the primary key -- a project can legitimately
-- receive multiple payments of the same amount on the same day (e.g. two
-- separate checks), so no natural uniqueness exists to enforce.

create table if not exists public.project_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  note text,
  paid_at date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) on delete cascade
);

create index if not exists project_payments_project_id_idx
  on public.project_payments (project_id);
create index if not exists project_payments_created_by_idx
  on public.project_payments (created_by);

alter table public.project_payments enable row level security;

-- Explicit grants -- required for PostgREST to see this table at all (see
-- header note re: the Phase 6 organization_subscriptions gotcha), independent
-- of the fact that no `authenticated`-role RLS policy exists below. Mirrors
-- the exact grant set used for organization_subscriptions.
grant all on table public.project_payments to postgres, anon, authenticated, service_role;

-- No insert/update/delete/select policies for `authenticated` -- deliberately,
-- see "Access model / RLS decision" above. All access is via service-role API
-- routes gated by canUserAccessProject().
