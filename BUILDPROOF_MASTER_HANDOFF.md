🧱 BUILDPROOF — MASTER HANDOFF
🎯 PRODUCT

BuildProof is:

a contractor communication timeline
a client-friendly project update tool
a dispute-safe documentation system

Core principles:

simple
mobile-first
offline-capable
trustworthy
clean client experience
🧠 CURRENT PRODUCT STAGE

BuildProof is in:

→ V1 TESTING / SOFT-ROLLOUT PREPARATION

This is NOT a rebuild phase.

Current mode:

verify
patch surgically
stabilize
prepare for controlled real-world use

DO NOT:

redesign stable systems
rewrite architecture
introduce broad reconnect/send experiments
revisit reverted failed camera/replay experiments
🟢 CURRENT VERIFIED SYSTEM STATE

The following systems are VERIFIED WORKING and should be treated as protected:

Offline Core
offline project creation
offline client save/edit
offline entry creation
offline approval creation
reconnect sync
hard refresh persistence
Entry Attachment System
entry attachments online
library-selected offline entry attachments
multiple camera-originated mobile offline entry attachments
reconnect replay
attachment rendering
send update finalization
Approval Attachment System
approval attachments online
library-selected offline approval attachments
multiple camera-originated mobile offline approval attachments
reconnect replay
approval send continuation
approval attachment rendering
Send Systems
offline update send
offline approval send
reconnect-trigger send continuation
send snapshot integrity
share vs snapshot separation
approval duplicate-email hardening
Timestamp / Trust Systems
share header timestamp semantics aligned with visible timeline events
offline approval timezone replay persistence fixed
client-facing timestamps now preserve jobsite-local event time
DST-safe architecture verified
approval replay now preserves timezone metadata correctly
Client-Facing Rules
no drafts on client-facing surfaces
snapshot links frozen after send
share links live/update dynamically
PDFs/dispute exports aligned with snapshot rules
🧱 FULL VERIFIED E2E STATE
Mobile Online

PASS

project creation
client save/edit
entry create/edit
approval create/edit
mixed attachment uploads
update send
approval send
snapshot rendering
email rendering
Mobile Offline

PASS

offline project workflow
offline entries
offline approvals
camera capture attachments
mixed attachment replay
offline update send queue
offline approval send queue
automatic reconnect replay
no duplicate sends
no missing attachments
correct finalized/pending states
correct email rendering
Stress test passed

PASS:

offline project
entry + 5 mixed attachments
approval + 5 mixed attachments
edit entry + additional attachments
edit approval + additional attachments
queue update send
queue approval send
reconnect replay

Result:

full successful automatic replay
no duplicates
no missing attachments
no stuck queues
Desktop Online

PASS

core project workflows
sends
approvals
attachments
snapshot rendering
Desktop Offline

PASS with one remaining issue:

offline project rename currently throws:
Failed to fetch

All other desktop offline replay systems passed.

🚨 CURRENT ACTIVE ISSUE
Offline Project Rename (Desktop Offline)

Current isolated remaining issue:

offline project rename
desktop offline
returns:
Failed to fetch

Status:

isolated
reproducible
not yet investigated
next chat should focus ONLY on this issue

Important:
No broader reconnect/send/offline systems are currently failing.

🧱 MOBILE CAMERA REPLAY BREAKTHROUGH

MAJOR BREAKTHROUGH ACHIEVED.

Mobile offline reconnect flows with MULTIPLE camera-originated iPhone attachments are now passing for BOTH:

timeline entry sends
approval sends

This issue consumed multiple investigation cycles and is now isolated far beyond the original failure state.

Root Cause Finding

The major instability was NOT:

Supabase
reconnect ordering
attachment queue orchestration
send queue architecture
proof remap architecture
approval lifecycle architecture

The major issue was persisting raw iPhone camera File/Blob objects directly into IndexedDB offline queues.

Safari/iOS camera-originated File objects proved unstable across:

reconnect replay
long idle periods
PWA execution suspension
IndexedDB persistence / rehydration
multiple-camera reconnect workloads

Library-selected images behaved differently because they originate from persistent iOS asset storage instead of temporary camera-generated file references.

Working Fix

Attachment systems now persist durable ArrayBuffer bytes immediately at queue time instead of persisting raw File objects.

Applied to:

offline entry attachments
offline approval attachments

