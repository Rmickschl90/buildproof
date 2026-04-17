# BuildProof — Master Handoff

## Product Core
BuildProof is a contractor job-site communication and proof timeline app with:
- daily timeline entries
- attachments
- client updates
- approvals
- dispute-safe records
- offline-first reliability

Core priority order:
1. clean contractor workflow
2. professional client communication
3. dispute-safe documentation
4. field reliability in poor connectivity

---

## Tech Stack Snapshot
- Next.js App Router
- React
- TypeScript
- Supabase (Postgres, Auth, Storage)
- Resend
- pdf-lib
- IndexedDB outboxes
- Service Worker for app shell/cache
- Vercel deployment

---

## Core Data / Systems
### Main record types
- Projects
- Proofs (entries)
- Proof attachments
- Approvals
- Approval attachments
- Send jobs
- Shares

### Offline outboxes
- offlineProofOutbox
- offlineAttachmentOutbox
- offlineApprovalOutbox
- offlineApprovalAttachmentOutbox
- offlineApprovalSendOutbox
- offlineSendOutbox
- offlineProjectOutbox

### Global bootstraps / infrastructure
- OfflineAppShellBootstrap
- OfflineSendBootstrap
- OfflineAttachmentBootstrap

---

## Current Known Product State
### Stable / trusted
- existing project offline entry flow
- entry attachments
- update send flow baseline
- no duplicate project creation in older safe baseline
- reconnect investigation separated from current safe point

### Known weak / open areas
- offline approval send path is suspect
- later/current broken branch introduced broader regressions during end-to-end testing:
  - duplicate project creation
  - stuck “updates waiting to send” banner
  - missing attachment rendering
  - drafts not advancing on reconnect

---

## Regression Boundary Findings
### At safe-point-before-offline-project
Test performed:
- online create/open existing server project
- go offline
- add entry with attachment
- add approval with attachment
- send update offline
- send approval offline
- reconnect

Observed:
- entry path worked
- entry attachment path worked
- update send finalized correctly
- no duplicate project created
- approval could be created offline
- approval attachment could be created offline
- approval send did NOT complete on reconnect
- approval remained draft

Meaning:
1. entry/offline send had an older stable baseline
2. approval offline send was already a failing path there
3. later broken state introduced additional regressions beyond approval send alone

---

## Current Safe Anchor
Sacred fallback branch:
- fallback-safe-current

Rules:
- do not develop on it
- do not merge into it
- use only as restore/comparison anchor

---

## Additional Restore Points Mentioned
- safe-point-before-offline-project
- safe-point-before-reconnect-isolation
- safe-point-after-reconnect-lock
- temp-current-before-rollback
- temp-broken-after-mobile-test (if created)

---

## Current Direction
Do not assume one subsystem explains all regressions.
Use:
- safe anchor
- broken investigation branch
- file diff / subsystem mapping
- one subsystem at a time

---

## Immediate Next Investigation Goal
Investigate the broken branch safely against fallback-safe-current and older restore points to determine:
- which changed files likely caused duplicate project creation
- which changed files likely caused stuck send/update banner
- which changed files likely caused missing attachment rendering
- whether approval offline send remains an isolated legacy issue or was worsened by later changes

---

## Files Most Likely to Matter in Regression Investigation
### Tier 1 suspects
- app/dashboard/page.tsx
- lib/offlineSendFlush.ts
- lib/offlineApprovalSendFlush.ts
- lib/offlineApprovalSendOutbox.ts
- lib/offlineAttachmentFlush.ts
- public/sw.js

### Tier 2 suspects
- lib/offlineDashboardCache.ts
- lib/offlineAttachmentOutbox.ts
- lib/offlineApprovalFlush.ts
- app/api/send/create-job/route.ts
- app/api/send/process-job/route.ts

### Tier 3 suspects
- app/components/AttachmentList.tsx
- app/components/ProofAttachmentsWrapper.tsx
- app/components/ApprovalComposer.tsx
- app/api/approvals/list/route.ts
- app/layout.tsx

---

## Important Rule
Do not trust memory across chats.
This file, OFFLINE_PLAYBOOK.md, and REGRESSION_LEDGER.md are the source of truth.

---

## System Maintenance Protocol (MANDATORY)

This project uses external system files to prevent regression and loss of context across chats:

- BUILDPROOF_MASTER_HANDOFF.md
- OFFLINE_PLAYBOOK.md
- REGRESSION_LEDGER.md

These files must be updated at defined checkpoints.

### Required Update Checkpoints

You MUST update system files at the following moments:

1. After any full end-to-end offline test  
2. After discovering a regression or unexpected behavior  
3. After restoring to a previous checkpoint  
4. After completing a subsystem fix  
5. Before ending a work session if meaningful changes were made  

---

### What to Update

#### Update REGRESSION_LEDGER.md when:
- running tests
- observing failures
- confirming working flows
- identifying regression boundaries

#### Update BUILDPROOF_MASTER_HANDOFF.md when:
- system behavior changes
- architecture changes
- new stability or instability is confirmed
- direction or priorities change

#### Update OFFLINE_PLAYBOOK.md when:
- a new rule is discovered
- a mistake leads to a permanent constraint
- a process improvement is identified

---

### Critical Rule

Never rely on chat memory.

All important findings, rules, and system states must be written into these files.

Failure to update these files increases risk of regression and repeated loops.