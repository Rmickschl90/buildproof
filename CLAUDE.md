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
individually. Phases 4 through 6 (Authentication Integration, Project
Ownership Migration, Billing Integration) remain drafted and decisions
resolved as of 2026-07-14 only — see the corresponding design notes in
Current Implement/ — no implementation has started on them yet.
Phase 7 (Offline Validation) has a design DRAFTED (attribution-at-queue-
time approach, reconnect billing recheck) but NOT YET VALIDATED — no
actual testing against real offline/reconnect/multi-device scenarios
has been performed. Given this touches the most fragile, most
previously-broken part of the codebase (see failed-experiment history),
Phase 7's design must be actually exercised end-to-end before being
treated as resolved, and before Phase 8 (Production Rollout) proceeds
on top of it.

Phase 4 (Authentication Integration) is next.

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
