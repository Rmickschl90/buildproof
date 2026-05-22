🧱 BUILDPROOF — MASTER HANDOFF

🎯 PRODUCT

BuildProof is:

• a contractor communication timeline  
• a client-friendly project update tool  
• a dispute-safe documentation system  

Core principles:

• simple  
• mobile-first  
• offline-capable  
• trustworthy  
• clean client experience  
• finalized record integrity  

---

🧠 CURRENT PRODUCT STAGE

BuildProof is now officially in:

→ CONTROLLED PRIVATE V1 FIELD TEST

This is no longer a rebuild phase.

Current operational mode:

• observe real-world usage  
• preserve stability  
• avoid unnecessary deployments  
• collect user behavior + feedback  
• patch only critical issues surgically  

DO NOT:

• redesign stable systems  
• rewrite architecture  
• introduce broad reconnect/send experiments  
• destabilize production during tester rollout  
• casually revisit reverted replay experiments  

Production should remain effectively frozen except:
• emergency fixes
• trust/safety fixes
• tester-blocking regressions

---

🟢 CURRENT VERIFIED V1 STATE

The following systems are VERIFIED WORKING and should now be treated as protected production systems.

Offline Core

PASS

• offline project creation  
• offline client save/edit  
• offline project notes  
• offline project rename  
• offline entry creation  
• offline approval creation  
• reconnect sync  
• hard refresh persistence  

Entry Attachment System

PASS

• entry attachments online  
• library-selected offline entry attachments  
• multiple camera-originated mobile offline entry attachments  
• reconnect replay  
• attachment rendering  
• send update finalization  

Approval Attachment System

PASS

• approval attachments online  
• library-selected offline approval attachments  
• multiple camera-originated mobile offline approval attachments  
• reconnect replay  
• approval send continuation  
• approval attachment rendering  

Send Systems

PASS

• offline update send  
• offline approval send  
• reconnect-trigger send continuation  
• send snapshot integrity  
• share vs snapshot separation  
• approval duplicate-email hardening  

Timestamp / Trust Systems

PASS

• share header timestamp semantics aligned with visible timeline events  
• offline approval timezone replay persistence fixed  
• client-facing timestamps preserve jobsite-local event time  
• DST-safe architecture verified  
• approval replay preserves timezone metadata correctly  

Client-Facing Rules

PASS

• no drafts on client-facing surfaces  
• snapshot links frozen after send  
• share links remain live/update dynamically  
• PDFs/dispute exports aligned with snapshot rules  

---

🧱 FINAL VERIFIED E2E PASS

ONLINE FLOW — PASS

• project creation  
• client info  
• project notes  
• entries  
• attachments  
• approvals  
• update sends  
• approval sends  
• share links  
• PDFs/dispute export  
• archive/restore workflows  

OFFLINE FLOW — PASS

• offline project creation  
• offline client edits  
• offline notes  
• offline entries  
• offline attachments  
• offline approvals  
• offline approval attachments  
• offline update send  
• offline approval send  
• reconnect replay  
• hard refresh persistence  
• no duplicate projects  
• no stuck queues  
• no missing attachments  

Security Hardening — PASS

• RLS enabled and validated:
  - approval_tokens
  - approval_requests
  - approval_responses
  - send_jobs
  - message_deliveries
  - share_views
  - project_contact_events

• proofs_active secured using security_invoker=true  
• second-account isolation validated  
• fresh-user onboarding validated  

---

🧱 MEDIA SUPPORT DECISION — V1

VERIFIED SUPPORTED MEDIA

• photos/images  
• PDFs  
• document/file attachments  

VIDEO SUPPORT STATUS

Online video behavior was observed functioning successfully:
• upload works
• attachment storage works
• email/share playback works
• attachment open route works

However:

offline/replay-safe video support has NOT yet been intentionally validated.

To preserve rollout reliability:

• entry attachment uploaders now block video
• approval attachment uploaders now block video
• iOS picker no longer exposes video option
• unsupported media paths are intentionally gated for V1

This was a deliberate rollout trust decision.

---

🎥 FUTURE VIDEO ROADMAP

Future rollout target:

• offline-safe video replay  
• reconnect-safe video remapping  
• mobile-friendly playback handling  
• share/email video validation  
• dispute export/PDF video behavior decisions  
• large mobile file handling validation  

Important:

Video capability was NOT removed from the architecture.
It was intentionally deferred until replay-safe validation can occur.

---

🧠 FINAL PRODUCT POSITIONING

BuildProof’s strongest differentiator is now clearly:

→ dispute-ready project documentation

Key trust architecture:

• finalized records  
• immutable send snapshots  
• approval tracking  
• attachment preservation  
• delivery history  
• share access activity  
• timestamp integrity  
• dispute export generation  

