# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

Leeward (formerly BuildProof, company: Linque Labs LLC) is a contractor/field-team communication timeline and dispute-ready documentation tool: contractors log timestamped project entries, request client approvals, and send finalized "update packs" (with embedded PDF exhibits) that clients view via share links. Built-in dispute protection includes locked/finalized records, integrity hashes, and read-only dispute packets with delivery/view history. It is mobile-first and must work fully offline in the field, syncing when connectivity returns.

Current stage: **LIVE on Google Play**, in "launch operations" phase. Architecture is considered locked/stable. Current focus is production stability, customer support, and App Store (iOS) prep — not new features, EXCEPT for the sanctioned Team Accounts V1 build (see below).

See `BUILDPROOF_MASTER_HANDOFF.md` for rollout history and `REGRESSION_LEDGER.md` (append-only) for the history of verified fixes — check both, along with the Obsidian notes vault (below), before touching offline/send/reconnect/PDF code or proposing architecture changes.

## Commands

```
npm run dev     # next dev -p 3000
npm run build   # next build
npm run start   # next start -p 5000
```

There is no lint script and no test suite configured in this repo — do not assume `npm test` or `npm run lint` exist.

Native shells live in `android/` and `ios/` (Capacitor-generated Android Studio / Xcode projects). They are built/run through Android Studio / Xcode, not npm scripts. After changing web code that the native shell depends on, sync with `npx cap sync`.

Deploys go through Vercel (`vercel --prod`). The local repo is linked to a specific Vercel project via `.vercel/project.json` — verify which project (staging vs production) is currently linked before deploying; see "Deployment flow" below.

## Architecture

**Stack**: Next.js 16 (App Router, TypeScript strict), Supabase (Postgres + Auth + Storage, RLS-enabled), Stripe (subscriptions), pdf-lib (PDF generation), Capacitor (Android/iOS native wrapper), Resend (email) and Twilio (SMS) for delivery, deployed on Vercel.

### API layer

All backend logic is Next.js route handlers under `app/api/**/route.ts` (no separate backend service). Route handlers use `lib/supabaseServer.ts` (service-role client — server-only, never import from a `'use client'` file) to bypass RLS when needed, and authenticate callers via `lib/requireUser.ts`, which expects a `Authorization: Bearer <supabase-access-token>` header rather than cookies.

Client code calls authenticated endpoints via `lib/fetchAuthed.ts`, which attaches the current Supabase session token to `fetch`.

Note there are two nearly-identical browser Supabase clients — `lib/supabase.ts` and `lib/supabaseBrowser.ts`. Both exist in active use; check which one a given file already imports rather than introducing a third.

Key route groups: `proofs/*` (timeline entries), `attachments/*` and `approval-attachments/*` (file upload/insert, split into two steps), `approvals/*` (create/send/respond, token-based client approval flow), `send/*` (create-job/process-job async send pipeline + email/sms delivery), `share/*` (public share-link view/tracking), `export/pdf` (dispute packet generation), `billing/*` (Stripe checkout/portal/status).

### Offline-first architecture

This is the most architecturally significant part of the codebase. Every mutation a contractor can make in the field (create project, add entry, attach photos, create/send approval, send update) has an **outbox → flush** pair in `lib/` (e.g. `offlineAttachmentOutbox.ts` / `offlineAttachmentFlush.ts`, `offlineApprovalOutbox.ts` / `offlineApprovalFlush.ts`, `offlineSendOutbox.ts` / `offlineSendFlush.ts`, plus the `*Approval*` and `*ApprovalAttachment*` variants). All outboxes share a single IndexedDB database (`buildproof-offline`) with one object store per queue.

Reconnection is coordinated by a **single** orchestrator, `app/components/OfflineReconnectBootstrap.tsx`, which detects connectivity (online/focus/visibilitychange/interval polling against a `/login` HEAD probe — real connectivity, not just `navigator.onLine`) and dispatches `window` events (`buildproof-run-reconnect-flow`, `buildproof-data-changed`) that the dashboard and other listeners react to. **Do not add a second reconnect trigger/orchestrator** — competing reconnect owners and duplicate flush loops are a previously-diagnosed failure mode (see handoff doc).

**Locked rule**: camera-originated `File`/`Blob` objects must be converted to durable `ArrayBuffer` bytes *immediately* when queued, never persisted as raw `File`/`Blob` into IndexedDB. iOS Safari/PWA camera-originated blobs are unstable across reconnect replay, idle/suspension, and IndexedDB hydration — this was the root cause of a major mobile replay bug and applies to every attachment queue.

