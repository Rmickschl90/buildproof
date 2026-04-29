# 🧱 BUILDPROOF OFFLINE PLAYBOOK (MASTER)

## VERIFIED CURRENT SYSTEM STATE (IMPORTANT CORRECTION)

The full core offline lifecycle is already functioning and has been tested.

This includes:
- offline project creation
- offline client save/edit
- offline entry creation
- offline entry attachments
- offline approval creation
- offline approval attachments
- offline update send
- offline approval send
- reconnect sync
- hard refresh persistence

Meaning:
- offline project creation is NOT a future milestone
- offline project creation is already part of the verified working system

Current rule going forward:
- do not treat core offline architecture as missing
- do not rebuild offline project creation from scratch
- do not reopen protected reconnect/remap/send systems without a proven reproducible regression

Current priority mode:
- targeted bug fixes
- UI/product polish
- client-facing consistency
- tester-readiness
- small refinements only

## 🎯 CORE PRINCIPLE

Offline is NOT a feature — it is the system.

All offline flows must:

* work without network
* persist immediately
* sync later without duplication or loss

---

## 🔒 NON-NEGOTIABLE RULES

### 🔒 SYSTEM CONTEXT RULE — ASSUME CONNECTED SYSTEMS

Never edit a file as if it only affects one thing.

Before changing logic, assume the code may be connected to:
- offline behavior
- reconnect behavior
- send queues
- refresh/repaint behavior
- cached state
- client-facing outputs
- duplicate prevention

Rule:
- inspect the surrounding system before editing
- identify why the current code may exist
- do not remove guards, triggers, retries, or duplicate-looking logic without understanding what they protect
- if unsure, pause and inspect related files first

Editing blindly without system context is not acceptable BuildProof practice.

### 🔒 ASSUMPTION RULE — VERIFY BEFORE MODIFYING

Do NOT assume behavior from memory.

Before changing logic:
- verify the user’s exact observed behavior
- identify the exact failing subsystem
- do not modify working systems based on guesses

If unsure, ask before editing.

### 1. ONE ORCHESTRATOR ONLY

Reconnect logic must have ONE owner.

### 2. OUTBOXES ARE THE SYSTEM

* proofs → offlineProofOutbox
* attachments → offlineAttachmentOutbox
* approvals → offlineApprovalOutbox
* approval attachments → offlineApprovalAttachmentOutbox
* approval sends → offlineApprovalSendOutbox
* sends → offlineSendOutbox

### 3. ORDER MATTERS

Flush order:

1. approvals
2. approval attachments
3. approval sends

### 4. FULL BATCH GUARD

Use one global guard for flush.

### 5. ID MAPPING

offline-id → server-id mapping required

### 6. DUPLICATE CAUSES

* multiple flush triggers
* missing idempotency
* double writes

### 7. OFFLINE NAVIGATION

Persist last project locally

### 8. SEND RULE

Send only after:

* entries exist
* attachments uploaded

### 9. TEST STANDARD

Full offline → reconnect → refresh cycle REQUIRED

---

## 🧪 BUG REPORT FORMAT REQUIRED

When something fails, report exactly:

- Step being performed
- Expected result
- Actual result
- Online or offline?
- After refresh or not?
- Screenshot if possible

No fix should be attempted without this.

## 🚨 RED FLAGS

* duplicate projects
* stuck sends
* missing attachments
* approvals stuck in draft

## Offline Project Creation Rule (NEW LOCKED RULE)

Offline project creation is the next required offline milestone.

Requirements:
- must mirror the existing proven offline architecture
- must not be implemented as a one-off fragile shortcut
- must use durable local record creation
- must remap offline project id -> server project id on reconnect
- must remap dependent offline records after project sync
- must preserve recent-project cache, selected project state, and cached dashboard snapshot
- must not break the now-stable offline proof / attachment / approval / send pipeline

Implementation rule:
- copy the existing offline pattern style already proven elsewhere in BuildProof
- do not invent a thinner or timing-dependent model just for project creation