The system now clearly separates:

LIVE TIMELINE
→ dynamic ongoing project visibility

FROM

SENT SNAPSHOT RECORDS
→ frozen client-facing documentation records

This distinction is now reflected throughout:
• help page
• send flow
• exports
• client messaging
• UI wording

---

---

# STAGING INFRASTRUCTURE (NEW LOCKED OPERATIONAL FLOW)

IMPORTANT:
BuildProof now has a fully isolated staging/testing deployment separate from the protected live tester app.

Current environments:

Marketing Site:
https://buildproof-site.vercel.app

Protected Tester Production App:
https://buildproof-kappa.vercel.app

Isolated Staging App:
https://buildproof-staging.vercel.app

Current architecture purpose:

buildproof-site
→ marketing
→ pricing
→ Stripe
→ onboarding entry

buildproof-kappa
→ protected real-world tester environment
→ production-style field testing
→ should remain stable/frozen during active testing

buildproof-staging
→ isolated testing environment
→ bug reproduction
→ auth validation
→ offline validation
→ reconnect/send validation
→ safe staging verification before production rollout

IMPORTANT:
The staging environment solved the previous operational problem where production deployments had to be used for auth/session testing.

Staging now supports:
- Supabase magic-link auth
- dashboard access
- isolated deployments
- safe testing
- production protection

---

# CURRENT STAGING DEPLOY FLOW

IMPORTANT:
The local repo is now linked to the Vercel project:

buildproof-staging

Local Vercel link exists in:
.vercel/project.json

IMPORTANT:
The local repo is intentionally linked to:
buildproof-staging

Meaning:
vercel --prod deploys to staging by default unless manually relinked.

Current protected workflow:

1. Create staging branch
2. Make surgical code edit
3. Commit/push branch
4. Deploy to staging:
   vercel --prod
5. Test on:
   https://buildproof-staging.vercel.app
6. Validate E2E safely
7. Only after verification:
   intentionally deploy verified code to production app

IMPORTANT:
Production is NO LONGER the primary test environment.

---

# CURRENT SAFE PRODUCTION RELEASE FLOW

Current production release philosophy:

staging first
production second

Meaning:

buildproof-staging
→ rapid iteration/testing

buildproof-kappa
→ protected release target

Current intentional production deployment process:

1. Verify fix on staging
2. Intentionally relink/deploy to production project
3. Deploy verified build to:
   https://buildproof-kappa.vercel.app
4. Relink local repo back to staging afterward

IMPORTANT:
Production deployments should now be intentional/manual releases only.

---

# STAGING SAFETY RULES

Do NOT:
- casually relink local repo to production Vercel project
- test unstable fixes directly on production
- modify Supabase production auth settings aggressively
- bypass staging validation for risky offline/send/reconnect changes

Prefer:
- isolated staging validation
- one subsystem at a time
- surgical testing
- controlled rollout
- protected tester stability

---

# CURRENT VERIFIED STAGING STATUS

Verified PASS:
- isolated Vercel staging project created
- GitHub repo connected safely
- environment variables configured
- Supabase auth redirect validated
- magic-link login validated
- dashboard access validated
- production tester app preserved during setup

Current staging URL:
https://buildproof-staging.vercel.app

Future target domain:
staging.buildproof.app

---

🧱 HELP PAGE / USER EDUCATION

BuildProof now includes:

→ full in-app V1 Help Page

Includes:

• timeline explanation  
• drafts vs finalized explanation  
• live timeline vs snapshot explanation  
• approval system explanation  
• dispute package explanation  
• archive/restore explanation  
• project notes explanation  
• delivery/view tracking explanation  

This is now considered rollout-ready.

---

🧱 PRIVATE TESTER ROLLOUT

Current tester environment:

https://buildproof-kappa.vercel.app

Current rollout phase:

→ small trusted private tester group

Validated:

• cold-user onboarding pass  
• magic-link onboarding pass  
• independent account isolation pass  
• tester handout pass  
• onboarding clarity pass  

Current rollout strategy:

• observe usage patterns  
• avoid unnecessary deployments  
• preserve stable production conditions  
• collect grouped feedback before edits  

---

🔒 OFFICIAL VERIFIED SAFETY BRANCH

Current official frozen rollback checkpoint:

→ v1-private-field-test-safe

Purpose:

• preserve rollout-ready verified state  
• rollback protection during future experimentation  
• protect tester production environment  

Current staging infrastructure restore point:
→ safety-before-staging-infra

---

🚫 PROTECTED SYSTEMS

Do not touch casually unless there is a reproducible failure:

