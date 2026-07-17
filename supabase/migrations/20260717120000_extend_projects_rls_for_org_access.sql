-- Team Accounts V1 -- Phase 5: extend projects RLS for organization access
--
-- Design reference: "Team Accounts V1 Phase 5 - Project Ownership Migration Design.md"
--   (Obsidian vault: Current Implement/)
--
-- STATUS: Applied to staging (leeward-staging, dnlkmxetxhcwlrjzncwp) on 2026-07-17, via
-- the Supabase Studio SQL Editor (no direct DB/Management API access available for this
-- repo's tooling to apply it directly, same gap noted in the Phase 1 recursion-fix
-- migration). Confirmed via direct REST testing with real signed-in test users (not just
-- the service-role key, which bypasses RLS): a non-owner active org member can now SELECT
-- and UPDATE another member's org project (both returned the expected row); an INSERT with
-- organization_id set to an org the inserting user does NOT belong to was correctly
-- rejected (403, 42501 RLS violation).
--
-- NOT YET applied to production.
--
-- Why this migration exists
-- --------------------------
-- The projects table's original RLS policies were deliberately left untouched by the
-- Phase 1 migration (20260714120000_team_accounts_phase1_data_model.sql) -- see that
-- file's header. Access to a project row still resolves purely through
-- `auth.uid() = user_id`, regardless of organization_id. Phase 2 already migrated all
-- server-side API routes to canUserAccessProject() (which does respect org membership),
-- but the dashboard's own client-side Supabase calls against `projects` (list, fetch,
-- rename, archive, update) bypass the API layer entirely and hit Postgres directly --
-- so they still rely solely on projects' own RLS policies, which is what this migration
-- extends.
--
-- Deliberately NOT dropping or rewriting the original SELECT/UPDATE/INSERT policies --
-- same idiom as 20260716150000_fix_organization_members_select_recursion.sql: this repo's
-- migration tooling has no confirmed record of the original policies' exact names (the
-- projects table predates this repo's migrations/ folder), so guessing and dropping the
-- wrong name risks silently leaving the original policy in place while also creating a
-- confusingly-named duplicate. Instead:
--
--   - SELECT and UPDATE: adds new, separate PERMISSIVE policies. Postgres combines
--     multiple permissive policies for the same command with OR, so "auth.uid() = user_id
--     (whatever the existing policy already grants) OR active org member" falls out
--     automatically, without needing to touch the existing policy at all.
--   - INSERT: a new permissive policy would NOT actually constrain anything -- permissive
--     policies only ever expand access via OR, they cannot narrow what's already allowed.
--     Since the existing INSERT policy almost certainly already permits any organization_id
--     value (it only checks auth.uid() = user_id, not organization_id, so nothing today
--     actually stops a client from setting organization_id to an org the user doesn't
--     belong to), a genuine validation requires a RESTRICTIVE policy instead: restrictive
--     policies AND with the combined permissive result, so this narrows what's allowed
--     without needing to know or touch the original policy's definition.
--
-- Reuses is_active_org_member(p_organization_id uuid, p_user_id uuid) from the Phase 1
-- recursion-fix migration -- same SECURITY DEFINER helper, for consistency and to avoid
-- re-deriving membership-check logic in a third place.
--
-- DELETE is deliberately left untouched: projects has no DELETE policy today (same
-- convention as organizations -- the app never hard-deletes projects, only archives them
-- via archived_at), and nothing in this migration changes that.

-- =========================================================================
-- SELECT: allow either individual ownership OR active org membership
-- =========================================================================

create policy "projects_select_org_member"
  on public.projects
  for select
  to authenticated
  using (
    organization_id is not null
    and public.is_active_org_member(organization_id, auth.uid())
  );

-- =========================================================================
-- UPDATE: allow either individual ownership OR active org membership
-- =========================================================================

create policy "projects_update_org_member"
  on public.projects
  for update
  to authenticated
  using (
    organization_id is not null
    and public.is_active_org_member(organization_id, auth.uid())
  )
  with check (
    organization_id is not null
    and public.is_active_org_member(organization_id, auth.uid())
  );

-- =========================================================================
-- INSERT: RESTRICTIVE policy validating organization_id, when set, is real
-- =========================================================================
-- Restrictive (not permissive) -- ANDs with whatever the existing permissive INSERT
-- policy already allows, rather than OR-ing in a no-op. Allows organization_id to be
-- left null (the existing individual-ownership case is untouched) or set to an org the
-- inserting user is an active member of; rejects any other organization_id, including
-- an org the user doesn't belong to.

create policy "projects_insert_valid_organization_id"
  on public.projects
  as restrictive
  for insert
  to authenticated
  with check (
    organization_id is null
    or public.is_active_org_member(organization_id, auth.uid())
  );
