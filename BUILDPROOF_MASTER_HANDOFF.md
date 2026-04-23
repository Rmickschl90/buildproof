# 🧱 BUILDPROOF — MASTER HANDOFF

## 🎯 PRODUCT

Contractor timeline + client updates + dispute-safe record
Offline-first system

---

## 🧠 CURRENT STATE

Working from:
restore-broken-state (Vercel commit a44a3bfc)

---

## ✅ VERIFIED WORKING

* login
* dashboard
* offline client save
* entry + attachment queueing

---

## 🔧 FIXED

Duplicate saveRecentProject call removed

---

## 🚨 ACTIVE ISSUES

* send not finalizing
* approval send not finalizing
* stuck “waiting to send”
* reconnect inconsistency

---

## 🧪 TEST PATH

1. create project ONLINE
2. go OFFLINE
3. add entry + attachment
4. create approval + attachment
5. send update + approval
6. go ONLINE
7. refresh

---

## 🔒 RULES

* one change at a time
* always push → promote → test
* always run full E2E
* no refactors

---

## 🎯 NEXT

Run test → report behavior → fix send/reconnect

## CURRENT STATE AT HANDOFF

Working branch/state:
- restore-broken-state
- core offline continuation flow is now stable

Confirmed stable:
- offline client save
- offline entry creation
- offline attachment behavior
- offline approval creation/send
- reconnect send/update completion
- newest offline entries included in update emails
- no navigation required for final send completion
- no duplicate project reproduced in final stabilized reconnect/send test

Next required subsystem:
- offline project creation

Why this is next:
- offline continuation is now stable
- remaining offline product gap is inability to start a brand-new project offline on the stabilized branch

Critical instruction for next chat:
- offline project creation must mirror the proven offline architecture already used elsewhere
- do not create a weaker or special-case implementation
- preserve current reconnect/send stability
- one subsystem only: offline project creation

Carry-forward bug audit:
- previous chat identified an obvious duplicate `saveRecentProject(...)` write bug on another branch
- current restore-broken-state dashboard still contains multiple `saveRecentProject(...)` writes in offline project sync logic and this must be rechecked before/while implementing offline project creation

## 🟢 VERIFIED CORE SYSTEM (NEW)

Offline lifecycle now fully functional:

- offline entry creation → syncs correctly
- offline approval creation → syncs correctly
- offline update send → completes on reconnect
- offline approval send → completes on reconnect
- reconnect → does not require navigation
- timeline → remains consistent (no disappearance)
- no duplicate records observed

---

## 🔴 CRITICAL BUG FIX (IMPORTANT FOR FUTURE WORK)

Approval-send failure was caused by:

- incorrect IndexedDB index reference in remap
- used "projectId" instead of "by_projectId"

Impact:
- broke remap
- caused approval send failure
- caused timeline disappearance after reconnect

Resolution:
- corrected index usage

Lesson:
- IndexedDB index naming must be treated as strict contract

---

## 🔒 NEW DEVELOPMENT RULES

1. NEVER modify multiple offline subsystems in one change
2. ALWAYS run full offline → reconnect → refresh test
3. ALWAYS inspect console before writing new fixes
4. ALWAYS verify remap coverage for new data types
5. ALWAYS tag stable states (e.g. stable-offline-lifecycle)

---

## NEXT SAFE DEVELOPMENT AREA

Approval attachments (as originally planned)

Reason:
- builds on now-stable approval system
- does not require altering core offline pipeline

## 🟢 FULL OFFLINE FIELD TEST (LATEST VERIFIED)

Full offline field test passed end-to-end:

- create new project offline
- add client info offline
- edit client info offline
- add entry with multiple attachments offline
- create approval with multiple attachments offline
- send update offline
- send approval offline
- reconnect
- hard refresh

Verified result:
- project synced correctly
- client info persisted correctly
- entry synced and finalized correctly
- approval synced and moved to pending correctly
- entry attachments rendered correctly in UI and email
- approval attachments rendered correctly in UI and email
- update send completed correctly
- approval send completed correctly
- waiting banner cleared correctly
- no duplicates observed
- no disappearance after hard refresh

Conclusion:
- core offline lifecycle is now field-ready

## 🟢 APPROVAL ATTACHMENTS STATUS (LATEST VERIFIED)

Approval attachments are already working across:
- online
- offline
- reconnect
- hard refresh
- send / post-send lock state

