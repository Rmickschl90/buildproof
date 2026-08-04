-- Estimate/Invoice System -- Tax Rate on Records
--
-- Design reference: discussed directly with Ryan 2026-08-03 (no separate
-- design doc written for this one -- small enough to fold straight into the
-- existing Estimate/Invoice initiative). Modeled on how Jobber handles sales
-- tax (a manual rate the contractor sets themselves, applied to the total),
-- not Housecall Pro's automated address-based multi-jurisdiction calculation
-- (that requires a paid third-party tax API and is out of scope while there's
-- no revenue to justify it -- flagged as a possible future upgrade, not
-- planned).
--
-- STATUS: NOT YET APPLIED anywhere as of writing. Apply to
-- leeward-staging-internal (dnlkmxetxhcwlrjzncwp) first per this
-- initiative's staging-first rollout constraint -- there is no local-dev-
-- blocking reason (unlike the Estimate Phase 2 and Payments migrations) to
-- apply early to production this time.
--
-- Why a single column on `projects`, not a new table
-- --------------------------
-- Per Ryan's explicit decision: one tax rate per record (not per line item,
-- not an org-level default), set once and editable, applied to the whole
-- running total (baseline + approved change orders) rather than itemized
-- per line. This mirrors exactly how the record's title/client info are
-- already stored and edited today -- a plain column on `projects`, updated
-- via the browser Supabase client under existing RLS (see
-- saveProjectRename() / the client-info save handler in
-- app/dashboard/page.tsx for the established pattern), not a new
-- server route or a new table.
--
-- Percentage, not a decimal multiplier
-- --------------------------
-- Stored as e.g. 7.25 (meaning 7.25%), matching how a contractor would
-- naturally type it into a form field. Application code divides by 100 when
-- computing the tax amount. Bounded 0-100 by a check constraint -- no
-- real-world sales tax rate approaches 100%, and this catches an obvious
-- data-entry mistake (e.g. typing "725" instead of "7.25") before it
-- corrupts a record's numbers.
--
-- Nullable, defaults to NULL (not 0)
-- --------------------------
-- NULL means "no tax configured" and every existing record -- and every new
-- record until a contractor explicitly sets a rate -- behaves exactly as it
-- does today: Subtotal/Tax/Total collapses back to just Total, and
-- Balance Due math is completely unaffected. A default of 0 would have the
-- same numeric effect but would make it impossible to distinguish "this
-- record genuinely has 0% tax" from "tax was never configured" -- not a
-- distinction the product needs today, but free to preserve and costs
-- nothing.

alter table public.projects
  add column if not exists tax_rate numeric(5, 2) null;

alter table public.projects
  add constraint projects_tax_rate_range
  check (tax_rate is null or (tax_rate >= 0 and tax_rate <= 100));
