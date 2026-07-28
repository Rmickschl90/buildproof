# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

Leeward (formerly BuildProof, company: Linque Labs LLC) is a contractor/field-team communication timeline and dispute-ready documentation tool: contractors log timestamped project entries, request client approvals, and send finalized "update packs" (with embedded PDF exhibits) that clients view via share links. Built-in dispute protection includes locked/finalized records, integrity hashes, and read-only dispute packets with delivery/view history. It is mobile-first and must work fully offline in the field, syncing when connectivity returns.

Current stage: **LIVE on Google Play**, in "launch operations" phase. Architecture is considered locked/stable. Current focus is production stability, customer support, and App Store (iOS) prep — not new features. Team Accounts V1 (see below) was the one sanctioned exception to this and is now COMPLETE as of 2026-07-23, fully deployed to production and genuinely behaviorally verified there (real signup, real live-mode Stripe payment, real invite, real dissolve) — not just on staging.

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

### Local Dev Environment — known-good config (confirmed 2026-07-26)

Ryan's local `.env.local` is deliberately pointed at **production** Supabase
(`uzuzwhzilhakewtbtzxh.supabase.co`), not staging — his real account/
subscription data lives there, and local dev has always run against it.
`STRIPE_SECRET_KEY` locally is a **live-mode** key, not test — billing/
checkout flows tested from local dev create real charges. `NEXT_PUBLIC_
APP_URL` and `INTERNAL_APP_URL` are both `http://localhost:3000` so auth
redirects and internal server-to-server calls (`app/api/send/process-job/
route.ts` calls `${INTERNAL_APP_URL}/api/send/email`) stay local instead of
silently hitting a deployed environment.

