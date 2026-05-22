# 🧱 BUILDPROOF — MASTER HANDOFF (UPDATED)

# 🎯 PRODUCT

BuildProof is:
- a contractor communication timeline
- a client-friendly project update tool
- a dispute-safe documentation system

Core principles:
- simple
- mobile-first
- offline-capable
- trustworthy
- clean client experience

---

# 🧠 CURRENT PRODUCT STAGE

BuildProof is in:

→ V1 TESTING / SOFT-ROLLOUT PREPARATION

This is NOT a rebuild phase.

Current mode:
- verify
- patch surgically
- stabilize
- prepare for controlled real-world use

DO NOT:
- redesign stable systems
- rewrite architecture
- introduce broad reconnect/send experiments

---

# 🔒 CURRENT VERIFIED SYSTEM STATE

The following systems are VERIFIED WORKING and should be treated as protected:

## Offline Core
- offline project creation
- offline client save/edit
- offline entry creation
- offline approval creation
- reconnect sync
- hard refresh persistence

## Attachment Systems
- entry attachments online
- approval attachments online
- library-selected offline attachments
- approval attachment reconnect behavior

## Send Systems
- offline update send
- offline approval send
- reconnect-trigger send continuation
- send snapshot integrity
- share vs snapshot separation

## Client-Facing Rules
- no drafts on client-facing surfaces
- snapshot links frozen after send
- share links live/update dynamically
- PDFs/dispute exports aligned with snapshot rules

---

# 🚨 CURRENT ACTIVE BLOCKER

## Mobile Offline Replay of Multiple Camera-Originated Attachments

Current state:
- Single normalized camera-originated offline image can successfully reconnect, upload, finalize, and send.
- Multiple camera-originated offline images still fail during reconnect replay.
- Library-selected images continue to pass.
- Desktop/laptop behavior remains presumed stable unless proven otherwise.

Observed failure pattern:
- Proof rows sync successfully.
- Attachment rows are missing server-side during failed runs.
- Send gate correctly blocks finalization when attachments are incomplete.
- UI may show:
  - draft proof remains
  - waiting banner persists
  - queued uploads incorrectly showing 0

Important:
This currently points to:
- mobile camera blob replay/state consistency

NOT to:
- proof remap failure
- generic reconnect failure
- send architecture failure
- approval architecture failure

---

# 🔍 MOST IMPORTANT FINDINGS FROM THIS CHAT

## Confirmed
- Camera-originated files are the variable.
- Library-only mobile stress tests can pass.
- Single normalized camera image can pass.
- Multi-camera replay remains unstable.
- Proof rows insert successfully even during failures.
- Missing attachment rows prevent send finalization correctly.

## Meaning
The send gate is behaving correctly.

The likely instability is:
- mobile Safari/PWA offline blob replay behavior
OR
- current normalization engine reliability during replay

---

# ❌ REVERTED EXPERIMENTS

The following experiments were reverted and should NOT be casually reintroduced:

- timeout protection wrappers around uploads
- server upload lane experiment
- reconnect-trigger recovery experiments
- attachment-complete reconnect triggers
- broad reconnect balancing/recovery edits
- stacked send retry experiments

Reason:
- none resolved the root mobile camera replay issue
- several increased instability risk
- stable restore point preserved instead

---

# 🧪 CURRENT RESTORE POINT

Current safe branch:

safe-point-before-server-image-upload-lane

This is the clean baseline before experimental replay/upload changes.

---

# 🎯 NEXT DEVELOPMENT DIRECTION (LOCKED)

## Replace the image normalization engine ONLY

Current normalization path:
- uses `createImageBitmap(file)`

Next direction:
- replace with Safari-safe normalization pipeline:

File
→ URL.createObjectURL(...)
→ `<img>`
→ canvas.drawImage(...)
→ canvas.toBlob("image/jpeg")
→ offline queue storage

Reason:
- broader web evidence suggests this path is more durable for:
  - iPhone camera images
  - Safari/PWA offline replay
  - IndexedDB blob persistence

