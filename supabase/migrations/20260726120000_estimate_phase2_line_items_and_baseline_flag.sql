-- Estimate/Change Order/Invoice System -- Phase 2: Data Model
--
-- Design reference: "Estimate, Change Order and Invoice System + UI Navigation
--   Overhaul - Implementation Plan.md" (Obsidian vault: Current Implement/)
--
-- STATUS: Applied and verified on both leeward-staging-internal
-- (dnlkmxetxhcwlrjzncwp, 2026-07-26) and production (uzuzwhzilhakewtbtzxh,
-- confirmed 2026-07-26 via information_schema.columns showing both
-- line_items and is_baseline with correct types/defaults). Applied via the
-- Supabase Studio SQL Editor on each project in turn, same no-direct-DB-access
-- constraint noted in every prior migration in this folder.
--
-- Note on why production got this migration ahead of the rest of this
-- initiative's staged rollout plan: local dev's .env.local intentionally
-- points at production Supabase (see CLAUDE.md's "Local Dev Environment"
-- section), so local testing of Phase 5's line-items/baseline UI hit this
-- exact "column does not exist" (42703) error against production before the
-- migration existed there. The columns are additive-only and no production
-- app code reads/writes them yet (this feature isn't deployed to production),
-- so applying the migration alone doesn't expose anything -- it just unblocks
-- local testing. Ryan confirmed this via a real npm run dev terminal error
-- before applying.
--
-- Why this migration exists
-- --------------------------
-- Per the implementation plan's Second Audit Pass: an Estimate (the baseline
-- bid) and a Change Order (every subsequent scope/cost change) are both
-- structurally approvals -- approval_type already has an allowed value of
-- "change_order" alongside scope/material/schedule/general, and the existing
-- draft -> pending -> approved/declined/expired lifecycle applies unchanged.
-- What's missing is (a) a way to distinguish the one baseline estimate from
-- every other approval, and (b) structured line items (description/quantity/
-- unit cost/line total) instead of the single cost_delta lump figure.
--
-- Deliberately a JSONB column, not a new normalized child table
-- --------------------------
-- A separate line_items table would need its own RLS policies mirroring
-- approval_requests' access rules, and -- more importantly -- would require a
-- new offline outbox/flush pair (or nested sync logic) to queue line-item rows
-- alongside their parent approval while offline. That directly contradicts the
-- design doc's Offline Architecture Impact section: "this is the pair to
-- extend [lib/offlineApprovalOutbox.ts / offlineApprovalFlush.ts], not a new
-- parallel offline system to build." A JSONB array on the existing row lets
-- Phase 4 add a single `lineItems` field to the existing flat
-- OfflineApprovalRecord type and serialize it as part of the same payload
-- offline approvals already queue -- no new IndexedDB store, no new flush
-- logic, no new RLS surface. Matches the locked decision to keep line items
-- simple (no markups, catalogues, or grouping in V1).
--
-- Line totals are stored, not just quantity/unit_cost
-- --------------------------
-- The design doc lists "description, quantity, unit cost, line total" as the
-- structure -- line_total is computed (quantity * unit_cost) but stored
-- per-item rather than recomputed on read. This protects the historical
-- record the same way the rest of this app's dispute-protection model does:
-- once an estimate or change order is sent/locked, its figures shouldn't be
-- able to drift later even if, say, a future version of the app changes how
-- totals are rounded or computed. The running total across all line items
-- (and across baseline + approved change orders) is still computed
-- client-side from this data per Phase 3's plan -- no new stored total column
-- on the row itself.
--
-- is_baseline: no hard "only one per project" DB constraint (yet)
-- --------------------------
-- Deliberately NOT adding a partial unique index enforcing one is_baseline
-- row per project. The product behavior for "client declined the baseline
-- estimate, can the contractor submit a new one" is a real open question the
-- design doc doesn't resolve, and a hard DB constraint decided now could
-- block a legitimate retry workflow later. Enforcing "at most one active
-- baseline" belongs in the Phase 3 API layer (approvals/create), where it's
-- easy to reason about and adjust (e.g. scope the check to
-- status not in ('declined','expired')) without a follow-up migration.
-- Revisit adding a DB-level constraint once that product question is
-- actually answered.
--
-- Backward compatibility
-- --------------------------
-- Both new columns have safe defaults (line_items defaults to an empty JSON
-- array, is_baseline defaults to false), so every existing approval_requests
-- row -- every real change order, scope/material/schedule/general approval
-- already in production -- is completely unaffected. Nothing currently
-- reading or writing approval_requests needs to change for this migration to
-- apply cleanly.

-- =========================================================================
-- line_items: structured, simple line items (description/quantity/unit cost/
-- line total). Empty array by default -- an approval with no line items yet
-- behaves exactly as it does today (cost_delta remains the source of truth
-- until Phase 3 wires up line-item-based totals).
-- =========================================================================

alter table public.approval_requests
  add column if not exists line_items jsonb not null default '[]'::jsonb;

alter table public.approval_requests
  add constraint approval_requests_line_items_is_array
  check (jsonb_typeof(line_items) = 'array');

-- =========================================================================
-- is_baseline: distinguishes the one baseline estimate from every other
-- approval (change orders and non-cost approvals alike). Defaults to false
-- so every existing row is classified as "not a baseline" -- correct, since
-- the baseline-estimate concept doesn't exist in any row created before this
-- migration.
-- =========================================================================

alter table public.approval_requests
  add column if not exists is_baseline boolean not null default false;