For a magic-link login to actually redirect back to `localhost:3000` (rather
than wherever a given Supabase project's default Site URL points), that
Supabase project's Authentication → URL Configuration → Redirect URLs
allowlist must include `http://localhost:3000/**`. Supabase silently ignores
a requested `emailRedirectTo` that isn't on this allowlist and falls back to
the project's Site URL instead of erroring — this is not a Next.js/env-var
issue and won't be fixed by anything in `.env.local`, code, or the dev
server. Confirmed added to the `leeward-staging-internal` Supabase project's
allowlist on 2026-07-26; not yet confirmed on production's Supabase project
(add there too if local dev ever needs to point at production and hits the
same symptom).

**Before running any command that can rewrite `.env.local`** (`vercel link`
followed by "pull environment variables," `vercel env pull`, "overwrite
existing file" prompts, etc.): copy it first —
`Copy-Item .env.local .env.local.backup-<date>` — and diff the result before
trusting it. `vercel env pull` only pulls one environment's vars (defaults
to "development") and silently *removes* any key from the file that isn't
defined there, even if that key has a real, correct value locally — it does
not merge. This exact sequence (link → pull → blind "yes" to overwrite) wiped
Supabase/Stripe/Twilio/Resend credentials from local `.env.local` on
2026-07-26 and cost significant time to reconstruct from old backup files
that happened to still be sitting in the repo folder — don't rely on that
luck existing next time.

If the app looks like it didn't pick up a recent code or config change after
a restart (a tab bar, a highlighted element, an env var) despite the source
file being correct: this repo's service worker (`public/sw.js`) aggressively
caches the app shell. Don't spend time re-diagnosing the code — go straight
to DevTools → Application → Storage → "Clear site data," then reload. This
has been the actual cause of at least three separate "still broken" reports
in a single session (2026-07-25/26) that turned out to be stale cache, not
code.
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
  customers within minutes. This is enforced as of 2026-07-20 (see
  incident note directly below) — before that date it was NOT actually
  true.
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

### Incident (2026-07-19/20): accidental production rollback via git auto-deploy — fixed

The Vercel project `buildproof-staging` (which despite its name serves
`app.getleeward.com`, real production - see the naming confusion noted
below under Staging Environment) had `productionBranch: "main"` with
git-triggered deployments enabled (`gitProviderOptions.createDeployments:
"enabled"`), contradicting the "MANUAL, not git-triggered" rule above.
This had gone unnoticed because `main` itself had been essentially
frozen since 2026-04-16 (only a handful of commits since), while all
real development - the entire Team Accounts V1 epic and everything
else - happened exclusively on the `team-accounts-phase-*` branch
line and reached production only via occasional manual `vercel --prod`
deploys from other branches (e.g. `android-pdf-download-safe`).

Merging PR #28 (a small, unrelated, correctly-isolated fix) into this
stale `main` triggered an automatic git-based production deployment,
which aliased `app.getleeward.com` to `main`'s ~3-month-old state -
overwriting the real, current, manually-deployed build and silently
dropping ~211 commits of shipped work (Stripe/billing integration,
subscription enforcement, PDF exhibit embedding, etc.) from the live
site. Caught and diagnosed within the same session: confirmed via
Vercel's build logs (`Cloning ... Branch: main, Commit: 4df569e`) and
directly via the project settings API (`productionBranch: "main"`).
Production was restored by redeploying the last-known-good commit
(`a5dc5cfebc674729cbbfe4a7a69d508a24665378`, "Add native Android
dispute PDF save path") from a clean detached-HEAD worktree via
`vercel deploy --project buildproof-staging --prod`, confirmed
afterward via the deployment's own `meta.gitCommitSha` (not just CLI
output) matching exactly.

Fixed: set `commandForIgnoringBuildStep` on the `buildproof-staging`
project to:
```
if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then exit 0; else exit 1; fi
```
This tells Vercel to skip (ignore) any build/deploy triggered by a push
to `main` specifically, while leaving other branches unaffected.
Confirmed applied via the project settings API afterward. Pushing or
merging into `main` can no longer auto-deploy to production - a
manual `vercel --prod` (or `vercel deploy --prod`) is required again,
restoring the rule stated above as actually true.

Separately (found during the same investigation, undocumented until
now): `user_subscriptions.current_period_start` and
`current_period_end` are null on every row in production, including
real active subscriptions - see "Known Data Issue" further below.
Unrelated to the rollback itself.

Follow-up (2026-07-21/22): the identical misconfiguration existed on
`leeward-staging-internal` too - same `productionBranch: "main"`, same
`gitProviderOptions.createDeployments: "enabled"` - and had already
fired at the exact same moment as the production incident (both
projects' auto-deploys triggered off the same PR #28 merge into
`main`, 5 seconds apart). This went unnoticed for about a day and a
half: `leeward-staging-internal` had been silently serving `main`'s
near-empty state (missing `OfflineReconnectBootstrap.tsx`, every
Team Accounts route, the invite page - everything) since
2026-07-19 19:05 CDT, right up until this was caught during Phase 8
planning while cross-checking staging's deployment history against
production's. Confirmed via `vercel inspect` and the project settings
API, the same way the original incident was diagnosed. Notably, the
Phase 7 invite-page/dashboard-fix behavioral testing documented above
is unaffected - both were tested before 19:05 CDT that day, strictly
prior to the overwrite - but nothing was verified against staging
between then and this discovery.

Fixed the same way: `commandForIgnoringBuildStep` set on
`leeward-staging-internal` to skip `main` specifically, confirmed via
the project settings API. Then restored by redeploying
`team-accounts-phase-1`'s current tip
(`52862588a62945a49443cbe246002f5739023750`) to
`leeward-staging-internal` via `vercel deploy --project
leeward-staging-internal --prod`, confirmed afterward via the
deployment's own `meta.githubCommitSha` matching exactly. Both
`buildproof-staging` (production) and `leeward-staging-internal`
(staging) now have the same protection - worth checking whether any
other Vercel project tied to this repo has the same
`productionBranch: "main"` + auto-deploy combination before assuming
this is fully closed out.

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

### Known Data Issue: user_subscriptions period columns are always null

Found 2026-07-19/20 while investigating an unrelated production incident
(an accidental rollback of app.getleeward.com caused by merging into a
long-stale `main`, since restored). Confirmed directly against
production: both `current_period_start` and `current_period_end` are
null on every row in `user_subscriptions`, including real, actively
billing accounts (verified via Stripe's live API against
sub_1TlcFY2WIlxElWw0U7ViTJB0 - a genuine active subscription).

Root cause: `app/api/stripe/webhook/route.ts`'s `upsertSubscription()`
reads `sub.current_period_start` / `sub.current_period_end` off the
top-level Stripe Subscription object. On this Stripe API
version/account, those fields no longer exist at that level - the real
values live per line item, at
`subscription.items.data[0].current_period_start` /
`.current_period_end`. So every webhook upsert has been writing null
for both columns, for every subscription, since this code was written -
not something the rollback caused.

Practical impact, traced through the codebase: `current_period_start`
has zero consumers anywhere in the app. `current_period_end` is read
only by `GET /api/billing/status`, which returns it as
`currentPeriodEnd` - but `app/subscribe/page.tsx` (the only place that
types it) fetches it and never actually reads `.currentPeriodEnd`
anywhere. Billing enforcement (dashboard boot gate, `/subscribe`
redirect, Phase 7's `checkBillingOnReconnect`) only ever checks
`status`, never the period fields. The "Manage Billing" button opens
Stripe's own hosted customer portal, which shows real renewal dates
live from Stripe, unaffected by this DB bug. So: real, latent data
corruption in a billing table, but no currently-shipped user-facing
behavior depends on either column - it's a landmine for whenever
someone adds period-based display/logic that reads from the DB instead
of Stripe directly. NOT fixed as of this writing (billing webhook is a
protected system - flagging, not touching without explicit
confirmation).

## Known Issue: Email Deliverability (Project Update emails landing in spam)

Found 2026-07-27 while investigating Ryan's report of a stuck attachment on
"212 vine st" (staging) — a real, previously-undocumented issue, distinct
from the attachment/storage-bucket bug found in the same session (see
Regression Ledger for that one). Project Update emails sent via Resend show
`status: "Delivered"` in both our `message_deliveries` table and Resend's
own dashboard, but were not landing in the recipient's visible inbox or
spam folder when checked from an IMAP client (Outlook on desktop, connected
to the same Gmail account) — only visible when checked directly via Gmail
on the recipient's phone, where the emails genuinely were sitting in Junk.
Root cause of the *visibility* confusion: Outlook over IMAP frequently does
not sync/display Gmail's `[Gmail]/Spam` folder unless explicitly
subscribed — a client quirk, not evidence of a deeper delivery failure.
The real, still-open problem is that these emails ARE being classified as
spam by Gmail in the first place.

Investigated and ruled out as the cause: `buildproof.app`'s Resend domain
DNS is correctly configured — both DKIM and SPF show `status: verified`
directly from Resend's own domain API (SPF lives on the `send.`
subdomain per Resend's standard setup, not the root domain — an earlier
in-session claim that the root domain was missing an SPF record was
wrong and has been corrected). DMARC was set to `p=none` (monitor-only);
tightened to `p=quarantine` this session as a safe, low-risk hardening
step, but this is **not expected to fully resolve** the spam
classification on its own — flagging clearly so this isn't mistaken for
a completed fix.

Most likely real contributors, neither address by the DMARC change alone:
domain/brand mismatch (mail sent as "Leeward" from `noreply@buildproof.app`,
not a domain matching the product's actual name/URL, which is a known
spam-scoring signal independent of valid authentication) and ordinary new
sending-domain reputation (the domain was created in Resend 2026-03-06,
still relatively young, low historical volume).

**Deferred fix, explicitly flagged by Ryan as a future item once revenue
allows it**: verify `getleeward.com` as a second sending domain in Resend
and switch `RESEND_FROM` to send from that domain instead, so the sending
domain matches the actual branded product name. Blocked today by Resend's
plan limit — the current plan allows only 1 verified domain
(`create-domain` for `getleeward.com` returned
`"Your plan includes 1 domain. Upgrade to add more."`) — this requires a
paid plan upgrade first. Not started; do not assume this is in progress
without checking back with Ryan on the Resend plan/billing decision.

## Fixed: Duplicate-Send Cooldown Guard (2026-07-27)

Found in the same session as the email deliverability issue above:
while troubleshooting the (separately-fixed) stuck-attachment bug, Ryan
retried "Send Update" repeatedly against a project whose send pipeline
*looked* stuck. Once the real blocker cleared, several genuinely
independent sends went out — 4 separate `send_jobs` rows and 4 delivery
records for what should have been one update, confirmed via Resend's
dashboard and our own `message_deliveries` table.

Root cause: `app/api/send/create-job/route.ts`'s existing duplicate
guard only checked for a prior job still in an *active* status
(`pending`/`processing`/`retrying`). Once a job reached a terminal state
— `sent` or `failed` — the guard no longer applied, so a retry after the
prior job finished was treated as a brand-new, legitimate send request.

Fix: the active-only lookup was replaced with a lookup of the most
recent job for that project (any status) plus a 3-minute cooldown
(`SEND_COOLDOWN_MS`, measured from `processed_at` falling back to
`created_at`). A terminal job within the cooldown window is now reused
(`reused: true, cooldown: true`) instead of a new job being created, with
a clear user-facing message rather than a silent no-op. Server-side only
— `lib/offlineSendFlush.ts` already generically re-checks whatever
`jobId` `create-job` returns and reacts to its real status, so no client
change was needed.

Behaviorally verified on `leeward-staging-internal`: created a real send
job, let it reach `status: "sent"` (one real test email sent to Ryan's
own inbox, per his explicit one-time approval), then immediately called
`create-job` again with identical params — response was `reused: true,
cooldown: true`, same `jobId` as the first call, no new job row created,
no second email sent. Full detail in `REGRESSION_LEDGER.md` under
"DUPLICATE-SEND COOLDOWN GUARD ADDED — 2026-07-27".

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
(the RLS migration).

Correction (found during Phase 7 browser testing): the RLS layer above
was and is correct — verified again directly via PostgREST with a real
member token. But "behaviorally verified" here meant verified at the
RLS/API layer only, not through the actual dashboard UI that's supposed
to rely on it. The dashboard's own project-list query had an
independent bug (see Phase 7) that made org-shared visibility
non-functional in the actual product despite RLS being sound. Direct
RLS verification is not the same as verifying the UI built on top of
it — a distinction this phase's sign-off missed.

Phase 6 (Billing Integration) is implemented:
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
Phase 7 (Offline Validation) is implemented and now genuinely
behaviorally verified end-to-end in a real browser session, meeting
the design doc's own stated bar: real offline queuing, a real
device/account switch, real automatic reconnect timing, and actual
queued IndexedDB data — not code review or API-simulated checks. Two
pieces:

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

That API-level proof has now been superseded by a genuine
browser/IndexedDB end-to-end run. Queued a real approval offline as
the org owner (Employee A) via a forced navigator.onLine=false
override — the app's real offline code path, not a mock — and
confirmed the record landed in IndexedDB (buildproof-offline /
offline_approvals) with creatingUserId set to A's real user id.
Logged out and signed in as a second, genuinely distinct org member
(Employee B, created via the real invite-create/accept API flow) on
the same browser/device, which is exactly the cross-account IndexedDB
persistence scenario this phase exists to address. On a real
online-transition reconnect (interval-detected, not manually
dispatched), the queued approval flushed automatically while B was the
authenticated session, and the resulting approval_requests.created_by
row correctly shows A, not B — attribution survives the account
switch on a shared device.

2. Reconnect billing re-check: implemented (checkBillingOnReconnect()
inside runReconnectFlow(), reusing the Phase 4 refreshOrgContext()
pattern) and now behaviorally verified — previously zero verification
beyond type-check/build passing. Forced Test Org Beta's
organization_subscriptions.status to "canceled", triggered a real
offline→online transition with a project open, and confirmed the
reconnect flow's billing re-check fired and surfaced the exact expected
non-silent message ("Your subscription is no longer active — some
features may be limited until billing is resolved. Visit Subscribe to
renew.") rather than failing silently or retrying indefinitely. Billing
was restored to active immediately after to leave staging clean.

This phase's own stated validation bar — genuine end-to-end exercising
with real reconnect timing and actual queued IndexedDB data, not code
review or type-checking — has now been met for both pieces above.

Two additional things surfaced during this browser testing, both worth
tracking separately from the attribution fix itself:

- Found and fixed a real regression against Team Accounts V1's core
promise: the dashboard's project-list query (loadActiveProjects() in
app/dashboard/page.tsx) filtered .eq("user_id", uid) on top of RLS, so
an org member's project list only ever showed projects they personally
created — never a teammate's org-owned project. This directly
contradicted the locked decision "all org members can access all org
projects, no visibility restrictions in V1." Phase 5's RLS was correct
and had already been proven correct via direct PostgREST queries with
a real member token, but nobody had exercised the actual dashboard
fetch code until this session — see the correction added to Phase 5's
entry above. Fixed by dropping the redundant user_id filter (safe,
since RLS already ORs individual ownership with active org
membership); committed (30d2ce3c) and deployed to
leeward-staging-internal; confirmed afterward that a second org member
could then see and open the owner's project through the real dashboard
UI.

- Found and fixed: there was no app/invite/[token] frontend page at
all — only the backend API routes existed (create/GET/accept/revoke).
The invite email's "Accept Invite" link pointed at a URL that 404'd in
the browser. Phase 3's "full end-to-end test" of the invite flow was
real but was driven entirely via direct API calls, never by an actual
user clicking the emailed link — so a real user could not previously
accept a team invite through the product at all. Built
app/invite/[token]/page.tsx (commit 503d231d): a self-contained client
page that loads the invite, handles inline sign-in (either entering
the emailed code or clicking the emailed magic link — both land back
on this same page), detects a signed-in wrong-account mismatch, and
calls the accept endpoint. Deliberately does NOT reuse the generic
/login -> /auth/finish -> /auth/finish/signing-in redirect chain: that
chain unconditionally bounces any user without active individual
billing to /subscribe regardless of redirectedFrom, which is every
brand-new invitee (joining an org is what grants them access) — this
is the same trap manually hit earlier in this session's Phase 7
testing. Also flagged, not fixed, while tracing that chain: a separate
pre-existing bug in app/auth/finish/page.tsx (line ~53) redirects to
/auth/signing-in, a route that doesn't exist — the real page is at
/auth/finish/signing-in. Worth a standalone fix, unrelated to Team
Accounts. (Fixed since — confirmed live in production as of 2026-07-23,
see the dated entry further below.)

The new invite page is genuinely behaviorally verified end-to-end on
staging via real browser sessions and real emailed magic links, not
simulated: already-accepted (409), revoked (410), a real
member-limit-reached (409) hit organically during testing and handled
correctly by the page's generic error passthrough (proving it doesn't
need every message hardcoded), signed-in-as-wrong-account mismatch and
recovery via "Log Out and Continue", a fresh invite's full sign-in +
accept flow via both code entry and clicking the actual emailed magic
link, and a final DB check confirming organization_invites.accepted_at
was genuinely set server-side, not just a client-side illusion.

