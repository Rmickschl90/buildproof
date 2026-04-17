# BuildProof Regression Ledger

This file is append-only.

Do not delete old entries.
Do not rewrite history.
Add new checkpoints as they happen.

---

## Checkpoint: safe-point-before-reconnect-isolation

Purpose:
- preserve baseline before reconnect isolation work

Status:
- used as restore point before reconnect experiments

Notes:
- later rollback to this point did NOT resolve broader offline regression symptoms
- indicates reconnect work from that chat was not the sole cause of later failures

---

## Checkpoint: safe-point-after-reconnect-lock

Purpose:
- preserve working reconnect-isolation version after offline refresh reconnect succeeded

Observed:
- isolated reconnect trigger worked
- full reconnect pipeline fired
- reconnect guard did not break flow

Important:
- later end-to-end testing revealed broader regressions in current branch/state
- this checkpoint should not be assumed to represent full system safety across all offline flows

---

## Checkpoint: fallback-safe-current

Purpose:
- sacred fallback anchor
- current safe recovery point

Rules:
- do not develop on this branch
- do not commit to this branch
- use only for recovery and comparison

---

## Checkpoint: broad regression discovered during full offline E2E

Test:
- start online on dashboard
- go offline
- create project
- add client
- create approval and entry
- add attachments to both
- hit send update and send approval while offline
- reconnect
- hard refresh

Observed:
- sends did not resume correctly on reconnect
- approval remained draft
- update send did not finalize correctly
- stuck "updates waiting to send" banner remained
- duplicate project created
- attachments did not show correctly
- failure occurred on both mobile and desktop

Meaning:
- this was a system-level regression signal
- not safe to continue stacking edits on top of that state

---

## Checkpoint: cache-cleared baseline retest

Environment reset:
- mobile website data cleared
- desktop site data / IndexedDB / service worker cleared

Entry-only test result:
- stuck banners cleared
- entry flow worked normally again

Meaning:
- cache / IndexedDB leftovers contributed to phantom UI state
- stuck banners were not reliable proof of active logic failure by themselves

---

## Checkpoint: approval creation retest after clean reset

Test:
- create project online
- go offline
- create entry + attachment
- create approval + attachment
- reconnect
- do not send approval yet

Observed:
- flow was clean
- no duplicate project
- attachments visible
- approval creation itself worked

Meaning:
- core offline creation flow is stable
- approval creation is not the isolated failure

---

## Checkpoint: approval send isolation test after clean reset

Test:
- create project online
- go offline
- create one approval
- send approval while offline
- reconnect

Observed:
- approval stayed draft
- approval did not move to pending automatically

Meaning:
- offline approval send path is a confirmed failing subsystem

---

## Checkpoint: safe-point-before-offline-project regression boundary test

Test:
- create/open existing server project online
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

## Checkpoint: local auth test blocked

Observed:
- localhost dev server runs
- login magic link still redirects to app.buildproof.app / Cloudflare path
- local testing remains blocked by auth redirect configuration

Meaning:
- app/login/page.tsx runtime-origin change alone is not enough
- auth finish / redirect chain still contains old domain behavior
- localhost is not yet a usable investigation surface

---

## Suspect File Groups from broader broken state

Touched files noted before rollback included:
- app/api/approvals/list/route.ts
- app/api/send/create-job/route.ts
- app/api/send/process-job/route.ts
- app/components/ApprovalComposer.tsx
- app/components/AttachmentList.tsx
- app/components/OfflineAttachmentBootstrap.tsx
- app/components/ProofAttachmentsWrapper.tsx
- app/dashboard/page.tsx
- app/layout.tsx
- lib/offlineApprovalAttachmentOutbox.ts
- lib/offlineApprovalFlush.ts
- lib/offlineApprovalOutbox.ts
- lib/offlineApprovalSendFlush.ts
- lib/offlineApprovalSendOutbox.ts
- lib/offlineAttachmentFlush.ts
- lib/offlineAttachmentOutbox.ts
- lib/offlineDashboardCache.ts
- lib/offlineProofOutbox.ts
- lib/offlineSendFlush.ts
- public/sw.js

Later narrowed investigation diff vs fallback-safe-current:
- app/api/approvals/list/route.ts
- app/api/send/create-job/route.ts
- app/api/send/process-job/route.ts
- app/components/ApprovalComposer.tsx
- app/components/AttachmentList.tsx
- app/components/OfflineAttachmentBootstrap.tsx
- app/components/OfflineReconnectBootstrap.tsx
- app/components/ProofAttachmentsWrapper.tsx
- app/dashboard/page.tsx

Working theory:
- broader regression likely involved multiple core offline subsystems
- approval offline send remains an isolated confirmed issue
- duplicate project / stuck send banner / missing attachments likely require separate regression comparison against safe anchor

---

## Current Next Direction

Do not debug from memory.

Use:
- fallback-safe-current as sacred anchor
- broken-state investigation branch for forensics
- one subsystem at a time
- restore point before every core offline edit
- full E2E gate after every core offline change

## Checkpoint: remove extra signing-in hop from auth finish

Scope:
- auth/local routing investigation only
- no intentional offline queue / reconnect / attachment / send edits

Observed:
- app/auth/finish/page.tsx successfully handles auth work directly
- intermediate redirect to /auth/finish/signing-in introduced a no_session failure
- extra signing-in hop is not required after auth finish establishes session and server cookie

Meaning:
- auth finish should redirect directly to redirectedFrom or /dashboard
- removing the intermediate signing-in page reduces auth chain fragility