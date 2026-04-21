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