Phase 8 (Production Rollout) has begun. As of 2026-07-20, all 4
database migrations are now applied and verified on PRODUCTION
(uzuzwhzilhakewtbtzxh) — not just staging:
20260714120000_team_accounts_phase1_data_model.sql,
20260716150000_fix_organization_members_select_recursion.sql,
20260717120000_extend_projects_rls_for_org_access.sql, and
20260717150000_team_accounts_phase6_organization_subscriptions.sql.
Applied one at a time, in order, via the Supabase Studio SQL Editor
(same no-direct-DB-access constraint noted in every migration's own
header — this repo's tooling has no direct Postgres/Management API
access), each verified directly against pg_catalog/information_schema
rather than trusting "it ran successfully" or PostgREST's response.
The known GRANTs gotcha from the Phase 6 migration (documented in that
file's own header) was handled proactively this time — an explicit
GRANT statement was run immediately after table creation and confirmed
via information_schema.role_table_grants, rather than discovered the
hard way again. The organization_members_select_active_member policy
was confirmed to carry the fixed (non-recursive, is_active_org_member()
-based) qual, not the original buggy one, and
projects_insert_valid_organization_id was confirmed genuinely
RESTRICTIVE (not permissive).

One real scare during this process, worth remembering: an early
verification pass appeared to show all 4 tables already existing in
production with real data (1 organization, 5 members, 6 invites, 1
subscription). This turned out to be a Supabase Studio tab mixup — the
query had actually run against staging (dnlkmxetxhcwlrjzncwp), not
production — confirmed decisively by finding the exact same row
(matching UUID and timestamps down to the microsecond) still present
in staging. No production data was ever at risk, but it's a genuinely
easy mistake to make when juggling both projects' SQL Editor tabs
mid-rollout; worth a visible project-ref check before running anything
against production going forward.

Existing production users are unaffected throughout: the new tables
are purely additive, and the extended `projects` RLS policies are
either permissive (OR'd with the original individual-ownership
policies, changing nothing for existing behavior) or only reject
values (`projects_insert_valid_organization_id`) that no
individual-only project can trigger.

Correction (2026-07-22, this paragraph was stale): the two lines above
used to say application code deploy and Stripe live-mode setup were
"NOT YET on production" — that's no longer true and was left
un-updated after the fact. As of 2026-07-21: Stripe live-mode setup is
COMPLETE ($69/month "Leeward Team" price live, up to 5 users,
STRIPE_TEAM_PRICE_ID on production), and application code (Step 3) is
COMPLETE (team-accounts-phase-1 deployed to app.getleeward.com,
verified via commit SHA match). Soft launch (Step 4) is PARTIALLY
complete — see Current Implement/Team Accounts V1 Phase 8 - Production
Rollout Planning.md and the Progress Log for current detail rather
than trusting this file's older phase-by-phase narrative above, which
is written progressively and not always corrected in place when later
sessions move things forward.

### Signup Flow Redesign (2026-07-22)
Sanctioned follow-on to Phase 8, moved up ahead of the existing-user
"Upgrade to Team" button: brand-new visitors can now choose the Team
plan directly at initial signup (no forced individual-account detour).
Source of truth: Current Implement/Team Accounts V1 - Signup Flow
Redesign and Invite UI.md.

Key design decision: organization creation is deferred until the
Stripe webhook confirms payment (not created up front when someone
picks "Team"), so an abandoned checkout never leaves an orphaned org
behind. This is a deliberate divergence from the existing-user
upgrade path (`/api/organization/create`), which still creates the org
immediately since that flow already has an authenticated, established
user.

Three changes, all on branch `team-accounts-signup-flow-redesign`
(commits `3bdddc7b`, `682b07bd`): a new webhook branch in
`app/api/stripe/webhook/route.ts`
(`createOrganizationFromSignupAndUpsertSubscription`, detected via
`pending_organization_name` metadata with no `organization_id`); a new
`POST /api/billing/team-signup-checkout` route; and a Plan Choice +
team-naming step added to `app/subscribe/page.tsx` in front of the
existing (unchanged) individual flow.

Full line-by-line code review completed before any deployment (per
this repo's own rule of not trusting "it builds" as sufficient). Two
real findings, both fixed: (1) the webhook never promoted the Stripe
subscription's own metadata to include `organization_id` after
creating the org, so every future event for that subscription's whole
lifetime would keep re-running the first-time-signup path instead of
the normal one — fixed via a best-effort, non-fatal
`promoteSubscriptionMetadataToOrganizationId` call; (2) the "reuse
existing org" branch didn't check `existingContext.role === "owner"`
before reusing it, which could have let a user who joined an unrelated
org mid-checkout silently attach a new subscription to that org's
billing — fixed, now throws instead.

Deployed to `leeward-staging-internal` and genuinely behaviorally
verified (not just type-checked): signed up as a real new user, chose
Team, paid with a real Stripe test-mode card, and confirmed directly in
Supabase (`organizations`, `organization_members`, and
`organization_subscriptions` rows all correct) and directly in Stripe's
own dashboard (subscription metadata now carries `organization_id`,
confirmed via the Activity Log showing the actual promotion API call
succeed, not just the end state). NOT YET deployed to production.

Next: design and build the Members/Invite UI (the invite backend APIs
from Phase 3 already work, but there is still no dashboard UI for a
new Team owner to actually invite anyone) — see the design doc's
sequencing for what's left before this can go to production alongside
the rest of Phase 8's soft launch.

### Members/Invite UI, Upgrade flow, and Cancel-Team (Dissolve) (2026-07-23)

Sanctioned follow-on to the Signup Flow Redesign above: a lightweight,
work-around UI (not the full Navigation Overhaul — that remains
deferred, see 06-Roadmap/UI Navigation Overhaul - Tabs Instead of
Dropdown Menu.md) so a Team owner can actually invite/remove members,
and any user can upgrade or cancel Team billing, from the existing
dashboard header. Branch: `team-accounts-members-invite-ui`.

Header button logic (`app/dashboard/page.tsx`): a solo/individual user
sees "Upgrade" (opens a plan-picker that also lets an existing Team
owner resume paying for a dormant org); a Team member/owner with an
*active* org subscription (`billingSource === "organization"`) sees
"Invite Team" (owner) or "Team" (member) — gated on real billing
status, not just org membership, so a dissolved-but-still-a-member
state never shows an invite button. Clicking opens the Members panel
(`GET/POST /api/organization/members`, `POST /api/organization/invite`,
`POST /api/organization/invites/[token]/revoke`,
`DELETE /api/organization/members/[id]`, all pre-existing Phase 2/3
routes — this pass only added a dashboard UI on top and one new field
to the members GET response).

New route: `POST /api/organization/dissolve` ("Cancel Team & Return to
Solo", owner-only, confirm-by-typing-the-org-name). Resolves a design
gap this project hadn't addressed: there was no way to leave Team
billing without abandoning the org outright. Key decision: the owner
keeps all org projects (not whoever originally created each one) —
reassigned to `organization_id: null, user_id: <owner>` on dissolve,
since the paying business owner is the one who should retain the
records. Works *with* the Phase 1 locked trigger
(`prevent_owner_removal_from_organization_members`, which hard-blocks
ever removing an owner's own membership row) rather than against it:
the route cancels the Stripe subscription, reassigns all org projects
to the owner, and soft-removes every *non-owner* member
(`removed_at`) — the owner's own `organization_members` row and the
`organizations` row are deliberately left alone (inert, not deleted),
so if the owner later resumes Team billing on the same org, nothing
needs to be re-created. Individual billing (`user_subscriptions`) is
fully separate from org billing, so the owner can immediately buy an
Individual plan right after dissolving.

Bug found and fixed during behavioral testing:
`POST /api/organization/invites/[token]/accept` did a blind INSERT
into `organization_members` after claiming the invite. If a row
already existed for that (org, user) pair — e.g. re-inviting someone
previously removed — the INSERT hit the table's
`unique(organization_id, user_id)` constraint, and the resulting
23505 was mapped to "You are already a member," which
`app/invite/[token]/page.tsx` deliberately treats as a *success* case
(to handle legitimate double-click races). Net effect: a re-invited,
previously-removed member saw "You're in!" while remaining fully
locked out, since `removed_at` was never cleared. Fixed by checking
for an existing membership row first and reviving it
(`removed_at: null`, refreshed `role`/`joined_at`) instead of blindly
inserting; a genuinely still-active row still correctly returns the
409 "already a member" response. Verified via a real re-invite/re-accept
cycle on staging (actual `/dashboard` access confirmed after fix, not
just the UI's success message).

Full behavioral test pass on `leeward-staging-internal` (real browser,
real accounts, real Stripe test-mode payment, direct Supabase/Stripe
verification afterward — not just UI success messages): Members panel
invite/remove/revoke all confirmed with real org members; the
re-invite-after-removal bug found, fixed, redeployed, and re-verified;
the full Dissolve flow run end-to-end as a real owner — confirmed
directly via SQL that the Stripe subscription shows `canceled`
(webhook-confirmed, not just the DELETE call succeeding), the org's
project was reassigned (`organization_id: null`, `user_id` = owner),
the removed member's row now has `removed_at` set, and the owner's own
membership row plus the `organizations` row are untouched; then
confirmed the owner is correctly bounced to `/subscribe`, completes a
real Individual checkout, lands back on `/dashboard` with the header
now showing "Upgrade" (not "Team"), and still has the same project
under their individual account.

Fixed 2026-07-23 (see dated entry below): staging's `STRIPE_PRICE_ID`
(individual plan) had been pointing at the exact same Stripe price
object as `STRIPE_TEAM_PRICE_ID` ("Leeward Team (Test)" $10/month) —
confirmed literally identical, not just visually similar. Created a
genuinely distinct "Leeward Individual (Test)" price and repointed
`STRIPE_PRICE_ID` at it on `leeward-staging-internal`.

DEPLOYED TO PRODUCTION — confirmed 2026-07-23 via a full live
production test, see dated entry immediately below.

### Live Production Validation + Stale Test Price Fix (2026-07-23)

Two closeout items completed this session:

**1. Staging Stripe price fix.** Root-caused the "worth cleaning up"
item flagged immediately above: `leeward-staging-internal`'s
`STRIPE_PRICE_ID` and `STRIPE_TEAM_PRICE_ID` env vars pointed at the
literal same Stripe test-mode price object
(`price_1TuKRq2WIlxElWw0768YFf2K`, "Leeward Team (Test)" $10/month) —
so the individual-plan checkout was showing Team branding/pricing to
testers. This was staging-only; production's live-mode individual and
team prices were already confirmed distinct, so no customer-facing
confusion was ever possible. Created a real, separate "Leeward
Individual (Test)" product/price (`price_1TwR0H2WIlxElWw0LPMFySsh`,
$29/month), updated `STRIPE_PRICE_ID` on `leeward-staging-internal`,
and redeployed. Per Ryan's explicit call, the Team test price's
dollar amount ($10 vs. the real $69) was deliberately left as-is —
test-mode-only, never customer-visible, not worth touching.

**2. Full live production Team Accounts test.** With all of Phase 8
and the Members/Invite/Upgrade/Dissolve UI now deployed to
`app.getleeward.com`, ran the entire Team Accounts V1 lifecycle for
real, against real production, with a real live-mode Stripe charge —
not staging, not API-simulated:

- Brand-new real account signed up through the redesigned signup flow,
  chose the Team plan, named the org, and completed a genuine live
  Stripe Checkout with a real card (real $69/month "Leeward Team"
  subscription, real trial). Confirmed directly in production
  Supabase: `organizations`, `organization_members` (owner row), and
  `organization_subscriptions` all created correctly, with the
  subscription's Stripe metadata carrying `organization_id` (confirms
  the deferred-org-creation-on-webhook design worked for a genuine
  first-time signup, not just the earlier staging dry run).
- Invited a second brand-new real account via the dashboard's Members
  panel (real invite email, real magic link). Verified the
  wrong-account-mismatch detection on `/invite/[token]` and the
  "Log Out and Continue" recovery path, then completed acceptance —
  new member correctly appeared in the roster and could see the org's
  shared project via the real dashboard UI (not just via RLS/API
  checks).
- Ran the Dissolve ("Cancel Team & Return to Solo") flow as the owner,
  end-to-end, in production, with triple independent verification:
  app UI correctly bounced the owner to `/subscribe` post-dissolve;
  direct Supabase query confirmed the org's project was reassigned
  (`organization_id: null`, `user_id` = owner), the invited member's
  row shows `removed_at` set, and the owner's own
  `organization_members` row plus the `organizations` row were left
  untouched; Stripe's own live dashboard confirmed the real
  subscription shows "Canceled", $0.00 paid (real trial, canceled
  before any charge). Owner account cleaned up afterward by
  completing a real Individual-plan checkout, confirming the same
  project remained accessible under solo ownership.

This is the "final piece" the Phase 8 planning doc called out as
blocking genuine production-readiness (see Current Implement/Team
Accounts V1 Phase 8 - Production Rollout Planning.md) — Team Accounts
V1 is now considered fully COMPLETE and production-verified, not just
staging-verified.

**Also confirmed this session**: the previously-flagged
`app/auth/finish/page.tsx` broken-redirect bug (line ~53 pointing at
the nonexistent `/auth/signing-in` instead of `/auth/finish/signing-in`)
is already fixed and live — current production code on the
`team-accounts-phase-1` branch correctly calls
`router.replace("/auth/finish/signing-in")`, and the fix (commit
`d149c47`) is confirmed part of that branch's own history via GitHub,
not sitting in an unmerged PR. No action needed; this closes out the
gap noted under Phase 8 below.

No new Android/iOS release is required for any of this work: the
Android wrapper (package `com.linquelabs.leeward`) is a thin Capacitor
WebView shell that loads `https://app.getleeward.com` directly at
runtime with no bundled web UI of its own (see Mobile app store/Android
Wrapper Progress.md and 01-Current-State/Current State.md in the Brain
vault). Team Accounts V1 touched zero native Capacitor code, so the
already-completed production deploy is immediately live for existing
Android users with no rebuild, re-signing, or Play Store submission.

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
1. Organization Data Model Design — COMPLETE
2. Membership Model — COMPLETE
3. Invitation System — COMPLETE
4. Authentication Integration — COMPLETE
5. Project Ownership Migration — COMPLETE
6. Billing Integration — COMPLETE
7. Offline Validation — COMPLETE
8. Production Rollout — COMPLETE (2026-07-23, incl. Signup Flow
   Redesign and Members/Invite/Upgrade/Dissolve UI, all fully
   deployed to production and behaviorally verified there with a
   real live-mode signup, payment, invite, and dissolve — see the
   dated entries above for detail)

Team Accounts V1 is DONE. All 8 phases complete and production-
verified as of 2026-07-23. There is no remaining "immediate next step"
for this build — future Team Accounts work (if any) would be a new,
separately-scoped project (e.g. the deferred UI Navigation Overhaul,
or admin/role features explicitly listed as V1 non-goals above), not
a continuation of this phase list.

## Active Initiative: Estimate/Change Order/Invoice + UI Navigation Overhaul

As of 2026-07-23, this is the sanctioned next exception to
"architecture is locked" during launch operations, following the same
pattern Team Accounts V1 did. Conceptual design, competitive research,
and a full codebase audit are complete.

Phase 1 (Navigation Restructure — global Projects/Account tabs,
project-level Timeline/Estimate tabs, merged project header, relocated
Send Update/Project Notes/Request Approval/Help/Manage Billing, new
Notes/Photos/Files content filter and Draft/Finalized/Archived status
filter on Timeline) is COMPLETE and deployed to
`leeward-staging-internal`.

Phase 2 (Data Model — `line_items` jsonb + `is_baseline` boolean added
to `approval_requests`, migration
`20260726120000_estimate_phase2_line_items_and_baseline_flag.sql`) is
COMPLETE. Phase 3 (approvals/create + approvals/update extended to
validate/normalize line items and enforce at-most-one-active-baseline
at the app layer, server-side-recomputed `line_total`) is COMPLETE.
Phase 4 (offline approval outbox/flush extended to carry
`lineItems`/`isBaseline` through the existing queue — no IndexedDB
version bump needed) is COMPLETE. Phase 5 (Estimate tab UI: approval
feed relocated from Timeline, pinned "Current Total" snapshot card,
line-items + baseline-checkbox UI in `ApprovalComposer`, floating
bottom-right "+ New Estimate"/"+ New Change Order" action button) is
COMPLETE — slices 1-3 of 3 implemented and behaviorally exercised
locally, including finding and fixing a real bug (see below).

**Migration exception, 2026-07-26**: the Phase 2 migration was applied
to production (`uzuzwhzilhakewtbtzxh`), ahead of this initiative's own
"staging only until complete" rollout constraint stated below. Reason:
local dev's `.env.local` intentionally points at production Supabase
(see "Local Dev Environment" above), so local testing of Phase 5's
line-items/baseline UI hit a real `42703 column "is_baseline" does not
exist` error against production. The migration is additive-only
(default values, no existing row affected) and no production app code
reads/writes these columns yet (this feature isn't deployed to
production), so applying it doesn't expose the feature — it only
unblocks local testing. Applied via Supabase Studio SQL Editor and
verified via `information_schema.columns` the same way every prior
migration in this repo has been. Also fixed the same session: a real
bug in the baseline-uniqueness check in both approvals routes — a
`.not(col, "in", "(a,b)")` PostgREST filter was the original (wrong)
cause of a 500 before the missing-column issue was found; replaced
with a plain fetch + JS-side status filtering in both
`app/api/approvals/create/route.ts` and
`app/api/approvals/update/route.ts`.

Phase 6 (Client-Facing Visibility) is COMPLETE: the share page
(`app/share/[token]/page.tsx`) now fetches `is_baseline`/`line_items`,
shows a "Current Total" stat mirroring the dashboard's own
`estimateSummary` math, renders a "Baseline Estimate" badge and
itemized line items per approval, and the dashboard's Estimate tab got
a "Share Invoice" button that reuses the existing `/api/share/create`
route (no new endpoint) to copy a live share link. No share-page
redesign — additive content only, per that phase's own constraint.

Also added after initial testing: `ApprovalCard.tsx` (the card in the
dashboard's own Estimate tab feed) now shows the same baseline badge
and itemized line items in its "View" expansion, not just the share
page — previously it only showed the raw `cost_delta` number. And the
share page gained a genuinely filtered `?invoice=1` mode (same token,
same access control, no new route) that excludes regular timeline
entries entirely and shows only price-bearing approvals, with a
high-contrast "This is an Invoice" banner so it can't be confused with
a full project update, plus the baseline pinned in its own visually
emphasized "Original Estimate" section above a chronological "Change
Orders" list. `handleShareInvoice` appends `?invoice=1`; the regular
journal view is unaffected.

Full plan, decisions, phase breakdown, and progress notes: Current
Implement/Estimate, Change Order and Invoice System + UI Navigation
Overhaul - Implementation Plan.md in the Brain vault.

### Dark Mode / Theme System — Slices 3-4 progress (2026-07-26)

Following on from Slice 1 (token infrastructure) and Slice 2 (toggle +
persistence, both complete), a long live-testing pass with Ryan fixed
a large number of dark-mode contrast bugs across the dashboard and
approval components: `ApprovalCard.tsx` and `ApprovalComposer.tsx` are
now fully tokenized (zero hardcoded hex/rgba literals remaining,
verified via grep); `AttachmentList.tsx` and
`ProofAttachmentsWrapper.tsx` (file/attachment cards, delete buttons,
image preview thumbnails) likewise; the Timeline entry card, the
Draft/Finalized/Archived status badge (was hardcoded `#92400e`, now
follows the yellow token), and the Projects list' invisible project
title (`#0f172a` on a dark card) were all fixed in
`app/dashboard/page.tsx`. Several layout changes were bundled into the
same pass: the Timeline "Add Entry" textarea/button became a floating
"+" FAB matching the Estimate tab's FAB (this also fixed a
self-introduced JSX-fragment build error — an extra closing
`</>`/`) : null}` pair had been inserted assuming a fragment closed
earlier than it actually did); the Projects/Account pill tab bar was
removed (Account folded into the header dropdown, Logout moved into
that dropdown); the project mini-header title was enlarged with a new
"PROJECT" eyebrow label, and "CLIENT"/"PROJECT TIMELINE" labels were
recolored to match; the Client info section was extracted out of the
Timeline card into its own standalone top-level card; the divider
above "PROJECT TIMELINE" was removed; Timeline's several separate
filter controls (content-type chips, status dropdown, sort toggle,
archived toggle) were consolidated into a single icon-only filter
button + popover with an active-filter indicator dot; and the Project
Notes modal's textarea (previously unstyled, defaulting to browser
white/black regardless of theme) was fixed to use the shared
`.textarea` class. Full detail: Current Implement/Dark Mode Theme
System - Implementation Plan.md and Current Implement/Estimate, Change
Order and Invoice System + UI Navigation Overhaul - Implementation
Plan.md (Phase 7 section) in the Brain vault. Slice 5 (share/invoice
page) and Slice 7 (full light/dark QA pass) remain; Phase 7's Send
Update modal also remains. This round of changes was committed and
pushed to `estimate-nav-phase-1` in a later session (see the offline
stress-test and onboarding entries below).

### Onboarding wizard: dark mode + highlight-tab-gating fix + Estimate step (2026-07-27)

Found while auditing for the Dark Mode QA pass: `app/components/
OnboardingWizard.tsx` (the "GETTING STARTED" card) had been missed
entirely by the Slice 3-5 migration — every color was still a
hardcoded light-mode hex/rgba literal. Converted to the token system
(`--accent-rgb`, `--accentText`, `--text`, `rgba(var(--text-rgb),0.72)`,
`--shadowSoft`); verified correct in both light and dark mode on
`leeward-staging-internal`.

Also found and fixed a real bug introduced by the Timeline/Estimate tab
split (Phase 1 of the nav overhaul, done before this wizard's highlight
logic was revisited): three of the wizard's steps —
`onboarding-entry-area`, `onboarding-attachments-area`, and
`onboarding-send-trigger` — only render while
`activeProjectTab === "timeline"`, but their click handlers
(`handleAddFirstEntryClick`, `handleAddFilesClick`,
`handleSendFirstUpdateClick` in `app/dashboard/page.tsx`) never forced
that tab before calling `pulseHighlight`. If a user was viewing the
Estimate tab when they clicked one of those onboarding steps, the
highlight/scroll silently did nothing (target element didn't exist in
the DOM yet). Fixed by adding `setActiveProjectTab("timeline")` to all
three handlers before highlighting.

Added a new onboarding step, previously nonexistent: once a project has
client info but no baseline estimate yet, the wizard now prompts
"Create your baseline estimate" and highlights the Estimate tab's "+"
FAB (`onboarding-estimate-fab`, wired via a new
`handleCreateEstimateClick` that switches to the Estimate tab first).

Full click-through verified on `leeward-staging-internal` with a fresh
test project: Create Project → Open First Project → Add Client Info →
**Create Estimate** (new step; saved a real $5,000 baseline draft,
confirmed the step correctly cleared once `estimateSummary.baseline`
existed) → Add First Entry → Add Photos or Files → Send First Update —
every tab-gated highlight correctly forced the right tab before
pulsing. Committed and pushed to `estimate-nav-phase-1` as `28eb5a43`.

**Follow-up flagged by Ryan, explicitly deferred until current UI work
is complete**: once dark mode, Team Accounts, and the Estimate/Invoice
UI are all finished, the in-app Help section needs a content
review/update pass to cover Team Accounts and Estimate/Invoice
features it doesn't currently mention. Separately, and later still,
the marketing website will need a similar review/update pass. Neither
should be started now — both are "later, once this work is complete."

### Related new initiative: Dark Mode / Theme System (planning, 2026-07-26)

Surfaced while starting Phase 7: the New Project form and Send Update
mockups are dark-mode, and Ryan confirmed this is a real ask for a
genuine light/dark theme system across the *whole* app, not a
cosmetic pass on 3 new screens. Tracked as its own initiative — bigger
than "Phase 7 supporting screens" since it touches every existing
screen already built (dashboard, Estimate tab, ApprovalComposer,
ApprovalCard, the public share/invoice page). `app/globals.css`
already uses CSS custom properties for shared classes (`.card`,
`.btn`, `.input`, etc.) — the real cost is that most of the detailed
styling added during the Estimate/Invoice work uses raw hardcoded
inline `style={{ color: "#...", background: "rgba(...)" }}` rather
than those variables, which won't respond to a theme switch until
migrated. Proposed as a token-system-plus-incremental-migration
project (7 slices), not a single refactor. NOT YET STARTED — awaiting
Ryan's go-ahead on slice order. Full plan: Current Implement/Dark Mode
Theme System - Implementation Plan.md in the Brain vault.

Summary: adds a structured Estimate (baseline bid) and Change Order
system on top of the existing approval lifecycle (both are approvals
under the hood — line items and a baseline flag are the real additions,
not a new status system), plus a live, shareable Invoice view (running
total, reuses the existing share-link mechanism, no payment collection
in this phase — deliberately deferred, design should not block it
later). Combined with a UI navigation overhaul: global Projects/Account
tabs, project-level Timeline/Estimate tabs, replacing the current
per-project "..." dropdown that mixes settings, project-specific views,
and account-level concerns. Team Accounts (Members/Invite/Upgrade/
Billing) folds into the Account tab. Explicit rollout constraint: build
and test entirely on staging (leeward-staging-internal) until both the
nav overhaul and the estimate system are complete and behaviorally
verified together, before any production exposure.

Next actual step is a full codebase audit (dashboard component
structure, approval schema) — not yet done beyond a partial, targeted
audit already captured in the design doc above.

### Related new initiative: Project Payments / Deposit Tracking (2026-07-27)

Sanctioned follow-on, surfaced while QA-testing the Estimate/Invoice work:
"what if the client already paid a deposit — the invoice should reflect
that." Payment *tracking*, not payment *collection* — no Stripe charge,
no card, no money actually moves. A contractor manually logs "client paid
$X on this date," same as logging a timeline entry.

Built and behaviorally tested locally on `estimate-nav-phase-1` as of
2026-07-27, committed and pushed. New `project_payments` table
(migration `20260727120000_project_payments.sql`, applied to
PRODUCTION per Ryan's explicit choice to test locally rather than wait
for a staging deploy — same early-migration exception the estimate
Phase 2 migration used; NOT YET applied to leeward-staging-internal).
Three API routes (`/api/payments/create`, `/list`, `/delete`, all
`canUserAccessProject()`-gated, no client-side RLS policies — access is
server-route-only by design). Offline outbox/flush pair
(`lib/offlinePaymentOutbox.ts` / `lib/offlinePaymentFlush.ts`) wired into
the existing single reconnect orchestrator, no new trigger.

Product shape: the gross contract Total (baseline + approved change
orders) never moves based on payments. Paid and Balance Due are
additional stats next to it. A "Payments" section on the Estimate tab
lists logged payments (date, amount, optional note) with a "+ Log
Payment" button opening a modal with an explicit "$ Amount" / "% of
Balance Due" toggle (not a magic trailing-"%" convention) plus a live
calculator preview. Percentage is computed against the *current Balance
Due*, not the original Total — deliberately reversed from an earlier
design pass after Ryan pointed out that computing against a fixed Total
stops making sense once any payment has already been logged, and this
feature has no fixed-deposit-schedule concept at all (after-the-fact
recording only, no milestones, by design). Corrections are delete +
relog, no edit-in-place.

Client-facing exposure is deliberately split, not uniform: the invoice
share link (`?invoice=1`) shows Paid/Balance Due as summary figures
only, no itemized list — informal payment notes ("Venmo," "check
#1042") aren't written for client eyes. The Export Dispute Package PDF
(`reportMode === "dispute"` only) shows the same summary figures *plus*
a full itemized payment log (date, note, amount) — added after Ryan's
first real review called the summary-only version "pretty generic" for
a document whose whole purpose is dispute-grade evidence. Neither the
regular Download PDF nor the Send Update email/PDF ever show any of
this — both routes are confirmed to never set `reportMode: "dispute"`.

Full design doc + test log: Current Implement/Project Payments -
Implementation Plan.md in the Brain vault.

Not yet done: staging deploy, and a real offline→online reconnect
click-through of the payment outbox/flush path (code is written and
wired in, not yet behaviorally exercised offline).

### "Project" → "Record" rename, cross-audience terminology (2026-07-27)

Sanctioned copy-only rename, following the same pattern as the Change
Order/Bidding/Won pass done earlier the same session (see Cross-Audience
Terminology Pass doc in the Brain vault). Ryan flagged that "Project" and
"Baseline Estimate" don't read naturally for landlords/property managers
using the app, and after discussion (Property → Location → Record) landed
on "Record" as the universal noun — matches what the dispute-PDF already
called itself in several places, doesn't imply a fixed physical address,
and resolves the New Record modal's name/address field redundancy for
free. Full rationale and decision log: Current Implement/Project to Record
Rename - Full Inventory and Plan.md in the Brain vault.

Copy-only per this repo's established discipline: no DB columns, stored
enum values, function/prop names, or internal state values changed —
`projects` table, `projectId`, `selectedProject`, `getRecipientSource()`'s
`"project"|"custom"` return values, the `"projects"|"account"` tab-state
strings, etc. all untouched. Only rendered strings changed, across 13
files: `app/dashboard/page.tsx` (eyebrow label, actions menu, rename
mode, Timeline/Estimate headings, list heading, search/filter placeholders
and tooltips, status toasts, confirm dialogs, onboarding/send-success
messages, Estimate subtitle, PDF filename fallback, Notes modal),
`OnboardingWizard.tsx`, `NewProjectModal.tsx`, `SendUpdatePack.tsx`,
`ApprovalComposer.tsx`, `app/share/[token]/page.tsx` (including the
`?invoice=1` mode), `app/archived/page.tsx`,
`app/archived/entries/page.tsx`, `BulkCaptionUploader.tsx`,
`app/api/send/email/route.ts` (client-facing email subject/body/filename),
`lib/pdf/buildProjectPdf.ts` (hand-edited per a "drop the now-redundant
Project adjective rather than insert Record" rule — the PDF already used
"Record" as a noun in several places, e.g. "Official Project Record" →
"Official Record", not "Official Project Record" → "Official Record
Record"), `ApprovalCard.tsx`, and the two approval-conflict API error
messages in `app/api/approvals/create/route.ts` /
`app/api/approvals/update/route.ts`. Folded in the same session: "Baseline
Estimate" → "Original Estimate" (4 spots already decided in the
terminology-pass doc, plus several more found during this pass's grep
sweep — an onboarding step title, a dashboard Estimate-tab caption, the
invoice share-page subtitle, and the two API error messages above).

Explicitly out of scope, deferred: `app/help/page.tsx` (~35 instances,
folds into the already-planned Help content review) and the marketing
website.

`npm run build` passed. Behaviorally verified live on
`leeward-staging-internal` (not just grepped): dashboard record list
("Records" heading, "+ New Record", search placeholder), onboarding
wizard ("Open your first record" / "Open First Record"), a record's mini-
header (RECORD eyebrow, Actions menu → Notes/Rename/Download PDF/Export
dispute package/Archive, rename mode's "Record name" label), the Estimate
tab (subtitle, "Original Estimate" badge, "Additional Charge" type label),
the invoice share page (`?invoice=1` — banner, subtitle, "Original
Estimate" badge), the regular share/journal page ("VERIFIED JOURNAL",
updated subtitle), and the Archived Records page (heading, empty state,
count string) — all confirmed showing the new copy on a live deploy, not
just present in source.

**Client-facing PDF/email verification (same evening).** Beyond the dashboard
UI checks above, pulled a real dispute-package PDF straight off staging (via
`window.URL.createObjectURL` interception + `pdf.js` text extraction, not
just source grep) and confirmed every hand-edited PDF string renders
correctly across all 4 pages: "Official Record," "Record Summary,"
"Chronological record of activity... remain unchanged in the record,"
"Leeward Journal," "Timeline," "Original Estimate" badge, "Type: Additional
Charge," "Client Communication Record," "Delivery History," "View Record."
Also triggered a real "Send Update" on staging (draft entries flipped to
Finalized, confirming a genuine send, not a cooldown-guard reuse) and Ryan
confirmed the received email's subject reads "Update: {title}" (not
"Project Update: {title}").

**Follow-on fixes found during this live verification pass, same session:**
1. `app/share/[token]/page.tsx`'s summary caption hardcoded "Shared by
   contractor •..." on both the regular journal and `?invoice=1` views —
   missed by the original rename pass because the word itself wasn't
   "Project," but it's the same underlying problem: it assumes a contractor
   persona, undercutting the whole point of broadening to landlords/property
   managers. Fixed by dropping "Shared by contractor" entirely rather than
   substituting a new universal noun (Ryan's explicit call, to avoid
   inventing another persona-specific word).
2. Ryan flagged that the "Pending/Approved/Declined" status-dot legend next
   to the "Records" heading was ambiguous for a new user — unclear whether
   it referred to the record itself, any submitted change, or something
   else. Checked the actual query behind it
   (`app/api/projects/bid-statuses/route.ts`) and confirmed it's scoped to
   `is_baseline = true` specifically — the record's original estimate only,
   never an Additional Charge. Landed on an explicit "ORIGINAL ESTIMATE"
   eyebrow label (no "Status" suffix — Ryan's call, since "status" is
   already implied by the Pending/Approved/Declined values that follow it,
   and he wanted "original" kept explicit so contractors don't assume the
   dot reflects any submitted change/additional charge too).
3. Restyled the "Records" list heading itself (20px/800/`var(--text)`,
   matching the app's existing `.h1` scale) since it was visually
   indistinguishable from the small muted legend text next to it. Then,
   after Ryan flagged cramped mobile spacing (the heading + legend group was
   fighting for space via the shared `.row` class's `justify-content:
   space-between`, wrapping unpredictably across 3 lines), restructured to
   an explicit `flexDirection: column` stack — "Records" always on its own
   line, the "Original Estimate" legend group always directly below it as
   one predictable wrapped block — instead of relying on `.row`'s
   space-between behavior to wrap correctly.

Committed and pushed to `estimate-nav-phase-1` (`f2c6bade`, 16 files
changed). NOT YET deployed to production — still mid-flight alongside the
rest of the Estimate/Invoice/Dark-Mode work on this branch, per that
initiative's own staging-first rollout constraint.
