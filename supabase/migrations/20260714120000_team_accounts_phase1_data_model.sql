-- Team Accounts V1 -- Phase 1: Organization Data Model
--
-- Design reference: "Team Accounts V1 Data Model Design.md"
--   (Obsidian vault: Current Implement/)
--
-- STATUS: Applied to staging (leeward-staging, dnlkmxetxhcwlrjzncwp) on 2026-07-15.
-- Confirmed via REST/schema introspection: all 3 new tables, their columns, and the
-- projects.organization_id foreign key are present and match this file exactly.
-- Confirmed via the original psql apply output (not independently re-verified since):
-- all CREATE POLICY, CREATE TRIGGER, and CREATE INDEX statements executed successfully
-- with zero errors during the actual migration run.
-- NOT YET applied to production. Still pending: full behavioral testing (not just
-- schema/creation verification) before this should be considered production-ready.
--
-- Scope (per design doc):
--   1. organizations
--   2. organization_members
--   3. organization_invites
--   4. projects.organization_id (nullable)
--
-- Explicitly NOT in scope for this migration (see design doc / CLAUDE.md):
--   - No changes to existing `projects` RLS policies. Every project's organization_id is
--     NULL until Phase 5 (Project Ownership Migration), and access still resolves purely
--     through `auth.uid() = user_id` until the canUserAccessProject() app-layer helper
--     (design doc, "New Authorization Helper") is implemented and routes are migrated to
--     use it. Adding the column here has no effect on current access behavior.
--   - No org-level billing schema (deferred to Phase 6).
--   - No invite email sending (deferred to Phase 3).
--
-- IMPORTANT: organizations_select_owner only allows the org OWNER to directly query the
-- organizations table via RLS. Any endpoint that needs to return organization data to a
-- regular MEMBER (e.g. GET /api/auth/context returning organizationName, per the Phase 4
-- design) MUST use the service-role client server-side, never a client-side query as a
-- non-owner member -- a member's own client-side query against organizations will silently
-- return no rows. All organization data for members must flow through service-role server
-- routes, consistent with how organization_invites and user_subscriptions already work.
--
-- FK delete-behavior decisions (resolved 2026-07-14):
--   - organization_members.user_id and organization_invites.invited_by -> auth.users:
--     ON DELETE CASCADE, following the same precedent as attachments.user_id -- deleting a
--     user account should not be blocked by leftover membership/invite rows.
--   - organizations.owner_id -> auth.users: left at default RESTRICT (not requested to
--     change). No ownership-transfer feature exists in V1, so deleting an owner's account
--     while their organization still exists should fail loudly rather than cascade silently.
--   - All FKs pointing at organizations (organization_members.organization_id,
--     organization_invites.organization_id, projects.organization_id): left at default
--     RESTRICT, since there is no organization-deletion feature in V1.
--   - organization_invites.role keeps its `check (role in ('owner','member'))` constraint,
--     added here for data-integrity symmetry with organization_members.role even though the
--     design doc only specified "text, not null, default 'member'" without a check.

-- =========================================================================
-- 1. organizations
-- =========================================================================

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id),
  member_limit integer not null default 5,
  created_at timestamptz not null default now()
);

create index if not exists organizations_owner_id_idx
  on public.organizations (owner_id);

alter table public.organizations enable row level security;

-- Same idiom as `projects`: direct ownership check via auth.uid(), one policy per operation
-- (not the duplicated/redundant permissive policies the audit flagged on `projects` --
-- deliberately not replicating that).
create policy "organizations_select_owner"
  on public.organizations
  for select
  to authenticated
  using (auth.uid() = owner_id);

create policy "organizations_insert_owner"
  on public.organizations
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "organizations_update_owner"
  on public.organizations
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- No delete policy -- same convention as `projects` (no DELETE policy; the app never hard-
-- deletes owned records -- projects use archived_at instead of deletion).


-- =========================================================================
-- 2. organization_members
-- =========================================================================

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (organization_id, user_id)
);

create index if not exists organization_members_organization_id_idx
  on public.organization_members (organization_id);
create index if not exists organization_members_user_id_idx
  on public.organization_members (user_id);

alter table public.organization_members enable row level security;

-- All org members can see the full roster of any org they are an active member of --
-- "no visibility restrictions in V1" per locked design decisions.
create policy "organization_members_select_active_member"
  on public.organization_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = organization_members.organization_id
        and m.user_id = auth.uid()
        and m.removed_at is null
    )
  );

-- Deliberately no insert/update/delete policy for `authenticated`. Membership rows are
-- created (org creation, invite acceptance) and soft-removed (member removal) only through
-- server routes using the service-role client -- the same "writes are server-controlled"
-- idiom user_subscriptions already uses.

-- Structural enforcement of design decision #2: an owner cannot leave or be removed from
-- their own organization in V1 (no ownership-transfer feature exists yet). Enforced here as
-- a trigger, not left as "a policy to remember," per the design doc. Scope is intentionally
-- narrow: it blocks hard delete and the removed_at NULL -> NOT NULL transition on the
-- owner's own membership row; it does not guard other field changes (e.g. role) on that row,
-- since no such case is specified in the design doc.
create or replace function public.prevent_owner_removal_from_organization_members()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.organizations o
    where o.id = old.organization_id
      and o.owner_id = old.user_id
  ) then
    if (tg_op = 'DELETE') then
      raise exception 'Cannot remove the organization owner''s membership row.';
    end if;

    if (tg_op = 'UPDATE' and new.removed_at is not null and old.removed_at is null) then
      raise exception 'Cannot soft-remove the organization owner from their own organization.';
    end if;
  end if;

  if (tg_op = 'DELETE') then
    return old;
  end if;

  return new;
end;
$$;

create trigger prevent_owner_removal_from_organization_members
  before update or delete on public.organization_members
  for each row
  execute function public.prevent_owner_removal_from_organization_members();


-- =========================================================================
-- 3. organization_invites
-- =========================================================================

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  email text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  token_hash text not null,
  invited_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz
);

create index if not exists organization_invites_organization_id_idx
  on public.organization_invites (organization_id);
create index if not exists organization_invites_token_hash_idx
  on public.organization_invites (token_hash);

alter table public.organization_invites enable row level security;

-- Only the org owner can see invite records -- inviting/removing members is an owner-only
-- action per the locked roles design (Owner vs. Member). Same idiom as user_subscriptions:
-- SELECT-only for the authorized party; all writes (create/accept/revoke) go through server
-- routes using the service-role client, with token validation happening server-side --
-- the same pattern lib/approvals/validateApprovalToken.ts already uses for approval tokens.
create policy "organization_invites_select_owner"
  on public.organization_invites
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.organizations o
      where o.id = organization_invites.organization_id
        and o.owner_id = auth.uid()
    )
  );


-- =========================================================================
-- 4. projects.organization_id
-- =========================================================================

alter table public.projects
  add column if not exists organization_id uuid references public.organizations (id);

create index if not exists projects_organization_id_idx
  on public.projects (organization_id);

-- Deliberately NOT touching existing `projects` RLS policies in this migration -- see the
-- "Explicitly NOT in scope" note at the top of this file.
