-- Schedule and Calendar -- Phase 1: project_schedule_events table
--
-- Design reference: "Schedule and Calendar - Implementation Plan.md"
--   (Obsidian vault: Current Implement/)
--
-- STATUS: applying to leeward-staging-internal (dnlkmxetxhcwlrjzncwp) first --
-- this is a brand-new, experimental feature (branch schedule-calendar-v1),
-- no reason to touch production yet. Verify via information_schema.columns +
-- role_table_grants the same way every prior migration in this repo has
-- been confirmed, and double-check the project ref before running (see
-- CLAUDE.md's "one real scare" note about tab/connection mixups between
-- staging and production Supabase projects).
--
-- Scope (per design doc)
-- --------------------------
-- One new table only: project_schedule_events. A record-level planning
-- tool -- site visits, start/completion dates, inspections, or a custom
-- labeled event -- distinct from Timeline entries and approvals in one
-- important way: this is NOT dispute evidence. It's a plan a human picked,
-- not proof of something that already happened. Internal-only in v1: no
-- client visibility toggle, no Send Update bundling, no appearance in the
-- Export Dispute Package PDF, no changes to the share page. Freely
-- editable in place (no delete-and-relog requirement the way
-- project_payments has) since there's no dispute/financial weight
-- attached here -- see the design doc for the full reasoning.
--
-- Column shape decisions
-- --------------------------
-- event_type: constrained to a fixed set (site_visit, start_date,
-- completion_date, inspection, custom) rather than a free-text type field,
-- so the calendar UI's color-coding/legend has a stable, known set to key
-- off. custom_label carries the free-text label for the 'custom' case only
-- -- app-layer concern to enforce that pairing, not a DB constraint (kept
-- simple, matching this repo's general preference for app-layer validation
-- over heavy DB-level constraints for this kind of shape rule).
--
-- event_date / event_time: deliberately plain values with NO timezone
-- handling, which is a real departure from how Timeline entries work
-- (UTC instant + timezone id + offset, because those are dispute-grade
-- proof of when something happened). Schedule events aren't evidence, so
-- that rigor isn't warranted here -- event_date/event_time are stored and
-- displayed as plain wall-clock values a contractor picked. Revisit only
-- if cross-timezone team confusion turns out to be a real problem in
-- practice (flagged in the design doc, not a silent omission).
--
-- No updated_at column, matching project_documents' precedent (that table
-- is also editable in place via /api/documents/update and doesn't track
-- last-modified either) -- created_at is the only timestamp kept.
--
-- created_by: attribution only, not authorization -- same separation
-- already established for approval_requests.created_by, attachments.user_id,
-- project_payments.created_by, project_documents.uploaded_by. Access
-- derives entirely from project access (canUserAccessProject()), not from
-- who created a given event -- any org member can add, edit, or delete any
-- schedule event on any org project, matching the locked "all org members
-- can access all org projects" decision. ON DELETE CASCADE on created_by
-- (auth.users), same precedent as the other project-child tables above.
--
-- project_id: ON DELETE CASCADE, matching project_payments and
-- project_documents (a schedule event should never outlive the record it
-- belongs to).
--
-- No offline outbox/queue in this migration's corresponding Phase 1 --
-- deliberate, sequenced decision (not an oversight): Phase 1 is online-only
-- CRUD + UI, to validate the flow fast on the experimental branch. Phase 2
-- adds the offline outbox/flush pair following the exact template
-- project_payments already established, once Phase 1's shape is settled.
-- See the design doc's "Offline queueing" section for the full reasoning.
--
-- Access model / RLS decision
-- --------------------------
-- Same idiom as project_payments, project_documents, and
-- organization_subscriptions: all reads/writes go through service-role API
-- routes (POST /api/schedule/create, GET /api/schedule/list,
-- GET /api/schedule/list-for-org, POST /api/schedule/update,
-- POST /api/schedule/delete), each gated by canUserAccessProject() (or,
-- for list-for-org, the equivalent org-wide access resolution). RLS is
-- enabled with NO policies for `authenticated` (fail-closed by default for
-- any future direct-client-read feature), and explicit GRANTs are applied
-- to all four roles so PostgREST can see the table for the service-role
-- queries that do need it (the now-familiar Phase 6 gotcha -- missing
-- grants make a table invisible to PostgREST regardless of RLS policy
-- state).
--
-- No unique constraints beyond the primary key -- a project can
-- legitimately have multiple events of the same type on the same day.

create table if not exists public.project_schedule_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  event_type text not null check (
    event_type in ('site_visit', 'start_date', 'completion_date', 'inspection', 'custom')
  ),
  custom_label text,
  event_date date not null,
  event_time time,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) on delete cascade
);

create index if not exists project_schedule_events_project_id_idx
  on public.project_schedule_events (project_id);
create index if not exists project_schedule_events_created_by_idx
  on public.project_schedule_events (created_by);
create index if not exists project_schedule_events_event_date_idx
  on public.project_schedule_events (event_date);

alter table public.project_schedule_events enable row level security;

-- Explicit grants -- required for PostgREST to see this table at all (see
-- header note re: the Phase 6 organization_subscriptions gotcha), independent
-- of the fact that no `authenticated`-role RLS policy exists below. Mirrors
-- the exact grant set used for project_payments and project_documents.
grant all on table public.project_schedule_events to postgres, anon, authenticated, service_role;

-- No insert/update/delete/select policies for `authenticated` --
-- deliberately, see "Access model / RLS decision" above. All access is via
-- service-role API routes gated by canUserAccessProject().