Verified:
- attachment visible before send
- attachment visible after send
- no duplicates observed
- attachment remains correct after refresh
- approval locks after send as expected

Conclusion:
- approval attachments are not a future build-from-scratch task
- next work for this subsystem is refinement / consistency only where needed

## 🔴 KNOWN PRODUCT GAP (NEW)

Offline draft deletion is not fully implemented.

Observed:
- offline entry draft delete is blocked because the three-dot menu is disabled / grayed out
- offline approval draft delete attempts server path and fails with "Failed to fetch"

Required rule going forward:
- any draft created offline must be deletable offline before send

This is now the next clear product/system gap discovered after stabilizing the full offline lifecycle.

## BUILDPROOF_MASTER_HANDOFF.md

# BUILDPROOF — MASTER HANDOFF

## Updated after client-facing polish, share-page refinement, and template timeline cleanup

---

## 1. PRODUCT IDENTITY (LOCKED)

BuildProof is:

* a clean contractor communication journal
* a client-friendly project update tool
* a dispute-safe record system as a byproduct

Must remain:

* simple
* mobile-first
* fast
* trustworthy
* not heavy/legal-feeling in normal use

---

## 2. CURRENT PRODUCT STAGE

BuildProof is no longer in broad feature-build mode.

Current stage:

* production refinement
* issue burn-down
* client-facing consistency polish
* rollout preparation for small tester group

Working rule:

* verify
* patch
* polish
* ship

Do not rewrite stable systems.

---

## 3. CURRENT LOCKED / STABLE SYSTEMS

These should be treated as protected unless directly proven broken:

### Core app

* dashboard project flow
* project selection and persistence
* client save/edit flow
* project archive/restore flow

### Entries / timeline

* entry create/edit/archive/restore/delete rules
* title-only closed-card timeline behavior
* full content available behind View
* entry attachments
* entry finalize-on-send behavior

### Offline systems

* reconnect orchestration
* offline queue / outbox ownership
* offline proof creation/sync
* offline attachment queue
* offline approval queue
* offline approval attachment queue
* offline send queue
* dashboard cache / recent project restore architecture

### Approval system

* draft -> send -> respond lifecycle
* approval attachments
* dashboard approval rendering
* approval email flow
* approval response flow
* archive behavior
* client-facing visibility rules

### Send / delivery

* create-job/process-job pipeline
* delivery history architecture
* send completion behavior
* no broad send rewrite allowed

### PDF / dispute generation

* core PDF pipeline
* dispute export pipeline
* image rendering pipeline
* current timezone/display formatting approach

### Share / update surfaces

* share page architecture
* tokenized share/update page flow
* current client-facing rendering model

---

## 4. WHAT THIS CHAT COMPLETED

### A. Approval attachment-created draft visibility fix

* attachment-triggered approval draft creation now dispatches immediate UI refresh
* removed delayed/ghost draft appearance behavior

### B. Draft approvals removed from client-facing surfaces

Locked product rule now enforced across client-facing outputs:

* drafts excluded
* pending / approved / declined included

Affected surfaces:

* update email output
* share/update page
* standard PDF
* dispute packet

### C. Client-facing timestamp cleanup

Fixed remaining 5-hour drift in:

* official project record/export header
* PDF footer generated time
* communication events
* delivery history
* project view record

### D. Project date range fix in client docs

Project summary range now reflects:

* earliest visible timeline activity
* latest visible timeline activity
* using same timezone-aware logic as visible cards

### E. Attachment count consistency across client-facing docs

Counts now reflect attachments from:

* entries
* approvals

### F. Share/update package summary simplification

Client-facing share/update package now uses simplified summary model:

* Entries
* Approvals
* Attachments
* Finalized

Instead of cluttered files/photos/PDF sub-breakdowns.

### G. Share page branding/header cleanup

* restored minimal top header strip
* header now holds logo + read-only state pills
* removed duplicate hero logo treatment
* improved hierarchy and visual clarity

### H. Template timeline cleanup

Closed entry cards now show title only.
Full content still appears when View is opened.

This was done to stop template-based entries from making the timeline excessively tall.

### I. Added new template

Added:

* Inspection Failed

Structured fields:

* Inspector
* Area inspected
* Reason
* Action required
* Follow-up date
* Notes

### J. Template layout cleanup

