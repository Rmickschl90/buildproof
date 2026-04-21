# 🧱 BUILDPROOF OFFLINE PLAYBOOK (MASTER)

## 🎯 CORE PRINCIPLE

Offline is NOT a feature — it is the system.

All offline flows must:

* work without network
* persist immediately
* sync later without duplication or loss

---

## 🔒 NON-NEGOTIABLE RULES

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