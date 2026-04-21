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