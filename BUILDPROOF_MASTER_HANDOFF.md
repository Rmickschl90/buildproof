🧱 BUILDPROOF — MASTER HANDOFF (UPDATED)
🎯 PRODUCT

BuildProof is:

a contractor communication timeline
a client-friendly project update tool
a dispute-safe record system (byproduct, not the primary UX)

Core principles:

simple
mobile-first
fast
trustworthy
clean client experience (no internal noise)
🧠 CURRENT PRODUCT STAGE

BuildProof is in:

→ V1 TESTING / ROLLOUT PREPARATION

This is NOT a build phase anymore.

Working mode:

verify
patch
polish
ship

🚨 DO NOT:

rewrite working systems
introduce new architecture
“improve” stable logic
🟢 CURRENT SYSTEM STATUS (LOCKED)

All core systems are now functionally complete and stable.

✅ Verified Working
offline project creation
offline client save/edit
offline entry creation
offline entry attachments
offline approval creation
offline approval attachments
offline update send
offline approval send
reconnect sync (no navigation required)
hard refresh persistence
no duplicate records
no timeline disappearance
send finalization works correctly
approval send transitions correctly to pending
no stuck “waiting to send” banner

System classification:

→ STABLE FOR V1 TESTING

🔒 CLIENT-FACING DATA MODEL (CRITICAL — LOCKED)

BuildProof now enforces strict separation between internal state and client-facing state.

🧑‍💻 Dashboard (Internal)
drafts visible
editable
full working state
🔗 Share Link (Manual Share)
LIVE view
updates with project
shows:
finalized entries only (locked_at)
approvals: pending / approved / declined
NEVER shows drafts
📩 Send Update (Email Link)
SNAPSHOT (frozen)
shows:
entries locked at send (locked_entry_ids)
approvals where:
sent_at <= processed_at
NEVER updates after send
📄 PDF / Dispute Export
SNAPSHOT (matches send state)
uses same rules as send update
🚨 NON-NEGOTIABLE RULE

Client-facing systems MUST use:

entries → locked_at
approvals → sent_at

NEVER:

created_at (invalid for visibility)
⚠️ Accepted Edge Case

Snapshot cutoff uses:

→ send_jobs.processed_at

NOT button click moment.

A small timing window exists during processing.

✔ Accepted as safe for V1

🧪 V1 TEST PATH (LOCKED)
Snapshot Behavior Test
create project
add entry
create approval → send (pending)
send update
open email snapshot link

Verify:

entry visible ✅
approval visible ✅
add new entry
create new approval → send (pending)
refresh SAME snapshot link

Expected:

new entry → NOT visible ✅
new approval → NOT visible ✅
Share Link Behavior Test

Open manual share link:

latest finalized entries → visible ✅
latest pending approvals → visible ✅
drafts → NOT visible ✅
Full System Test
online flow
offline flow
offline refresh + reconnect
send update
send approval
PDF generation
dispute export

Everything must match rules above.

🎯 PRODUCT DECISIONS (LOCKED)
Timeline
closed card = title only
View = full content
Approval Visibility
drafts → internal only
pending / approved / declined → client-facing
Share vs Snapshot Behavior
share link = LIVE project view
send update = FIXED snapshot
PDFs = FIXED snapshot
Client Communication Rule

This link updates as the project progresses. Sent updates provide a fixed record.

Client-Facing Consistency

If a record is visible to a client:

→ it must follow snapshot/share rules exactly
→ no exceptions

🔧 WHAT THIS PHASE FIXED (IMPORTANT)
✅ Snapshot Integrity Fix
approvals now filtered using sent_at
prevents retroactive approval appearance
✅ Draft Leak Elimination
no drafts in:
share link
send snapshot
PDF
dispute export
✅ Share Link Behavior Locked
live + safe
no drafts
always current
✅ PDF / Dispute Alignment
matches snapshot exactly
consistent attachments and rendering
✅ UI Clarity Improvement

Added helper text near share link:

This link updates as the project progresses. Sent updates provide a fixed record.

📁 CURRENT FILE TREE (RELEVANT)
app/
├── dashboard/page.tsx
├── share/[token]/page.tsx
├── api/
│   ├── send/
│   │   ├── create-job/route.ts
│   │   ├── process-job/route.ts
│   │   └── email/route.ts
│   ├── approvals/
│   ├── attachments/
│   ├── export/pdf/route.ts
│   └── share/[token]/export/route.ts

components/
├── SendUpdatePack.tsx   ← share link UI helper text added
├── ApprovalCard.tsx
├── ApprovalComposer.tsx
├── ProofAttachmentsWrapper.tsx

lib/
├── pdf/buildProjectPdf.ts
├── offline* (all outbox systems)
├── supabaseServer.ts

public/
└── buildproof-logo.png

root:
├── REGRESSION_LEDGER.md
├── OFFLINE_PLAYBOOK.md
├── BUILDPROOF_MASTER_HANDOFF.md
🔒 DEVELOPMENT RULES (CRITICAL)
one subsystem at a time
always push → promote → test
always run full E2E
NEVER modify stable offline systems without restore point
NEVER introduce parallel reconnect flows
NEVER use created_at for client-facing filtering
🧠 KNOWN ACCEPTED LIMITATIONS
snapshot timing window during processing (acceptable)
minor UI polish items deferred
rare deep offline edge cases not worth destabilizing system
🚀 NEXT STEP

Move to:

→ FULL V1 TESTING PASS

DO NOT:

add features
refactor systems

ONLY:

test
validate
log issues
fix surgically
🟢 CURRENT STATE (FINAL)

The following is now true:

no drafts appear in any client-facing surface
snapshot links do NOT update after send
share links update with project changes
no retroactive approvals appear in snapshots
PDF/dispute match snapshot state
🧱 BOTTOM LINE

BuildProof is now:

→ production-ready for controlled V1 testing