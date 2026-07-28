-- Project Documents -- Phase 1: project_documents table
--
-- Design reference: same-session chat discussion (2026-07-27/28) following
-- the Project -> Record rename. Not yet written up as its own Brain vault
-- plan doc -- built directly from the design conversation per Ryan's
-- explicit "let's come up with a plan and implement today" call.
--
-- STATUS: NOT YET APPLIED anywhere (staging or production) as of writing.
-- Apply via Supabase Studio SQL Editor on leeward-staging-internal
-- (dnlkmxetxhcwlrjzncwp) first this time -- unlike the Estimate Phase 2 and
-- Payments migrations, there is no local-dev-blocking reason to apply this
-- to production early. Verify via information_schema.columns +
-- role_table_grants the same way every prior migration in this repo has
-- been confirmed, and double-check the project ref before running (see
-- CLAUDE.md's "one real scare" note about tab/connection mixups between
-- staging and production Supabase projects).
--
-- Scope
-- --------------------------
-- One new table only: project_documents. A record-level file vault,
-- distinct from the existing `attachments` table (which is strictly
-- entry-tied -- attachments.proof_id is NOT NULL, one row per Timeline
-- entry photo/file). project_documents holds files that describe the
-- record generally -- a lease, an insurance certificate, a permit --
-- with no specific moment or entry they belong to. Strictly uploaded
-- material, per Ryan's explicit call: no structured forms/fields, no
-- in-app document generation, no e-signature. Same "documentation, not
-- transaction/process" discipline as project_payments.
--
-- Column shape decisions
-- --------------------------
-- include_in_dispute_packet: boolean, default false. This is the entire
-- mechanism for how a Documents-tab file does or doesn't ride along in an
-- Export Dispute Package PDF -- decided once, per document, at
-- upload/edit time (a toggle in the Documents tab UI), NOT via a
-- checklist shown at export time. Defaults to false (opt-in, not
-- opt-out) since some uploaded documents may contain sensitive
-- information (SSNs, financial details) that should never leave the app
-- unless a human deliberately flips it on. "Export dispute package"
-- itself stays exactly the single click it already is -- no new step,
-- no new confirm dialog -- it silently includes whatever is currently
-- flagged true.
--
-- label: nullable free text, optional short description (e.g.
-- "Certificate of Insurance", "Signed Lease pg 1-4"). Distinct from
-- filename, which is preserved as-uploaded.
--
-- Documents are NEVER shown on the client-facing share/invoice page in
-- v1 -- deliberately internal-only, same treatment as the private
-- per-record Notes section. Only two surfaces ever read this table:
-- the Documents tab itself (dashboard, internal) and the dispute-packet
-- PDF export's new "Reference Documents" section (reportMode ===
-- "dispute" only, filtered to include_in_dispute_packet = true).
--
-- uploaded_by: attribution only, not authorization -- same separation
-- already established for approval_requests.created_by,
-- attachments.user_id, project_payments.created_by. Access derives
-- entirely from project access (canUserAccessProject()), not from who
-- uploaded a given document -- any org member can upload, toggle, or
-- delete any document on any org project, matching the locked "all org
-- members can access all org projects" decision. ON DELETE CASCADE on
-- uploaded_by (auth.users), same precedent as project_payments.created_by.
--
-- project_id: ON DELETE CASCADE, matching project_payments (a document
-- record should never outlive the project/record it belongs to).
--
-- No offline outbox/queue for v1 (deliberate scope-down for today's
-- build, flagged explicitly to Ryan, not an oversight): document uploads
-- require network connectivity. Every other mutation in this app has an
-- outbox/flush pair, but offline file-queueing for potentially large,
-- non-photo document uploads (PDFs, scans) was judged out of scope for
-- a first pass -- worth a deliberate follow-up decision, not something
-- to bolt on silently later.
--
-- Access model / RLS decision
-- --------------------------
-- Same idiom as project_payments and organization_subscriptions: all
-- reads/writes go through service-role API routes
-- (POST /api/documents/create, /api/documents/upload-prep,
-- GET/POST /api/documents/list, POST /api/documents/update,
-- POST /api/documents/delete), each gated by canUserAccessProject().
-- RLS is enabled with NO policies for `authenticated` (fail-closed by
-- default for any future direct-client-read feature), and explicit
-- GRANTs are applied to all four roles so PostgREST can see the table
-- for the service-role queries that do need it (the now-familiar Phase 6
-- gotcha -- missing grants make a table invisible to PostgREST
-- regardless of RLS policy state).
--
-- No unique constraints beyond the primary key -- multiple documents can
-- share a filename/label without issue.

create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  path text not null,
  filename text not null,
  mime_type text,
  size_bytes bigint,
  label text,
  include_in_dispute_packet boolean not null default false,
  created_at timestamptz not null default now(),
  uploaded_by uuid not null references auth.users (id) on delete cascade
);

create index if not exists project_documents_project_id_idx
  on public.project_documents (project_id);
create index if not exists project_documents_uploaded_by_idx
  on public.project_documents (uploaded_by);

alter table public.project_documents enable row level security;

-- Explicit grants -- required for PostgREST to see this table at all
-- (see header note re: the Phase 6 organization_subscriptions gotcha),
-- independent of the fact that no `authenticated`-role RLS policy exists
-- below. Mirrors the exact grant set used for project_payments and
-- organization_subscriptions.
grant all on table public.project_documents to postgres, anon, authenticated, service_role;

-- No insert/update/delete/select policies for `authenticated` --
-- deliberately, see "Access model / RLS decision" above. All access is
-- via service-role API routes gated by canUserAccessProject().