Key commits:

d4e39f65 Store attachment bytes instead of raw file objects
52d0003c Store approval attachment bytes instead of raw file objects
🧠 TIMESTAMP INTEGRITY WORK
Share Header Timestamp Fix

Problem:

share header “Last updated” used mixed timestamp semantics
included responded_at
approval cards used sent_at
created client-facing mismatch

Fix:

share header now aligns with visible timeline event semantics
removed responded_at from latest-event calculation
header now uses:
proof created_at
approval sent_at || created_at

Commit:

8afe033e — Align share header timestamps with timeline events
Offline Approval Timezone Replay Fix

Problem:

offline approval replay dropped timezone metadata
some approvals displayed 5 hours off
Supabase rows stored:
created_timezone_id = null
created_timezone_offset_minutes = null

Root cause:

offlineApprovalFlush.ts failed to forward:
createdTimezoneId
createdTimezoneOffsetMinutes

Fix:

replay payload now forwards timezone metadata correctly

Verified:

new offline approvals persist:
created_timezone_id
created_timezone_offset_minutes

Commit:

abf7d19f — Include timezone fields in offline approval flush
Important Architectural Decision

BuildProof preserves:

jobsite-local event time

NOT:

viewer-localized timestamps

System is now verified DST-safe because each record stores:

UTC absolute timestamp
original timezone id
original timezone offset at creation time
🧱 MOBILE UI POLISH
Attachment Filename Overflow Fix

Fixed mobile offline non-image attachment overflow issue:

PDFs and long filenames no longer expand cards beyond viewport

Commit:

c1588cd1 — Fix mobile offline attachment filename overflow
Approval Attachment Local Preview Fix

Approval attachments now visually appear immediately while being added offline instead of only appearing after reopening edit mode.

Commit:

b6ed2003 — Add local approval attachment previews
🧱 OFFLINE SEND VISIBILITY IMPROVEMENTS

Offline send indicator now correctly includes:

update sends
approval sends

Banner improvements:

combined queue visibility
cleaner messaging
hidden from snapshot/share pages

Commits:

0fb4df9e — Add approval send visibility to offline send indicator
71a4aef9 — Add approval send visibility to offline indicator
🧱 DIAGNOSTICS CLEANUP

Temporary investigation panels removed:

ApprovalDiagnosticsPanel
AttachmentDiagnosticsPanel
SendDiagnosticsPanel

Reconnect orchestration logs intentionally preserved for rollout safety.

Commit:

24b99a36 — Remove temporary diagnostics panels
❌ FAILED EXPERIMENTS — DO NOT REPEAT

The following experiments were tested, failed, and were reverted or abandoned.

Do not reintroduce them casually.

Failed Camera / Blob Experiments
1. Safari-safe image normalization replacement

Commit:

b2eb9f12 Replace image normalization with Safari-safe canvas path

Reverted by:

99a2b6b5 Revert "Replace image normalization with Safari-safe canvas path"

Result:

failed
worsened replay behavior
did not resolve multi-camera reconnect replay

Decision:
Do not retry.

2. Replay-time File reconstruction

Commit:

db55d22c Rebuild attachment file before replay upload

Reverted by:

4a08cb0e Revert "Rebuild attachment file before replay upload"

Result:

failed
did not resolve replay instability

Decision:
Do not retry.

Other Failed / Reverted Experiments

Do not casually revisit:

timeout protection wrappers around uploads
server upload lane experiment
reconnect-trigger recovery experiments
attachment-complete reconnect triggers
broad reconnect balancing/recovery edits
stacked send retry experiments
stale proof retry experiments

Reason:

none resolved root replay instability
several increased instability risk
🔒 CURRENT VERIFIED FALLBACK BRANCHES
Primary verified recovery point
v1-e2e-verified-safe

Contains:

mobile + desktop E2E verification
timestamp integrity fixes
timezone replay fixes
diagnostics cleanup
current strongest known stable state
Earlier mobile replay stabilization point
v1-mobile-replay-stable
Current active working branch
safe-point-before-server-image-upload-lane
🔒 CLIENT-FACING DATA RULES

Dashboard:

drafts visible

Share Link:

live finalized view only

Send Snapshot:

frozen at send time

PDF / Dispute Export:

frozen snapshot state

Client-facing surfaces must NEVER show:

