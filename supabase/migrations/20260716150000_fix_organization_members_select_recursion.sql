-- Team Accounts V1 -- Phase 1 fix: organization_members_select_active_member infinite recursion
--
-- STATUS: Applied to staging (leeward-staging, dnlkmxetxhcwlrjzncwp) on 2026-07-16, via the
-- Supabase Studio SQL Editor (not through this repo's migration tooling). Confirmed working:
-- re-ran the exact organization_members SELECT and INSERT-rejection tests that originally
-- surfaced the 42P17 recursion bug -- both now behave correctly (200 with expected row;
-- 403/42501 RLS rejection, respectively).
--
-- NOT YET applied to production. Must be applied together with
-- 20260714120000_team_accounts_phase1_data_model.sql -- that file alone leaves
-- organization_members SELECT completely broken (see its STATUS header).
--
-- Fixes a bug discovered via behavioral RLS testing on staging (leeward-staging,
-- dnlkmxetxhcwlrjzncwp) on 2026-07-16: the original organization_members_select_active_member
-- policy (defined in 20260714120000_team_accounts_phase1_data_model.sql) queries
-- public.organization_members from within its own USING clause. Postgres re-applies that same
-- RLS policy to evaluate the subquery, which re-triggers the policy, ad infinitum -- every
-- SELECT against organization_members as an authenticated user currently fails with
-- "infinite recursion detected in policy for relation \"organization_members\"" (error 42P17).
--
-- The original migration file is deliberately left untouched -- it's already applied and
-- verified on staging, so this is a follow-up migration rather than an edit to it.
--
-- Fix: move the membership check into a SECURITY DEFINER helper function, which runs with
-- the privileges of its owner and therefore bypasses RLS when it queries
-- organization_members internally, breaking the recursive cycle. `set search_path = public`
-- is required on the function -- without it, a SECURITY DEFINER function resolves unqualified
-- names using the caller's search path rather than a fixed one, a known privilege-escalation
-- footgun for this function type.

create or replace function public.is_active_org_member(p_organization_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = p_organization_id
      and user_id = p_user_id
      and removed_at is null
  );
$$;

drop policy if exists "organization_members_select_active_member" on public.organization_members;

create policy "organization_members_select_active_member"
  on public.organization_members
  for select
  to authenticated
  using (
    public.is_active_org_member(organization_id, auth.uid())
  );