Regression rule:
- explicitly audit for duplicate `saveRecentProject(...)` / duplicate local write paths before and after any offline project creation edit

## 🔒 CRITICAL RULE — INDEX CONSISTENCY

IndexedDB index names MUST match exactly between:
- store.createIndex(...)
- store.index(...)

Failure mode:
- wrong index name throws NotFoundError
- aborts remap silently
- downstream queues operate on stale IDs
- causes API failures and UI desync

Rule:
- NEVER assume index name matches field name
- ALWAYS reference the exact index name defined in the store

---

## 🔒 CRITICAL RULE — REMAP COMPLETENESS

Every entity that stores projectId or approvalId MUST be remapped:

Required remaps:
- proofs
- attachments
- approvals
- send outbox
- approval-send outbox

Failure mode:
- partial remap = system appears partially working
- downstream APIs fail with valid-looking but wrong IDs

---

## 🔒 CRITICAL RULE — ERROR CASCADE AWARENESS

Single failure in early pipeline (e.g. remap) can cause:

- downstream API 404s
- send failures
- timeline disappearance
- UI appearing empty

Rule:
- ALWAYS inspect first error in console
- DO NOT debug downstream symptoms first

---

## 🔒 DEBUGGING RULE — STOP GUESSING

When:
- multiple edits fail
- behavior becomes inconsistent

DO:
1. revert unproven changes
2. return to last stable state
3. inspect runtime (network + console)
4. identify first failure point

DO NOT:
- stack patches blindly

## 🔒 VERIFIED SYSTEM STATE — DO NOT REOPEN CORE WITHOUT CAUSE

The following are now verified stable and should be treated as protected core behavior:

- offline project creation
- offline client save
- offline client edit
- offline entry creation
- offline entry attachments
- offline approval creation
- offline approval attachments
- offline update send
- offline approval send
- reconnect sync
- hard refresh persistence
- no duplicate records in verified full offline test

Rule:
- do not reopen core reconnect / remap / send pipeline unless a new reproducible regression is proven

---

## 🔒 APPROVAL ATTACHMENTS RULE

Approval attachments are already working across:
- online
- offline
- reconnect
- refresh
- send / post-send locked state

Rule:
- approval attachments are NOT a missing subsystem
- future work should focus on rendering consistency and product rules only, not rebuilding attachment architecture

---

## 🔒 DRAFT DELETE RULE

Any draft created offline must be deletable offline before send.

This applies to:
- entry drafts
- approval drafts

Failure modes discovered:
- entry draft delete currently blocked by disabled UI state
- approval draft delete currently hits online/server path and fails offline

Rule:
- draft delete must never depend on network availability
- delete behavior must operate on offline/local records first

## OFFLINE_PLAYBOOK.md

# BUILDPROOF OFFLINE PLAYBOOK

## LOCKED PRODUCT REQUIREMENT

While already signed in, the user must be able to:

* open the app
* see recently used projects
* open one of those projects offline
* view that project’s timeline and client info
* add entries
* add attachments
* create approvals
* have everything sync later

This remains non-negotiable.

---

## CORE RULES

### 1. Freeze core systems unless directly targeted

Do not casually touch:

* offline queue/reconnect orchestration
* send queue/system
* approval lifecycle
* attachment queue/system
* PDF generation core
* delivery history
* share token architecture

Only patch proven issues inside the exact subsystem being worked on.

---

### 2. One subsystem branch at a time

Do not mix:

* offline queue work
* send work
* share work
* PDF work
* UI polish

Keep scope isolated.

---

### 3. Restore point before core changes

Before editing any core subsystem:

* commit current working state
* create safe restore point / safe branch if needed
* record exact files being changed

---

### 4. End-to-end gate after core changes

After any core system change, verify:

* project create/open
* client save/edit
* entry create
* entry attachment
* approval create
* approval attachment
* send update
* send approval
* reconnect behavior
* refresh behavior
* no duplicates
* attachment rendering remains intact

