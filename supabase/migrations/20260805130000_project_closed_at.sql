-- Portfolio Tab v1 -- adds projects.closed_at.
--
-- Design reference: "Portfolio Tab - Implementation Plan.md" (Obsidian
-- vault, Current Implement/).
--
-- closed_at is a new, deliberately INDEPENDENT lifecycle flag from
-- archived_at. Closing a record means "this job's work is done" (a
-- financial/portfolio concept); archiving means "hide this from my
-- regular record list" (unchanged, unaffected by this migration). A
-- record can be closed and still fully visible in the regular Records
-- list; a record can be archived without ever having been closed. See
-- the plan doc's "Decisions confirmed with Ryan" section for why reusing
-- archived_at for this was considered and rejected.
--
-- Nullable timestamp, same idiom as archived_at: null = active/open,
-- set = closed. No RLS changes needed -- the existing
-- projects_update_org_member / individual-ownership UPDATE policies
-- (see 20260717120000_extend_projects_rls_for_org_access.sql) are
-- row-level, not column-restricted, so any user already authorized to
-- update a project can set this column the same way they already set
-- archived_at, title, tax_rate, etc. via direct client-side Supabase
-- calls -- confirmed by reading that policy's definition before writing
-- this migration, not assumed.

alter table public.projects
  add column if not exists closed_at timestamptz;
