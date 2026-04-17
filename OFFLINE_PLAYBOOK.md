# BuildProof Offline Playbook (LOCKED RULES)

This file defines non-negotiable rules for working on BuildProof core and offline systems.

These rules exist to prevent regression, repeated loops, and loss of working systems.

---

## 1. Freeze Core Offline Systems

The following systems are considered CORE and must not be modified unless the task is explicitly targeting them:

- offline project sync / remap
- send queue
- approval send queue
- attachment queue
- reconnect orchestration
- service worker / cache layer

If a task is UI, PDF, wording, layout, or display logic, these systems must not be touched.

---

## 2. One Subsystem Branch at a Time

No mixed-purpose work.

Each branch must target exactly one subsystem.

Examples:
- approval offline send fix
- reconnect behavior
- attachment rendering

Do not combine:
- offline logic + UI
- multiple queue systems
- reconnect + send + attachment changes

---

## 3. Mandatory Restore Point Before Any Core Offline Edit

Before modifying any core offline system:

1. Commit current working state
2. Create a safe-point branch
3. Record exact files being modified

This step is not optional.

---

## 4. Mandatory Restore Point After Any Successful Test

After any test passes:

- create a new restore point
- do not proceed without it

This prevents stacking risk on top of a working system.

---

## 5. End-to-End Gate After Every Core Offline Change

Every core offline change must pass the full scenario:

- create/open project
- client edit
- entry + attachment
- approval + attachment
- send update
- send approval
- reconnect
- refresh
- verify queues clear
- verify no duplicate project
- verify attachments render

If this test fails:

The change is not acceptable.

Revert immediately.

No “mostly working” states are allowed.

---

## 6. No Interpretation Without Checkpoint Comparison

If a failure occurs:

Do not guess.

First compare against previous restore point:

- did this behavior exist before?
- is this newly introduced?
- which files changed?

Only after this comparison can analysis begin.

---

## 7. Regression Ledger is Append-Only

- Never delete entries
- Never overwrite entries
- Always append new checkpoints

Failures are valuable and must be preserved.

---

## 8. Sacred Branch Rule

Branch:
fallback-safe-current

Rules:
- never commit to it
- never develop on it
- never merge into it

This branch is the guaranteed recovery anchor.

---

## 9. Assistant Usage Rule

The assistant may:
- organize
- format
- structure

The assistant must not:
- invent history
- assume behavior
- skip checkpoint validation

User provides truth. Assistant structures it.

---

## 10. Critical Principle

Do not rely on memory.

All system knowledge must exist in:
- BUILDPROOF_MASTER_HANDOFF.md
- OFFLINE_PLAYBOOK.md
- REGRESSION_LEDGER.md

If it is not written, it is not safe.