`app/components/OfflineAppShellBootstrap.tsx` + `public/sw.js` handle app-shell caching so `/dashboard` loads while offline (service worker caches static assets and falls back to a cached `/dashboard` on failed navigations).

### Data/trust model

- **Live timeline** (dashboard, dynamic, drafts visible to the owner) is distinct from **send snapshots** (frozen at send time) and **share links** (client-facing, live-updating but never showing drafts). Don't blur these — client-facing surfaces must never render draft entries/approvals.
- Approval lifecycle is fixed: `draft → pending → approved / declined / expired`. Don't introduce new statuses. Approval sends claim ownership atomically server-side (`WHERE status = 'draft'`) to prevent duplicate-send races from reconnect retries — don't rely on client-side timing/UI state to prevent duplicates.
- Timestamps preserve **jobsite-local event time**, not viewer-localized time: every timeline event stores UTC instant + timezone id + timezone offset at creation, and display uses the stored offset (DST-safe). Entries display `created_at`; approvals display `sent_at` (fallback `created_at`); `locked_at`/`responded_at` are metadata only, not primary timeline timestamps.

### PDF export

`lib/pdf/buildProjectPdf.ts` (pdf-lib) builds dispute packet PDFs, including embedding attachment images/exhibits. On Android, PDFs are saved via a custom native Capacitor plugin (`PdfSaver`, registered in `app/dashboard/page.tsx`) rather than a browser download, gated behind `Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("PdfSaver")`, since Android's WebView can't drive normal blob-download UX.

### Dashboard

`app/dashboard/page.tsx` is a large single client component (the primary contractor UI: project list, timeline, entries, approvals, sends, PDF export, native bridge calls). Expect to `Grep` within it rather than reading it in full.

## Working in this codebase

- Treat offline/reconnect/send/approval/PDF-export/proof-remap systems as protected: they've each been through multiple failed-experiment cycles (documented in `BUILDPROOF_MASTER_HANDOFF.md` under "Failed Experiments"/"Do Not Touch"). Prefer small, surgical, isolated changes over refactors in these areas, and check the handoff doc for prior art before re-attempting something that sounds like a fix already tried.
- Required env vars (see `.env.local`, not committed): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`, `INTERNAL_APP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `RESEND_API_KEY`, `RESEND_FROM`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
- Deployment flow is staging-first: `buildproof-staging.vercel.app` for iteration/validation, `leeward-staging-internal.vercel.app` (renamed from `buildproof-kappa.vercel.app` on 2026-07-15) is the real staging target — see "Staging Environment" below. Note it is NOT reliably access-protected: Vercel Authentication doesn't enforce on this team's Hobby plan regardless of the project setting. The local Vercel link (`.vercel/project.json`) normally points at staging — confirm the deploy target before running `vercel --prod`, and if output ever references the old `buildproof-kappa` name unexpectedly, stop and verify linking before proceeding.

## Notes Vault Reference

Full project history and rules live in the Obsidian vault at:
C:\dev\BuildProof Brain (51 notes across 14 folders)

Key folders:
- 01-Current-State/ — current product identity and principles
- 03-Architecture/ — offline, send, and approval architecture docs
- 05-Decisions/ — locked architecture rules, protected systems list
- 08-Lessons-Learned/ — past failures/regressions, avoid repeating
- 09-Regression-Ledger/ — known-good recovery points
- 10-Handoffs/Current Project Handoff.md — living master status doc,
  single source of truth for current state
- Current Implement/ — Team Accounts V1 implementation plan + progress log

Check relevant notes before proposing any non-trivial change.

## Production Safety Rules

- Production deployment is MANUAL (`vercel --prod`), not git-triggered.
  Pushing/merging branches does not by itself deploy anything. But the
  deployed app is what the Android/iOS wrapper loads directly via the
  live production URL, so a manual production deploy can affect real
  customers within minutes.
- app.getleeward.com = production (real customers, Android wrapper loads
  this directly). buildproof-staging.vercel.app = staging/testing.
- Leeward is in "launch operations" phase — architecture is locked/stable.
  Do not propose architecture changes, refactors, or rewrites unless
  explicitly asked (current sanctioned exception: Team Accounts V1, see
  below).
- Before making ANY code change, create a new branch first. Never commit
  or push code changes directly to main.
