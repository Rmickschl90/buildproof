# 🧱 BUILDPROOF OFFLINE PLAYBOOK

# 🎯 CORE PRINCIPLE

Offline is NOT a feature.
Offline IS the system.

All offline flows must:
- work without network
- persist immediately
- reconnect safely later
- avoid duplicates
- avoid silent data loss

---

# 🔒 LOCKED PRODUCT REQUIREMENT

While already signed in, the user must be able to:

- open the app
- view recent projects
- open a project offline
- view timeline/client info
- add entries
- add attachments
- create approvals
- reconnect later successfully

This is non-negotiable.

---

# 🔒 PROTECTED SYSTEMS

The following systems are currently considered stable/protected:

- reconnect orchestration
- proof remap pipeline
- approval remap pipeline
- send architecture
- approval send lifecycle
- share/snapshot architecture
- PDF/export generation
- offline project creation
- offline approval lifecycle

Do not rewrite these casually.

---

# 🔒 ONE ORCHESTRATOR RULE

Reconnect execution must have ONE owner.

Do NOT:
- stack reconnect triggers
- trigger reconnect recursively
- create attachment-complete reconnect loops
- introduce competing send flows

---

# 🔒 OUTBOX RULE

Outboxes ARE the offline system.

Current queues:
- offlineProofOutbox
- offlineAttachmentOutbox
- offlineApprovalOutbox
- offlineApprovalAttachmentOutbox
- offlineApprovalSendOutbox
- offlineSendOutbox

---

# 🔒 SEND RULE

Send must NEVER finalize until:
- proofs exist
- attachments exist server-side

Blocking incomplete sends is CORRECT behavior.

---

# 🔒 CURRENT MOBILE CAMERA RULE

Mobile camera-originated attachments are currently the primary instability surface.

Confirmed:
- library-selected offline images can pass
- single normalized camera image can pass
- multiple camera-originated replay uploads remain unstable

Current theory:
- mobile Safari/PWA blob replay instability
- OR normalization-engine instability

NOT currently believed to be:
- reconnect architecture failure
- send architecture failure
- proof remap failure

---

# 🔒 REQUIRED NORMALIZATION DIRECTION

Normalize images BEFORE queue insertion.

Preferred pipeline:

File
→ URL.createObjectURL(...)
→ `<img>`
→ canvas.drawImage(...)
→ canvas.toBlob("image/jpeg")
→ offline queue storage

Avoid relying solely on:
- `createImageBitmap(file)`

Reason:
- Safari/PWA replay reliability concerns
- broader web evidence supports the older img/canvas path as more durable cross-browser

---

# ❌ FAILED EXPERIMENTS — DO NOT REPEAT

The following did NOT solve the issue and were reverted:

- timeout upload wrappers
- alternate server upload lane
- reconnect-trigger upload recovery
- attachment-complete reconnect events
- broad reconnect balancing/recovery loops
- stacked retry/recovery logic

Rule:
Do not stack speculative recovery logic onto stable systems.

---

# 🔒 TESTING RULES

After any core edit:
- push
- deploy
- promote
- test on real mobile hardware

Required E2E path:
- online start
- offline create/edit
- offline attachments
- offline sends
- reconnect
- refresh
- verify no duplicates
- verify attachments render
- verify sends complete

---

# 🔒 DEBUGGING RULE

When repeated experiments fail:

DO:
1. revert
2. return to stable checkpoint
3. isolate one subsystem
4. prove the first actual failure

DO NOT:
- stack patches blindly
- widen architecture scope
- rewrite protected systems without proof

---

# 🔒 CLIENT-FACING RULES

Dashboard:
- drafts visible

Client-facing surfaces:
- finalized entries only
- pending/approved/declined approvals only

Never expose:
- draft entries
- draft approvals

---

# 🧠 CURRENT PRIORITY MODE

Allowed:
- isolated bug fixes
- upload reliability work
- UI cleanup
- tester-readiness polish

Avoid:
- architecture rewrites
- broad reconnect experimentation
- queue ownership changes
- new offline systems

---

# 🟢 CURRENT STATUS

BuildProof core offline architecture remains considered:
→ stable and field-capable

Current isolated blocker:
→ mobile offline replay of multiple camera-originated attachments