Template buttons restored to a 2-column layout with cleaner card-width usage.

---

## 5. CURRENT KNOWN ACCEPTED LIMITATIONS

### 1. Rare offline edit edge case

Same-entry offline edit after reconnect and another offline period can still be inconsistent.
Accepted for now to avoid destabilizing core offline systems.

### 2. Subtle transparent logo halo

Visible only on close inspection on dark backgrounds.
Accepted for V1.

### 3. Mobile plain button text color inconsistency

Observed:

* desktop plain buttons = black text
* mobile plain buttons can appear blue

Likely a browser/platform styling issue.
Deferred to next chat to keep this one controlled.

---

## 6. CURRENT PRODUCT DECISIONS NOW LOCKED

### Timeline behavior

* closed card = first line/title only
* View = full content

### Approval visibility

* drafts = internal only
* pending / approved / declined = client-facing

### Share/update package summary

* Entries
* Approvals
* Attachments
* Finalized

### Client-facing counts

If it is visible in a client-facing document, it should be reflected in the summary counts.

### Current refinement philosophy

* visible user-facing issue = worth fixing
* rare deep edge case = document first, do not rebuild blindly

---

## 7. UPDATED RELEVANT FILE TREE

app/
├── dashboard/
│   └── page.tsx  ← updated for title-only closed timeline cards + new template + template grid cleanup
├── share/
│   └── [token]/
│       └── page.tsx  ← updated for client-facing summary cleanup + header/hero branding polish
├── archived/
│   └── page.tsx
│
├── api/
│   ├── approvals/
│   │   ├── create/route.ts
│   │   ├── update/route.ts
│   │   ├── send/route.ts
│   │   ├── delete/route.ts
│   │   └── list/route.ts
│   ├── attachments/
│   │   ├── upload/route.ts
│   │   ├── delete/route.ts
│   │   └── open/route.ts
│   ├── export/
│   │   └── pdf/route.ts  ← used in client-facing PDF/dispute fixes
│   ├── send/
│   │   ├── email/route.ts  ← updated for client-facing approval visibility rule
│   │   ├── create-job/route.ts
│   │   └── process-job/route.ts
│   └── share/
│       ├── create/route.ts
│       ├── revoke/route.ts
│       ├── current/route.ts
│       └── [token]/
│           └── export/route.ts
│
components/
├── ApprovalCard.tsx
├── ApprovalComposer.tsx  ← updated earlier in this phase for attachment-created draft refresh behavior
├── DeliveryHistoryPanel.tsx
├── OnboardingWizard.tsx
├── ProofAttachmentsWrapper.tsx
├── SendUpdatePack.tsx
│
lib/
├── pdf/
│   └── buildProjectPdf.ts  ← updated for timestamp alignment, date range fix, client doc count fixes
├── offlineApprovalOutbox.ts
├── offlineApprovalAttachmentOutbox.ts
├── offlineApprovalSendOutbox.ts
├── offlineAttachmentOutbox.ts
├── offlineDashboardCache.ts
├── offlineProofOutbox.ts
├── offlineRecentProjects.ts
├── supabase.ts
├── supabaseServer.ts
│
public/
└── buildproof-logo.png

Root support files:
├── REGRESSION_LEDGER.md
├── OFFLINE_PLAYBOOK.md
└── BUILDPROOF_MASTER_HANDOFF.md

---

## 8. NEXT SAFE PRIORITIES

Keep next chat narrow.

Recommended next scope:

1. mobile/plain button text color consistency
2. any remaining isolated visible UI polish
3. tester-readiness pass
4. soft-launch prep

Avoid:

* architecture rewrites
* offline system expansion
* broad reconnect changes
* send pipeline experimentation

---

## 9. NEXT-CHAT WORKING STYLE

User preference remains locked:

* one step at a time
* exact file name
* exact search/replace guidance
* no bundled risky edits
* no fluff

Best workflow:

* inspect current file first
* give one exact edit
* wait for “done”
* move to next step

---

## 10. BOTTOM LINE

BuildProof is now very close to V1 soft-launch condition.

What is true now:

* client-facing output is much more intentional
* template/timeline usability is stronger
* client-facing approval visibility rules are correct
* timestamps are aligned
* counts are aligned
* share page branding/header is in acceptable V1 shape
* core systems remain protected

The app is in:

* final tightening
* not foundation-building