- Test changes against staging (buildproof-staging.vercel.app) before
  promoting to production.
- Protected systems — do not modify without explicit confirmation:
  reconnect orchestration, offline sync/queue ownership, proof remap
  architecture, send snapshot architecture, approval lifecycle,
  attachment replay, PDF/export & dispute packet architecture,
  service worker/IndexedDB, Supabase auth, billing webhook &
  subscription enforcement, production deployment/Vercel alias routing.

### Staging Environment (fixed 2026-07-15)

Use leeward-staging-internal.vercel.app (renamed from buildproof-kappa.vercel.app
on 2026-07-15, same Vercel project) for testing/staging going forward - NOT
buildproof-staging.vercel.app (that one still shares production's database
despite its name, due to a Vercel domain-scoping limitation that wasn't
fully resolved). leeward-staging-internal runs code matching production but
reads/writes to a genuinely isolated Supabase project (leeward-staging,
dnlkmxetxhcwlrjzncwp.supabase.co) - safe to run migrations and test against.

Note: Vercel Authentication (Deployment Protection / the "SSO wall") does not
actually enforce on this team's Hobby plan, regardless of the project's
ssoProtection setting - confirmed 2026-07-15. The old buildproof-kappa.vercel.app
link was previously shared with testers and was never reliably access-controlled;
it was retired (project renamed, old domain unbound) rather than relying on that
setting. Do not assume this project is access-protected by that setting alone.

Known limitation: email sending (Resend) is NOT isolated - staging shares
the same Resend account as production, so any email actually triggered
during staging tests is a real email. Test using your own email addresses.

Full detail: 09-Regression-Ledger/Staging Environment - Resolved.md in the
Obsidian vault (renamed from the original gap note).

## Active Build: Team Accounts V1

This is the current, deliberate, sanctioned exception to "architecture
is locked." It is being moved up ahead of the original Phase 2 timeline
to restructure ownership around organizations before the customer base
grows larger (to avoid painful migrations later).

Source of truth (read before any Team Accounts work):
- Current Implement/Team Accounts V1 Implementation.md — master plan
- Current Implement/Team Accounts V1 Progress Log.md — dated progress
- 06-Roadmap/Team Accounts Architecture Assessment.md — high-level findings
- 06-Roadmap/Team Accounts V1 Architecture Audit.md — detailed system audit