• reconnect orchestration  
• proof remap architecture  
• offline project sync/remap  
• send snapshot architecture  
• share/snapshot separation  
• PDF/export architecture  
• approval lifecycle statuses  
• attachment queue ownership  
• send queue ownership  
• service worker/app shell cache layer  

Approval lifecycle must remain:

draft → pending → approved / declined / expired

---

❌ FAILED EXPERIMENTS — DO NOT REPEAT

The following were tested, failed, and reverted.

Do not casually revisit:

• Safari-safe image normalization replacement  
• replay-time File reconstruction  
• timeout upload wrappers  
• reconnect-trigger balancing experiments  
• stale retry experiments  
• broad reconnect orchestration edits  
• upload lane experiments  

Root cause of prior instability was ultimately traced to:

→ persisting raw iPhone camera File/Blob objects directly into IndexedDB

Resolved architecture:

→ persist durable ArrayBuffer bytes immediately at queue time

Applied successfully to:

• offline entry attachments  
• offline approval attachments  

---

🧠 DEVELOPMENT RULES

• one subsystem at a time  
• restore point before core edits  
• revert failed experiments  
• no speculative architecture rewrites  
• no broad reconnect/send experiments  
• always validate with mobile E2E testing  
• preserve stable systems aggressively  
• use exact evidence before changing logic  
• do not assume behavior from memory  

---

📈 CURRENT SOFT-LAUNCH GOALS

During field test:

• observe real-world contractor usage  
• identify confusion points  
• identify naturally used features  
• identify trust pain points  
• group issues before changing architecture  
• avoid feature churn during observation phase  

---

🎯 NEXT MAJOR PHASES (POST FIELD TEST)

1. Staging Infrastructure — COMPLETE

BuildProof now has:

• isolated staging deployment
• isolated Vercel staging project
• isolated auth-safe testing environment
• separate production/test workflow
• protected tester production environment

Current staging URL:
https://buildproof-staging.vercel.app

Current protected production/tester URL:
https://buildproof-kappa.vercel.app

Current operational workflow:

• develop on branch
• deploy to staging
• validate E2E safely
• intentionally/manual deploy verified builds to production

This infrastructure milestone eliminated the previous requirement to test auth/session behavior directly on production deployments.

---

2. Domain + Website Preparation

Begin buildproof.app preparation:

Initial site goals:

• clean landing page  
• login portal  
• support/help access  
• screenshots  
• contractor-focused positioning  
• privacy policy  
• terms  
• pricing placeholder  
• contact/support  

This can progress safely during field testing without affecting production.

---

3. App Store Preparation

Begin:

• Apple Developer prep  
• Google Play prep  
• app icon refinement  
• screenshot preparation  
• App Store copywriting  
• onboarding screenshots  
• privacy policy preparation  

Important:

This preparation can happen WITHOUT touching stable production systems.

---

4. Branding + Positioning

Current strongest positioning direction:

→ “dispute-ready contractor documentation”

Future marketing emphasis:

• finalized documentation  
• client communication clarity  
• proof timeline  
• approvals  
• dispute exports  
• offline reliability  

---

📁 CURRENT IMPORTANT FILES

app/

dashboard/page.tsx
share/[token]/page.tsx
layout.tsx

app/api/

send/create-job/route.ts
send/process-job/route.ts
send/email/route.ts
approvals/create/route.ts
approvals/send/route.ts
approval-attachments/upload/route.ts
approval-attachments/insert/route.ts
attachments/upload/route.ts
attachments/insert/route.ts

components/

AttachmentUploader.tsx
AttachmentList.tsx
ProofAttachmentsWrapper.tsx
ApprovalComposer.tsx
ApprovalCard.tsx
SendUpdatePack.tsx
OfflineAttachmentBootstrap.tsx
OfflineSendBootstrap.tsx
OfflineAppShellBootstrap.tsx
OfflineReconnectBootstrap.tsx
OfflineSendIndicator.tsx
ProjectNotesModal.tsx

lib/

normalizeImageFile.ts
offlineAttachmentOutbox.ts
offlineAttachmentFlush.ts
offlineApprovalAttachmentOutbox.ts
offlineApprovalAttachmentFlush.ts
offlineApprovalSendOutbox.ts
offlineApprovalSendFlush.ts
offlineSendOutbox.ts
offlineSendFlush.ts
offlineProofOutbox.ts
offlineApprovalOutbox.ts
offlineApprovalFlush.ts
offlineDashboardCache.ts
reconnectFlow.ts
pdf/buildProjectPdf.ts

public/

sw.js
buildproof-logo.png
manifest.json

root/

BUILDPROOF_MASTER_HANDOFF.md
OFFLINE_PLAYBOOK.md
REGRESSION_LEDGER.md