---

### 5. One owner rule

Only one orchestrator owns reconnect/flush logic.

Locked rule:

* dashboard owns reconnect execution
* bootstrap/external listeners may trigger
* they must NOT duplicate orchestrator logic

---

### 6. Full-batch guards

Outbox guards must wrap the full batch operation, not individual items.

No overlapping reconnect flushes.
No duplicate flush runs.

---

### 7. Offline navigation is state-based

Offline restore must be driven by cached state, not route assumptions.

Use:

* cached selected project
* recent projects
* last-open project id

Do not rely on router state offline.

---

### 8. Cache-first render for critical state

Critical offline state must initialize synchronously from cache where required.

Never depend on late `useEffect` restore for the first render of critical offline/project state.

---

### 9. Reconnect architecture rule

Reconnect detection may live outside React lifecycle, but reconnect execution must stay inside the dashboard orchestrator.

Communication between them should happen via event trigger, not duplicate reconnect logic.

---

## UI / PRODUCT RULES

### 10. Timeline is scan-first

Timeline cards should support fast scanning.

Locked rule for entries:

* closed card = title / first-line summary only
* full content lives behind View

Do not let template body content bloat the timeline.

---

### 11. Client-facing outputs must follow product intent

Client-visible surfaces must only show what is intentionally client-facing.

Locked rules:

* draft approvals are internal only
* only pending / approved / declined approvals are client-facing
* client-facing counts must include anything visible in the document
* share/update package should favor simplified summaries over forensic breakdown

---

### 12. If it works, don’t touch it

Current phase is refinement, not rebuild.

Working rule:

* If it works → don’t touch it
* If it’s rare → log it, don’t rebuild it
* If it’s visible to users → fix it

---

## ACCEPTED LIMITATIONS / DEFERRED ITEMS

### 13. Rare offline edit edge case

Editing the same entry offline, reconnecting, then going offline again and trying to edit the same field can still be inconsistent.

Accepted for now because:

* rare path
* no data-loss catastrophe
* fixing it risks expanding offline edit complexity too far

Do not chase this unless it becomes a true field blocker.

---

### 14. Minor logo asset halo

The transparent BuildProof logo has a subtle halo on dark surfaces.

Accepted for V1.
Treat as asset cleanup later, not a code/system issue.

---

## CURRENT PRIORITY MODE

BuildProof is in:

* issue burn-down
* usability tightening
* client-facing consistency polish
* pre-tester stabilization

Not in:

* major feature expansion
* architecture rewrite
* broad offline experimentation

---

## CURRENT SAFE DIRECTION

Allowed:

* isolated visible bug fixes
* UI cleanup
* client-facing consistency fixes
* template/timeline usability polish
* soft-launch prep

Avoid:

* revisiting locked architecture
* broad offline edit expansion
* mixing new systems into stable flows

## Offline Playbook Update — Current V1 Offline Status

Confirmed working:
- Offline project creation
- Offline project open/reopen from recent projects
- Offline client info edits
- Offline project notes autosave
- Offline entry creation
- Offline entry attachments
- Offline approval creation
- Offline approval attachments
- Offline approval recipient-source tracking
- Offline custom-recipient warning
- Offline send update queue
- Offline send approval queue
- Reconnect sync for the above systems

Current rule:
- Offline project creation is no longer an active TODO.
- Do not redesign offline project creation unless a new reproducible bug appears.
- Future offline edits must be limited to the exact failing subsystem.

Required V1 offline testing gate:
- online dashboard open
- go offline
- create project
- add client info
- add project notes
- add entry
- add entry attachment
- create approval
- change approval recipient email
- confirm offline warning appears
- add approval attachment
- queue send update
- queue send approval
- refresh while offline
- reopen project
- reconnect
- confirm project remaps cleanly
- confirm entries/attachments/approvals sync
- confirm sends complete
- confirm no duplicate projects, entries, approvals, or stuck banners
- export dispute package and verify recipient/IP records