### Status
Phase 0 (audit + planning) COMPLETE. Phase 1 (Organization Data Model)
is implemented and behaviorally tested on staging — schema applied,
RLS policies and the owner-removal trigger verified end-to-end (not
just schema-checked), including one real bug (an infinite-recursion
policy) found and fixed along the way. Phase 2 (Membership Model) is
also implemented and behaviorally tested on staging: the three
authorization helpers (getUserOrganizationContext,
canUserAccessProject, canUserManageOrganization), the organization
create/list-members/remove-member routes, and migration of all 17
existing routes with inline ownership checks to canUserAccessProject —
all exercised as real signed-in users on staging, not just type-checked.
Phase 3 (Invitation System) is also implemented and behaviorally
tested end-to-end on staging: all four routes (invite/create,
invites/[token] GET, invites/[token]/accept, invites/[token]/revoke)
were exercised together as a complete flow — invite created, public
pre-login preview, a genuinely new user account created and accepting,
the new member appearing in the roster, a duplicate-accept correctly
rejected, and a revoked invite correctly blocked — not just
individually. Phase 4 (Authentication Integration) is implemented:
GET /api/auth/context is behaviorally verified on staging (owner case
and no-org case both confirmed), and the dashboard now calls it on
initial load and inside the reconnect flow. The dashboard-integration
half is confirmed only at the build level (the call is present in the
compiled/shipped bundle) — live in-browser runtime behavior (the fetch
actually firing on page load and on reconnect, orgContext populating)
has NOT been observed, since browser tooling was unavailable this
session; still worth an actual browser check before relying on it.
Phase 5 (Project Ownership Migration) is implemented. The projects
table's RLS was extended for organization access via a new migration,
20260717120000_extend_projects_rls_for_org_access.sql (adds permissive
projects_select_org_member and projects_update_org_member policies —
OR'd with the original individual-ownership policies rather than
replacing them, since the original policies' exact names aren't known
to this repo's tooling — plus a restrictive projects_insert_valid_
organization_id policy that rejects organization_id being set to an
org the inserting user doesn't belong to). Applied to staging and
behaviorally verified with real signed-in test users: a non-owner org
member can now SELECT and UPDATE another member's org project, and an
insert with a foreign organization_id is correctly rejected (403,
42501). New-project creation (addProject() in app/dashboard/page.tsx)
now sets organization_id on both its online path and its offline-
queue-then-sync path (organizationId captured at queue time, per the
codebase's existing attribution-at-queue-time convention). The online
path is behaviorally verified on staging end-to-end: an org owner's
new project gets organization_id set correctly, a solo user's stays
null, a different org member can immediately see the org-owned project
via the new RLS policies, and cannot see the solo user's project. The
offline-queue-then-sync path is confirmed only at the code/type level
(no browser tooling available this session to drive the actual
IndexedDB queue + reconnect flush) — still worth an actual browser/
offline check before relying on it. NOT YET applied to production
(the RLS migration). Phase 6 (Billing Integration) is implemented:
the organization_subscriptions migration, POST /api/billing/team-
checkout, the Stripe webhook's new organization_id branch
(upsertOrganizationSubscription), POST /api/billing/portal/team, and
the extended GET /api/billing/status (adds source: "individual" |
"organization" | null, grants access if either subscription is
active/trialing). The migration is applied to staging and confirmed —
note a real gotcha hit along the way: a table created directly via the
Supabase SQL Editor got zero GRANTs to anon/authenticated/service_role
(unlike tables provisioned through Supabase's normal path), which left
it fully invisible to PostgREST (schema-cache-style 404s) despite
existing in Postgres and despite repeated NOTIFY/project-restart
attempts — only fixed by explicitly granting privileges to match
organization_members, confirmed via information_schema.role_table_grants
and pg_class directly (not Table Editor, which showed the table before
it was actually queryable). team-checkout is thoroughly behaviorally
verified on staging: owner-only auth (owner succeeds, non-owner 403,
no-org 403), correct checkout-session metadata/price/trial-eligibility,
and — using a genuine Stripe test-mode subscription, not a placeholder
row — the full individual-to-team cancellation path: the real
subscription was actually canceled, a real proration credit invoice
item was generated, and the new team checkout session correctly reused
the existing Stripe customer (confirms the customer vs. customer_email
bug fixed earlier is real and working). POST /api/billing/portal/team
is also behaviorally verified on staging: owner gets a real Stripe
billing portal session URL for the org's Stripe customer, non-owner
member correctly rejected (403). The extended GET /api/billing/status
is behaviorally verified across all three states: an individual-only
active subscription (source: "individual", all fields from the
individual row), an organization-only active subscription (source:
"organization", all fields from the org row, not individual — confirms
the per-source field consistency fix), and neither (source: null,
status: "inactive", every other field null/false). The webhook's
organization_id branch is also behaviorally verified — worked around
the "needs a browser to complete Checkout" limitation by creating a
real Stripe test-mode subscription directly via the Stripe API (not
Checkout) with metadata.organization_id/billing_owner_id set, since
Stripe fires customer.subscription.created for any new subscription
regardless of how it was created. Confirmed via three independent
signals: the resulting organization_subscriptions row matched exactly
(only creatable via upsertOrganizationSubscription, since the table
has no client-side INSERT policy), Stripe's event object showed
pending_webhooks: 0 (fully delivered, no retries pending), and Vercel's
own function logs showed POST /api/stripe/webhook 200 at the exact
timestamp of the test. Phase 6 is now fully behaviorally verified on
staging — every route and the webhook branch. NOT YET applied to
production (the organization_subscriptions migration).
Phase 7 (Offline Validation) is implemented but only partially tested —
real progress, but it does NOT yet meet this phase's own stated
validation bar (see below). Two pieces:

1. Attribution-at-queue-time: creatingUserId added to all 7 offline
outbox record types (proofs, attachments, approvals, approval
attachments, approval sends, projects, sends), captured at the moment
an action is queued. Before implementing anything, investigated all 5
design-doc-listed flush files against their actual server routes: only
2 of the 5 (attachments, approvals) have a real attribution column in
the schema today (attachments.user_id, approval_requests.created_by) —
proofs, approval attachments, and approval sends have no attribution
column at all, so nothing was changed for those three. For the 2 real
fixes, flush logic now sends creatingUserId to the server, which
validates it via canUserAccessProject() before trusting it (falls back
to the authenticated caller if validation fails or the field is
missing). Also fixed a real authorization bug found along the way:
approval-attachments/insert was gating on .eq("created_by", user.id)
as an authorization check, not just a read — a route Phase 2's
created_by-to-canUserAccessProject migration appears to have missed —
which would have broken attachment uploads for the exact reconnect-
misattribution scenario this phase exists to fix. This core fix IS
genuinely behaviorally proven on staging: both the positive case
(authenticated as Employee B, creatingUserId set to Employee A's real
id — resulting attachments.user_id and approval_requests.created_by
both correctly show A, not B) and the negative/fallback case (a
fabricated, non-member creatingUserId correctly falls back to the
authenticated caller B, proving the validation actually rejects
invalid attribution rather than trusting anything sent) were tested
with real API calls against staging, using two real signed-in org
members.

2. Reconnect billing re-check: implemented (checkBillingOnReconnect()
inside runReconnectFlow(), reusing the Phase 4 refreshOrgContext()
pattern) but has NOT been behaviorally tested at all — zero
verification beyond type-check/build passing.

What's NOT yet done, and matters: this phase's own design doc opens
with an explicit warning that its bar for being resolved is genuine
end-to-end exercising — multiple users, multiple devices, real
reconnect timing, actual queued IndexedDB data — not code review or
type-checking. Everything verified so far was server-side API-level
testing (direct authenticated requests simulating what a flush would
send), not actual browser/IndexedDB offline queuing and not real
reconnect timing across real devices — no browser tooling was
available this session to do that. So: the core attribution logic is
now demonstrably correct at the API layer, which is real progress, but
the design doc's actual stated validation bar has NOT been met yet.
Given this touches the most fragile, most previously-broken part of
the codebase (see failed-experiment history), Phase 8 (Production
Rollout) should not proceed on the assumption that Phase 7 is fully
resolved.

Completing Phase 7's actual browser/IndexedDB-level validation (or
explicitly deciding on an alternate way to satisfy the design doc's
bar) is next, before Phase 8.

### Git Workflow During Phase Implementation
When implementing Team Accounts phases, commit and push directly to
the current phase branch (e.g. team-accounts-phase-2) after each unit
of work. Do NOT open a pull request after every commit. Open exactly
one PR per phase, into the parent phase branch, only when explicitly
requested.

### Workflow Notes
- Native Android/iOS platform history is now reconciled (previously
  diverged since ~2026-05-22 — see 09-Regression-Ledger/Branch
  Divergence - Native Platform Gap.md): merged via reconcile-native-
  platform (android-pdf-download-native-safe into team-accounts-
  phase-1), verified with a clean `next build` and a successful
  `./gradlew assembleDebug`. Phase 4 can proceed.

### Locked Decisions (do not re-litigate)
- Roles: Owner (billing, invites, removes members, full access) and
  Member (full project access) ONLY. No admin/read-only/custom roles,
  no departments, no per-project permissions — ever, in V1.
- Organizations own projects (not users). Existing user-owned projects
  will migrate to org ownership later.
- All org members can access ALL org projects — no visibility
  restrictions in V1.
- Users belong to only ONE organization in V1.
- Removed members lose access immediately.

### Explicit Non-Goals for V1
Admin roles, project-level permissions, read-only users, custom roles,
department-based access, seat pools, role hierarchies, multi-org
membership, ownership delegation.

### Key Risks Identified in Audit (address carefully in design)
- Many fields serve as BOTH attribution (who did this) and authorization
  (who's allowed) — e.g. approval_requests.created_by, send_jobs.user_id,
  attachments.user_id. These must be separated: authorization should
  derive from org/project access; attribution fields stay historical.
- Send job active-job uniqueness is currently scoped per-user, not
  per-project — two team members could collide.
- Export snapshot selection is currently scoped by current user — could
  miss a teammate's send when generating a dispute export.
- A "dual finalization path" exists in send code (email route + process
  route both can finalize proofs) — flagged as needing regression
  testing independent of Team Accounts.
- Offline caches/outbox records currently store NO owner/org context —
  offline architecture changes here are protected-system territory.

### Implementation Phases (sequential, do not skip ahead)
0. Planning — COMPLETE
1. Organization Data Model Design — NOT STARTED (current step)
2. Membership Model
3. Invitation System
4. Authentication Integration
5. Project Ownership Migration
6. Billing Integration
7. Offline Validation
8. Production Rollout

Immediate next step: inventory current user/account tables, then design
organization ownership model, membership model, invitation model, and
migration strategy for existing (241) projects — architecture/design
only, no coding yet.
