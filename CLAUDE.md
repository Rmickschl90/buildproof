# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

BuildProof is a contractor-to-client communication timeline and dispute-ready documentation tool: contractors log project updates/entries, request client approvals, and send finalized "update packs" (with PDF exhibits) that clients view via share links. It is mobile-first and must work fully offline in the field, syncing when connectivity returns.

The product is currently in **controlled private V1 field testing**, not active feature development. See `BUILDPROOF_MASTER_HANDOFF.md` for current rollout status/blockers and `REGRESSION_LEDGER.md` (append-only) for the history of verified fixes — check both before touching offline/send/reconnect/PDF code, since they document prior failed experiments and why certain approaches were rejected.

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
- Deployment flow is staging-first: `buildproof-staging.vercel.app` for iteration/validation, `buildproof-kappa.vercel.app` is the protected live tester production app. The local Vercel link (`.vercel/project.json`) normally points at staging — confirm the deploy target before running `vercel --prod`, and if output ever references `buildproof-kappa` unexpectedly, stop and verify linking before proceeding.

## Notes & Rules Reference

Project notes and historical context live in the Obsidian vault at:
C:\dev\BuildProof Brain

Key files to check before proposing any non-trivial change:
- C:\dev\BuildProof Brain\10-Handoffs\Current Project Handoff.md
  (master status doc — current state, protected systems, what to avoid)
- C:\dev\BuildProof Brain\08-Lessons-Learned\
  (past bugs, failed experiments — check before repeating past mistakes)
- C:\dev\BuildProof Brain\09-Regression-Ledger\
  (known regressions and their fixes)

## Production Safety Rules

- Production deploys are manual (`vercel --prod`), not git-triggered — no
  Vercel project here auto-deploys on push. But the deployed app is what
  the Android app (Capacitor wrapper) loads directly via the live
  production URL, so a manual production deploy can affect real
  customers within minutes.
- Leeward is in "launch operations" phase — architecture is locked/stable.
  Do not propose architecture changes, refactors, or rewrites unless
  explicitly asked.
- Before making ANY code change (not docs), create a new branch first.
  Never commit or push code changes directly to main.
- Test changes against staging (buildproof-staging.vercel.app) before
  merging to main.
- Protected systems — do not modify without explicit confirmation:
  reconnect orchestration, offline sync, send/approval architecture,
  attachment/send ownership, PDF/export & dispute packet architecture,
  service worker/IndexedDB, Supabase auth, billing webhook & subscription
  enforcement, production deployment/Vercel alias routing.