draft entries
draft approvals

Allowed client-facing approvals:

pending
approved
declined

Allowed client-facing entries:

finalized / locked entries only
🚫 PROTECTED SYSTEMS

Do not touch unless there is a reproducible failure:

reconnect orchestration
proof remap architecture
offline project sync/remap
send snapshot architecture
share/snapshot separation
PDF/export architecture
approval lifecycle statuses
attachment queue ownership
send queue ownership
service worker/app shell cache layer

Especially do NOT add new approval statuses casually.

Approval lifecycle must remain:
draft → pending → approved / declined / expired

🧠 DEVELOPMENT RULES
one subsystem at a time
restore point before core edits
revert failed experiments
no speculative architecture rewrites
no broad reconnect/send experiments
always validate with mobile E2E testing
preserve stable systems aggressively
use exact evidence before changing logic
do not assume behavior from memory
failed edits that do not move toward the stated goal should be reverted
🎯 NEXT ORDER OF BUSINESS
1. Offline project rename investigation

ONLY focus for next chat:

offline project rename
desktop offline
Failed to fetch

Goals:

offline rename persistence
reconnect replay
hard refresh persistence
verify no project duplication/regression

Do NOT broaden scope.

2. Help Page System

After rename stabilization:

create in-app help page
accessible from main menu
explain:
app operation
updates
approvals
snapshots
dispute packages
timestamps
finalized vs draft rules

Goal:
reduce onboarding friction before soft rollout.

3. Soft Rollout Preparation

After rename fix + help page:

final E2E pass
cleanup remaining low-risk debug logs
controlled real-user rollout prep
📁 CURRENT IMPORTANT FILES

app/

dashboard/page.tsx
share/[token]/page.tsx

app/api/

send/create-job/route.ts
send/process-job/route.ts
send/email/route.ts
approvals/create/route.ts
approvals/send/route.ts
approval-attachments/upload/route.ts
approval-attachments/insert/route.ts
attachments/upload/route.ts
attachments/insert/route.ts

components/

AttachmentUploader.tsx
AttachmentList.tsx
ProofAttachmentsWrapper.tsx
ApprovalComposer.tsx
ApprovalCard.tsx
SendUpdatePack.tsx
OfflineAttachmentBootstrap.tsx
OfflineSendBootstrap.tsx
OfflineAppShellBootstrap.tsx
OfflineReconnectBootstrap.tsx
OfflineSendIndicator.tsx

lib/

normalizeImageFile.ts
offlineAttachmentOutbox.ts
offlineAttachmentFlush.ts
offlineApprovalAttachmentOutbox.ts
offlineApprovalAttachmentFlush.ts
offlineApprovalSendOutbox.ts
offlineApprovalSendFlush.ts
offlineSendOutbox.ts
offlineSendFlush.ts
offlineProofOutbox.ts
offlineApprovalOutbox.ts
offlineApprovalFlush.ts
offlineDashboardCache.ts
reconnectFlow.ts
pdf/buildProjectPdf.ts

root/

BUILDPROOF_MASTER_HANDOFF.md
OFFLINE_PLAYBOOK.md
REGRESSION_LEDGER.md
📁 CURRENT FILE TREE

app/
├── layout.tsx
├── dashboard/
│ └── page.tsx
├── share/
│ └── [token]/
│ ├── page.tsx
│ └── export/
│ └── route.ts
├── auth/
│ └── finish/
│ └── page.tsx
├── api/
│ ├── approvals/
│ │ ├── list/
│ │ │ └── route.ts
│ │ ├── create/
│ │ ├── update/
│ │ └── send/
│ │ └── route.ts
│ ├── attachments/
│ │ ├── upload/
│ │ │ └── route.ts
│ │ └── insert/
│ │ └── route.ts
│ ├── approval-attachments/
│ │ ├── upload/
│ │ │ └── route.ts
│ │ └── insert/
│ │ └── route.ts
│ ├── send/
│ │ ├── create-job/
│ │ │ └── route.ts
│ │ ├── process-job/
│ │ │ └── route.ts
│ │ └── email/
│ │ └── route.ts
│ ├── export/
│ │ └── pdf/
│ │ └── route.ts
│ └── proofs/
│ ├── create/
│ ├── update/
│ └── finalize/

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
├── OfflineReconnectBootstrap.tsx
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