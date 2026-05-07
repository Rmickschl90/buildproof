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