---

# 🚫 DO NOT TOUCH

Unless new evidence proves failure:

- reconnect orchestration
- send architecture
- approval send lifecycle
- proof remap architecture
- offline queue ownership
- share/snapshot architecture
- PDF/export architecture

These systems are currently considered protected.

---

# 🔒 CLIENT-FACING DATA RULES

Dashboard:
- drafts visible

Share Link:
- live finalized view only

Send Snapshot:
- frozen at send time

PDF / Dispute Export:
- frozen snapshot state

Client-facing surfaces must NEVER show:
- draft entries
- draft approvals

---

# 📁 CURRENT IMPORTANT FILES

app/
- dashboard/page.tsx
- share/[token]/page.tsx

app/api/
- send/create-job/route.ts
- send/process-job/route.ts
- attachments/*
- approvals/*

components/
- AttachmentUploader.tsx
- ProofAttachmentsWrapper.tsx
- ApprovalComposer.tsx
- SendUpdatePack.tsx

lib/
- normalizeImageFile.ts
- offlineAttachmentFlush.ts
- offlineAttachmentOutbox.ts
- offlineApprovalAttachmentOutbox.ts
- offlineSendFlush.ts
- pdf/buildProjectPdf.ts

root/
- BUILDPROOF_MASTER_HANDOFF.md
- OFFLINE_PLAYBOOK.md
- REGRESSION_LEDGER.md

---

# 🧠 DEVELOPMENT RULES

- one subsystem at a time
- restore point before core edits
- revert failed experiments
- no speculative architecture rewrites
- always validate with E2E testing
- preserve stable systems aggressively

---

# 🟢 CURRENT STATUS

BuildProof is still considered:
→ production-ready for controlled V1 testing

The remaining blocker is now isolated specifically to:
→ mobile offline replay of multiple camera-originated attachments

---

# STAGING-FIRST TESTING RULE (LOCKED)

IMPORTANT:
BuildProof now uses a dedicated isolated staging environment for active development/testing.

Current staging URL:
https://buildproof-staging.vercel.app

Current protected production/tester URL:
https://buildproof-kappa.vercel.app

Operational rule:
Production is no longer the primary testing environment.

Current required workflow:

1. Make surgical code edit
2. Deploy to staging using:
   vercel --prod
3. Validate auth/session behavior
4. Validate offline behavior
5. Validate reconnect/send behavior
6. Run subsystem E2E
7. Only after PASS:
   intentionally deploy verified code to production

IMPORTANT:
Core offline/send/reconnect systems remain protected even on staging.

Staging exists to:
- reproduce bugs safely
- validate auth safely
- validate reconnect behavior safely
- validate offline flows safely
- prevent destabilizing real testers

---

# CURRENT VERCEL LINK RULE

IMPORTANT:
The local repo is currently linked to:

buildproof-staging

through:
.vercel/project.json

Meaning:
vercel --prod currently deploys to staging, NOT production.

Always verify deploy output before testing.

Expected safe staging deploy output:

buildproof-staging.vercel.app

If deploy output ever references:
buildproof-kappa

STOP immediately and verify local Vercel linking before continuing.

---

# CURRENT STAGING SAFETY PHILOSOPHY

Prefer:
- staging-first validation
- isolated infrastructure testing
- protected production rollout
- controlled/manual production releases

Avoid:
- production-first testing
- unstable direct production validation
- bypassing staging for reconnect/offline changes
- aggressive production auth modifications

---

# 📁 CURRENT FILE TREE (IMPORTANT)

app/
├── layout.tsx
├── dashboard/
│   └── page.tsx
├── share/
│   └── [token]/
│       ├── page.tsx
│       └── export/
│           └── route.ts
├── auth/
│   └── finish/
│       └── page.tsx
├── api/
│   ├── approvals/
│   │   ├── list/
│   │   │   └── route.ts
│   │   ├── create/
│   │   ├── update/
│   │   └── send/
│   ├── attachments/
│   │   ├── upload/
│   │   │   └── route.ts
│   │   └── insert/
│   │       └── route.ts
│   ├── approval-attachments/
│   │   ├── upload/
│   │   │   └── route.ts
│   │   └── insert/
│   │       └── route.ts
│   ├── send/
│   │   ├── create-job/
│   │   │   └── route.ts
│   │   ├── process-job/
│   │   │   └── route.ts
│   │   └── email/
│   │       └── route.ts
│   ├── export/
│   │   └── pdf/
│   │       └── route.ts
│   └── proofs/
│       ├── create/
│       ├── update/
│       └── finalize/

components/
├── ApprovalCard.tsx
├── ApprovalComposer.tsx
├── AttachmentUploader.tsx
├── AttachmentList.tsx
├── ProofAttachmentsWrapper.tsx
├── SendUpdatePack.tsx
├── OfflineAttachmentBootstrap.tsx
├── OfflineSendBootstrap.tsx
├── OfflineAppShellBootstrap.tsx
├── OfflineSendIndicator.tsx
└── ProjectNotesModal.tsx

lib/
├── normalizeImageFile.ts
├── buildProjectPdf.ts
├── supabase.ts
├── supabaseServer.ts
├── requireUser.ts
├── offlineDashboardCache.ts
├── offlineProofOutbox.ts
├── offlineAttachmentOutbox.ts
├── offlineAttachmentFlush.ts
├── offlineApprovalOutbox.ts
├── offlineApprovalFlush.ts
├── offlineApprovalAttachmentOutbox.ts
├── offlineApprovalAttachmentFlush.ts
├── offlineApprovalSendOutbox.ts
├── offlineApprovalSendFlush.ts
├── offlineSendOutbox.ts
├── offlineSendFlush.ts
└── reconnectFlow.ts

public/
├── sw.js
├── buildproof-logo.png
└── manifest.json

root/
├── BUILDPROOF_MASTER_HANDOFF.md
├── OFFLINE_PLAYBOOK.md
├── REGRESSION_LEDGER.md
├── tsconfig.json
├── next.config.js
└── package.json

## CAMERA-ORIGINATED MOBILE ATTACHMENT RULE (LOCKED)

NEVER persist raw camera-originated File objects directly into IndexedDB offline queues.

ALWAYS persist durable binary bytes immediately:
- ArrayBuffer
or
- equivalent durable binary payload

Reason:
iOS Safari/PWA camera-originated File/Blob objects are unstable across:
- reconnect replay
- long idle periods
- PWA suspension
- IndexedDB hydration
- offline resume

Library-selected images may appear stable while camera-originated images fail because they originate from different underlying iOS asset systems.

This rule now applies to:
- entry attachment queues
- approval attachment queues

This is now a core BuildProof offline architecture rule.

## APPROVAL SEND HARDENING RULE (LOCKED)

Approval sends MUST be protected against duplicate reconnect execution.

DO NOT rely on:
- client timing
- UI state
- reconnect ordering alone

Server routes must atomically claim approval send ownership before email delivery.

Current approved approach:
conditional status claim:
WHERE status = 'draft'

DO NOT introduce temporary approval lifecycle statuses unless absolutely necessary.
Too many systems depend on the existing lifecycle:
draft → pending → approved/declined/expired

# 🧱 VERIFIED E2E STATE — 2026-05-11

## Verified fallback branch

Primary verified recovery point:
- `v1-e2e-verified-safe`

This branch contains:
- mobile + desktop E2E verification
- timestamp integrity fixes
- offline approval timezone replay fix
- diagnostics cleanup
- current strongest known stable state

Earlier replay stabilization point:
- `v1-mobile-replay-stable`

---

# 🧱 TIMESTAMP INTEGRITY RULES (LOCKED)

BuildProof preserves:
- jobsite-local event time

BuildProof does NOT use:
- viewer-localized timestamps

Every timeline event should preserve:
- original UTC timestamp
- original timezone id
- original timezone offset at creation time

This architecture is DST-safe.

---

## Timeline Entries

Primary visible timestamp:
- `created_at`

`locked_at` is:
- finalization metadata only
- NOT the primary client-facing event timestamp

Client-facing entry surfaces:
- finalized entries only
- never drafts

---

## Approval Timeline Rules

Primary visible approval timestamp:
- `sent_at`
- fallback:
  - `created_at`

`responded_at` is:
- secondary metadata
- NOT the primary timeline timestamp

Approval lifecycle remains:
- draft
- pending
- approved / declined / expired

No temporary statuses unless absolutely required.

---

## Share Header Timestamp Rule

“Last updated” must reflect:
- latest visible timeline event

Allowed:
- proof `created_at`
- approval `sent_at || created_at`

NOT allowed:
- `responded_at`

Reason:
- header timestamp semantics must align with visible timeline card semantics
- prevents client-facing trust inconsistencies

Commit:
- `8afe033e`
- Align share header timestamps with timeline events

---

# 🧱 OFFLINE APPROVAL TIMEZONE REPLAY RULE (LOCKED)

Offline approval replay MUST preserve:
- `createdTimezoneId`
- `createdTimezoneOffsetMinutes`

Root cause discovered:
- replay flush path failed to forward timezone metadata
- caused approvals to render several hours off
- Supabase rows stored null timezone fields

Fix:
- `offlineApprovalFlush.ts`
- replay payload now forwards timezone metadata correctly

Commit:
- `abf7d19f`
- Include timezone fields in offline approval flush

Verification:
- new offline approvals now correctly persist:
  - `created_timezone_id`
  - `created_timezone_offset_minutes`

---

# 🧱 MOBILE OFFLINE CAMERA REPLAY RULE (LOCKED)

NEVER persist raw camera-originated File objects directly into IndexedDB queues.

ALWAYS persist durable binary payloads immediately:
- ArrayBuffer
or equivalent durable binary representation

Reason:
iOS Safari/PWA camera-originated File/Blob objects are unstable across:
- reconnect replay
- idle periods
- PWA suspension
- IndexedDB hydration
- offline resume

This rule applies to:
- entry attachment queues
- approval attachment queues

This is now a core BuildProof offline architecture rule.

---

# 🧱 APPROVAL SEND HARDENING RULE (LOCKED)

Approval sends MUST be protected against duplicate reconnect execution.

DO NOT rely on:
- client timing
- reconnect ordering
- UI state alone

Server routes must atomically claim ownership before email delivery.

Approved approach:
- conditional status claim:
  - `WHERE status = 'draft'`

Do NOT introduce temporary approval lifecycle statuses casually.

Current lifecycle must remain:
- draft
- pending
- approved / declined / expired

Commit:
- `4c7cf86d`
- Harden approval send against duplicate emails

---

# 🧱 RECONNECT ORCHESTRATION RULES (LOCKED)

One reconnect orchestrator only.

Avoid:
- competing reconnect owners
- duplicate flush loops
- overlapping online/focus/poll reconnect execution

Full-batch guards must wrap:
- the entire replay operation
- not individual queue items

Reconnect systems currently considered protected:
- reconnect orchestration
- proof remap architecture
- offline project sync/remap
- send snapshot architecture
- share/snapshot separation
- attachment queue ownership
- send queue ownership

---

# 🧱 CURRENT VERIFIED E2E RESULTS

## Mobile online
PASS

## Mobile offline
PASS

Including:
- camera-originated attachment replay
- mixed attachment stress tests
- update replay
- approval replay
- reconnect send continuation

## Desktop online
PASS

## Desktop offline
PASS except:
- offline project rename
- currently returns:
  - `Failed to fetch`

This is the next isolated issue to investigate.

---

# 🧱 DIAGNOSTICS CLEANUP

Removed:
- ApprovalDiagnosticsPanel
- AttachmentDiagnosticsPanel
- SendDiagnosticsPanel

Reconnect orchestration logs intentionally preserved for rollout safety.

Commit:
- `24b99a36`
- Remove temporary diagnostics panels