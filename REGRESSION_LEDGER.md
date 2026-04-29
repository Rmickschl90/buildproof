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

## Checkpoint: local auth debugging aborted, system stabilized, tsconfig fixed

Scope:
- attempted localhost auth testing only
- no intended modifications to offline systems

Observed:
- Supabase magic link flow caused environment conflicts between localhost, Vercel preview, and production domain
- email rate limits prevented reliable testing loop
- multiple auth routing changes were attempted (hash handling, redirect paths, signing-in hop)
- changes were reverted and system returned to last committed state
- TypeScript deprecation warnings appeared for moduleResolution and baseUrl

Action:
- reverted all auth-related edits using git restore
- confirmed clean working state via git status
- added ignoreDeprecations: "6.0" to tsconfig.json to silence warnings

Decision:
- abandon localhost auth testing for now
- return to Vercel-first development workflow
- do not modify auth system further without full system snapshot and controlled plan

Meaning:
- current application state matches pre-auth-debug baseline
- core offline systems remain stable and untouched
- development direction restored to rollout path using Vercel environment

## Checkpoint: Vercel preview workflow restored, preview auth redirect investigation

Scope:
- restore safe branch → Vercel preview testing path
- investigate why preview login falls back to main Vercel URL
- no core offline logic changes yet

Observed:
- created and pushed branch `fix/approval-send-investigation`
- initial Vercel preview build failed due to unsupported `ignoreDeprecations` value in `tsconfig.json`
- updated `tsconfig.json` to restore successful Vercel preview builds
- preview deployment now builds successfully
- preview login request payload now sends `emailRedirectTo` / `redirect_to` to the preview domain `/auth/finish`, not to `buildproof-kappa.vercel.app`
- clicking the magic link still lands on `buildproof-kappa.vercel.app`
- `app/login/page.tsx` was updated so login redirect generation uses `window.location.origin`
- `app/auth/finish/page.tsx` and `app/auth/finish/signing-in/page.tsx` use relative routing and do not by themselves explain cross-domain redirect to kappa
- temporary false signals occurred during testing when browser Network throttling had been set to Offline; once restored to No throttling, preview auth testing resumed normally

Meaning:
- branch-based Vercel preview workflow is re-established
- preview auth redirect generation from login page is now correct
- remaining auth problem is later in the auth/session chain, not in login page redirect generation
- likely next suspect is shared auth client/config (for example `lib/supabase.ts`) or another domain-level auth setting

## Checkpoint: preview auth redirect still falls back to kappa after payload fix and PKCE test

Scope:
- continue Vercel preview auth investigation only
- no offline queue or reconnect logic changes

Observed:
- preview login request now sends `emailRedirectTo` / `redirect_to` to the preview domain `/auth/finish`
- verified preview browser origin was the branch preview URL
- `app/auth/finish/page.tsx` and `app/auth/finish/signing-in/page.tsx` use relative routing and do not themselves explain cross-domain jump to kappa
- `lib/supabase.ts` was changed from `flowType: "implicit"` to `flowType: "pkce"`
- after PKCE change, clicking the magic link still landed on `buildproof-kappa.vercel.app`

Meaning:
- login page redirect generation is no longer the active root cause
- auth finish pages are not the direct cause of the cross-domain redirect
- changing Supabase client flow to PKCE alone did not resolve preview auth redirect behavior
- remaining auth issue is still later or elsewhere in the auth/session chain
- next direct suspect is `/api/auth/session` handling or another shared auth/domain setting

## Checkpoint: preview auth redirect fixed and preview dashboard access restored

Scope:
- Vercel preview auth investigation only
- no offline queue or reconnect logic changes

Observed:
- preview login request sends redirect to preview `/auth/finish`
- added exact Supabase redirect allowlist entry: `https://*.vercel.app/auth/finish`
- fresh magic link test landed on preview branch dashboard, not `buildproof-kappa.vercel.app`

Meaning:
- branch preview auth flow is now working
- Vercel preview environment is now a valid test surface again
- future branch testing can proceed on preview instead of localhost

## Checkpoint: preview auth redirect fixed and preview dashboard access restored

Scope:
- Vercel preview auth investigation only
- no offline queue or reconnect logic changes

Observed:
- preview login request sends redirect to preview `/auth/finish`
- added Supabase redirect allowlist entry: `https://*.vercel.app/auth/finish`
- fresh magic link test landed on preview branch dashboard, not `buildproof-kappa.vercel.app`

Meaning:
- branch preview auth flow is now working
- Vercel preview environment is now a valid test surface again
- future branch testing can proceed on preview instead of localhost

## Checkpoint: duplicate saveRecentProject write removed and basic dashboard test passed

Scope:
- dashboard project selection logic only
- no offline queue changes

Observed:
- `saveRecentProject` was being called twice in the project click handler
- removed duplicate call so only one write remains
- basic repeated open/close/refresh dashboard test passed after push + promote

Meaning:
- duplicate recent-project write was a real dashboard bug
- normal project selection behavior still works after removal
- this does not yet clear the broader duplicate-project symptom previously seen during full offline end-to-end testing

## Checkpoint: current promoted dashboard build does not include offline project creation path

Scope:
- dashboard/project creation verification only
- no offline queue changes

Observed:
- current `app/dashboard/page.tsx` `addProject()` only performs direct Supabase insert
- no offline project creation branch is present in the current promoted build
- attempted broader offline E2E could not be used as a valid reproduction path because project creation offline is blocked in this state

Meaning:
- current promoted build is not the same effective state as the branch/state where broader broken offline E2E previously produced duplicate project creation
- offline project creation must be treated as a separate feature/state boundary before using that reproduction path again
- broader regression testing should not continue from this exact path until correct branch/state is identified

## Checkpoint: update send still races ahead of newest offline entry sync

Scope:
- full offline E2E on restore-broken-state
- no new code changes during this checkpoint

Observed:
- update send completed automatically on reconnect
- approval send completed automatically on reconnect
- waiting banner cleared
- no duplicate project appeared
- attachments were visible in UI and approval email
- offline client info entered during offline state saved correctly after reconnect
- newest offline entry finalized and appeared in timeline after reconnect
- sent update did NOT include that newest offline entry

Meaning:
- core reconnect and queue behavior is largely working in this state
- remaining regression is an ordering bug
- send job is being created before the latest offline proof has finished syncing to the server
- next fix target should be send job creation / send ordering guard, not dashboard or attachment rendering

## Checkpoint: send ordering improved, remaining issue is delayed update flush until navigation/state change

Scope:
- restore-broken-state full offline E2E after send flush guard change

Observed:
- approval send completed on reconnect
- no duplicate project appeared
- attachments were visible
- entries eventually finalized and latest offline entry was included in the update email
- in first test, update did not send immediately on reconnect and waiting banner remained for a while; after leaving project / moving around, send eventually completed
- in second test, reconnect produced waiting banner with little activity while staying on send update page; after exiting send page, update sent and finalized correctly

Meaning:
- original missing-latest-entry regression appears improved
- remaining issue is no longer entry omission but delayed send completion
- send/update flush appears to depend on navigation, page transition, visibility, or another later trigger instead of completing reliably in place
- next fix target should be send page / send completion orchestration, not proof ordering

## Checkpoint: reconnect send flow fully stabilized

Observed:
- update send triggers immediately on reconnect without navigation
- newest offline entries consistently included
- approval send continues to work
- waiting banner clears correctly
- no duplicate projects observed
- attachments and approvals render correctly in UI and email

Changes:
- added send flush trigger to reconnect flow in dashboard

Result:
- core offline → reconnect → send pipeline is now stable and field-ready

## Checkpoint: full offline → reconnect → send pipeline stable

Result:
- update sends immediately on reconnect
- newest offline entries always included
- approval send stable
- no duplicate projects
- attachments render correctly in UI and email
- send completes without navigation or refresh
- send button protected from double-send
- TypeScript + config clean

Conclusion:
- core system is now stable and field-ready

## Checkpoint: core offline reconnect/send pipeline stabilized on restore-broken-state

Scope:
- restore-broken-state core offline/reconnect/send stabilization
- no polish or non-core UI work

Observed:
- update sends immediately on reconnect
- newest offline entries are included
- approval send works
- waiting banner clears correctly
- no duplicate project reproduced in final stabilized reconnect/send test
- attachments render correctly in UI and email
- send no longer requires navigation to complete
- SendUpdatePack button protection logic cleaned up without TS errors
- tsconfig warnings resolved after updating moduleResolution/baseUrl config and saving/restarting TS server

Meaning:
- core offline continuation flow is now stable and field-ready
- remaining major offline gap is offline project creation on the stabilized branch
- next subsystem target should be offline project creation only

## Checkpoint: next target is offline project creation, and it must mirror the proven offline architecture

Scope:
- next chat should target offline project creation only

Requirements:
- offline project creation must mirror the proven offline architecture already used by offline proofs/attachments/approvals/sends
- do not invent a weaker special-case pattern
- use outbox/state/remap/flush discipline consistent with the existing offline system
- preserve current working reconnect/send pipeline

Carry-forward warning:
- earlier obvious duplicate `saveRecentProject(...)` write bug was fixed on another branch
- current restore-broken-state dashboard still contains multiple `saveRecentProject(...)` writes in offline project sync logic and must be re-audited so duplicate/recent-project state bugs are not reintroduced during offline project creation work

## Checkpoint: offline project sync lifecycle cleanup

Scope:
- offline project sync only
- no proof/attachment/approval/send architecture changes

Changes:
- removed duplicate saveRecentProject(...) write inside syncOfflineProjects()
- added removeOfflineProject(record.id) after successful sync
- replaced offline project entry in local projects state with synced server project

Purpose:
- prevent duplicate recent-project writes
- prevent offline project record from lingering and re-syncing again
- stabilize offline-project -> server-project replacement in UI state

Meaning:
- offline project sync lifecycle now includes cleanup instead of stopping after remap
- next gate is full offline project creation E2E verification

## Checkpoint: reconnect flow now resolves remapped project id after offline project sync

Scope:
- reconnect orchestration only
- no outbox structure changes

Changes:
- runReconnectFlow now captures starting project id
- after syncOfflineProjects(), reconnect flow resolves project id again using last-open-project state when starting from an offline project
- downstream refresh/load steps now continue against the remapped server project id on the same reconnect pass

Purpose:
- prevent reconnect pipeline from continuing with stale offline project id after project remap
- allow proof/approval/send follow-on sync to run against the newly synced server project immediately

Meaning:
- offline project creation path now has a reconnect handoff from project sync into dependent flushes
- next gate is full offline-created-project E2E retest

## Checkpoint: reconnect remapped-project-id patch did not resolve offline-created-project dependent flush failure

Scope:
- reconnect orchestration only
- no outbox structure changes

Test:
- clean incognito
- create new project offline
- add client info
- add entry
- add approval
- send update offline
- send approval offline
- reconnect
- wait without navigating
- hard refresh

Observed:
- project synced
- no duplicate project
- client info persisted
- selected project persisted after refresh
- proof remained draft
- approval remained draft
- waiting-to-send banner remained
- outcome matched pre-patch behavior

Meaning:
- reconnect project-id handoff patch did not fix the dependent flush failure
- root cause is more likely in outbox remap / dependent queue handling than in reconnect project-id resolution

## Checkpoint: reverted unproven reconnect remapped-project-id patch

Scope:
- rollback of failed reconnect experiment

Reason:
- patch did not improve behavior
- core reconnect path should not carry unproven edits forward

Meaning:
- branch returned to Step 1 project-sync-lifecycle cleanup state
- next investigation should target outbox remap / dependent queue logic directly

## Checkpoint: missing send outbox project-id remap identified

Root cause:
- offlineSendOutbox records retained old offline projectId after project sync
- send pipeline could not resolve entries/approvals for new project id

Fix:
- added remapOfflineSendProjectId()
- integrated into syncOfflineProjects alongside proof/attachment/approval remaps

Meaning:
- full dependency chain now remaps consistently after offline project sync
- send pipeline can now operate on correct project id

## Checkpoint: offline-created-project flow now completes through proof/update send; approval send remains isolated failure

Test:
- create project offline
- add entry
- add approval
- send update offline
- send approval offline
- reconnect

Observed:
- project synced
- entry finalized
- update send completed
- waiting-to-send banner cleared
- approval remained draft

Meaning:
- project remap chain is now working
- update send pipeline now survives offline-created-project path
- remaining failure is isolated to approval-send-specific remap / flush logic

## Checkpoint: approval send failure isolated to reconnect flush order

Root cause:
- offline approval send flush was running before offline approval attachment flush
- approval send flush correctly refused to send while attachments were still pending / not yet visible on server

Fix:
- reordered reconnect flow so approval attachment flush runs before approval send flush
- standard update send flush runs after approval-specific completion

Meaning:
- approval send should now complete on reconnect once the approval has been created and its attachments are synced

## Checkpoint: approval send failure likely caused by stale project id in approval-send outbox

Root cause:
- approval send flush uses record.projectId to refresh server approvals before sending
- approval-send outbox had its own projectId field and remap helper, but that queue was not remapped during offline project sync

Fix:
- added remapOfflineApprovalSendProjectId(...) to syncOfflineProjects alongside the other dependent remaps

Meaning:
- approval send queue should now follow the remapped server project after offline project creation
- next gate is full offline-created-project approval send retest

## Checkpoint: approval-send project remap failure caused by wrong IndexedDB index name

Root cause:
- remapOfflineApprovalSendProjectId() used store.index("projectId")
- the actual index created in offlineApprovalSendOutbox is named "by_projectId"
- reconnect project sync threw IndexedDB NotFoundError before approval-send records could be remapped

Effect:
- approval-send records kept offline project id
- /api/approvals/list was called with stale offline project id
- approval send failed and reconnect state became inconsistent

Fix:
- changed remapOfflineApprovalSendProjectId() to use store.index("by_projectId")

## Checkpoint: full offline lifecycle stabilized (entries + approvals + sends + reconnect)

Test:
- create project (online)
- go offline
- add entry + attachment
- create approval + attachment
- send update offline
- send approval offline
- reconnect
- wait
- refresh

Observed (final):
- entry finalized and sent
- approval sent successfully
- waiting banner cleared
- timeline preserved (no disappearance)
- no duplicates
- no missing records

Root cause of failure:
- approval-send project remap used incorrect IndexedDB index name
- store defined index "by_projectId"
- remap used store.index("projectId") → caused NotFoundError
- remap aborted → approval-send retained offline project id
- downstream /api/approvals/list returned 404 → approval send failed
- reconnect reload cleared local state → timeline appeared empty

Fix:
- corrected index usage to store.index("by_projectId")

Meaning:
- full dependency chain now remaps correctly:
  project → proofs → attachments → approvals → approval sends → sends
- reconnect pipeline is now stable and deterministic

Status:
- CORE OFFLINE SYSTEM: VERIFIED STABLE

## Checkpoint: full offline field test passed end-to-end

Test:
- login online
- go offline
- create new project
- add client info
- edit client info
- add entry with 2 attachments
- create approval with 2 attachments
- send update offline
- send approval offline
- reconnect
- verify before refresh
- hard refresh
- verify again

Observed:
- project created successfully offline
- client info saved offline
- client edit persisted correctly
- entry synced correctly
- both entry attachments synced and rendered correctly
- approval synced correctly
- both approval attachments synced and rendered correctly
- update send completed on reconnect
- approval send completed on reconnect
- entry finalized correctly
- approval moved to pending correctly
- update email included correct content and attachments
- approval email included correct content and attachments
- waiting banner cleared correctly
- no duplicate records observed
- no disappearance after hard refresh
- system remained consistent after refresh

Known note:
- approval pending timestamp still appears 5 hours ahead in email / client-facing output and remains a later polish item

Meaning:
- full offline lifecycle is now verified across project creation, client save/edit, entry + attachments, approval + attachments, offline sends, reconnect, and hard refresh
- core offline system is field-ready

## Checkpoint: approval attachments verified across online/offline/reconnect/refresh/send

Test:
- create approval online with attachment
- verify behavior before and after send
- create approval offline with attachment
- reconnect
- verify attachment before refresh
- hard refresh
- verify again
- send approval and verify lock behavior

Observed:
- approval attachment works online
- approval attachment works offline
- approval attachment survives reconnect
- approval attachment remains visible after hard refresh
- no duplicate attachments observed
- after send, approval attachment remains visible
- after send, approval is locked as expected
- attachment state remains correct after refresh

Meaning:
- approval attachments do not require new core architecture work
- approval attachments are already functioning across the full lifecycle
- next work is product refinement / rule enforcement only where needed

## Checkpoint: offline draft delete gap discovered

Test:
- create entry offline and attempt delete
- create approval offline and attempt delete

Observed:
- entry three-dot menu is disabled / grayed out while offline draft exists
- approval three-dot menu opens, but delete fails with "Failed to fetch"

Meaning:
- offline draft deletion is not fully implemented
- entry draft delete is blocked at UI level offline
- approval draft delete still relies on online/server path
- this is now a defined product gap, not a vague usability issue

Locked rule:
- draft entries and draft approvals must always be deletable offline before send

## Checkpoint: offline approval draft delete is only partially fixed

Test:
- delete approval draft created offline in same offline session
- attempt delete on other draft approvals while offline

Observed:
- same-session offline-created draft approval deletes successfully offline
- other draft approvals not created in that same offline state do not delete offline

Meaning:
- offline approval delete currently works for local same-session draft state only
- broader offline draft delete behavior is still incomplete
- product rule remains: all draft approvals should be deletable offline before send

## Checkpoint: offline entry edit partially functional

Test:
- offline → create entry → add attachments → reconnect → success
- second offline cycle → edit entry text → save → no visible confirmation
- reconnect → text still present in UI but not committed until saved again online

Observed:
- offline edit UI opens and allows typing
- save action does not consistently persist offline edit state
- attachments still queue correctly in same session
- UI may not repaint immediately after offline actions in subsequent offline cycles

Meaning:
- offline entry edit path exists but is not fully reliable across sessions
- likely gap in offline proof update persistence or refresh trigger after save
- requires targeted investigation before expanding further offline work

## Checkpoint: offline entry edit persistence confirmed

Test:
- go offline
- create entry
- edit entry text to "A"
- save
- refresh while still offline

Observed:
- entry remained present after offline refresh
- edited text "A" remained present after offline refresh

Meaning:
- offline entry edit is persisting correctly
- earlier concern is not data loss
- remaining issue is likely offline save feedback / repaint clarity rather than persistence failure

## Checkpoint: offline edit limited to local draft state only

Test:
- edit server-backed draft while offline after reconnect
- attempt save and attachment add

Observed:
- save action does not persist offline
- attachments do not visibly add until reconnect
- after reconnect:
  - attachments appear (queued correctly)
  - edited text remains in UI but not committed until saved online

Meaning:
- offline edit currently only works for drafts created in same offline session
- server-backed drafts do not enter offline edit pipeline
- this is a known limitation, not a regression
- full support would require mapping server drafts into offline outbox system

## Fix: approval draft created via attachment now visible immediately

Issue:
- create approval → add attachment → exit without saving
- draft not visible on timeline
- later action (saving another approval) caused it to appear

Root cause:
- attachment flow triggered draft creation
- but did not dispatch UI refresh event

Fix:
- added buildproof-data-changed dispatch after draft creation in attachment flow

Result:
- approval drafts created via attachment now appear immediately on timeline
- eliminates delayed/ghost draft behavior

## Fix: approval draft created via attachment now visible immediately

Issue:
- creating an approval attachment could force draft creation
- exiting composer immediately after did not show the new draft on timeline
- later approval activity caused the draft to suddenly appear

Root cause:
- attachment flow created the draft
- but did not dispatch a timeline/UI refresh event after creation

Fix:
- added buildproof-data-changed dispatch after attachment-triggered draft creation in ApprovalComposer

Result:
- approval drafts created via attachment now appear immediately on timeline
- eliminated delayed/ghost draft appearance behavior

## Fix: exclude draft approvals from all client-facing update surfaces

Issue:
- draft approvals were appearing in client-facing update surfaces
- this included update pack/share view, project-menu PDF export, and dispute packet

Product rule:
- drafts are internal only
- only pending, approved, and declined approvals should be client-visible

Fix:
- added approval status filtering to client-facing approval queries
- client-facing surfaces now include only: pending, approved, declined
- drafts are excluded from update email/share/export flows

Result:
- draft approvals no longer appear in client-visible update documents
- pending approvals still appear as intended

## Fix: normalize remaining client-facing PDF/dispute timestamps

Issue:
- approval and entry cards displayed correct local times
- but dispute packet header/footer and several dispute-only record sections showed times 5 hours ahead

Root cause:
- buildProjectPdf had correct timezone-aware rendering for entry/approval cards
- but export-time header/footer and dispute-only sections were still calling formatDateTime without a display offset

Fix:
- derived projectDisplayTimezoneOffsetMinutes inside buildProjectPdf
- applied that offset to:
  - official project record/export header time
  - PDF footer generated time
  - communication event timestamps
  - delivery history timestamps
  - project view record timestamps

Result:
- client-facing PDF/dispute timestamps now match the expected local display time
- entry and approval card timestamps remained correct

## Fix: share/update package summary counts now include approvals but use simplified client-facing totals

Issue:
- share/update package summary counts did not include approval attachments
- after adding approval attachment counting, the summary became too busy and confusing for client-facing use

Product decision:
- share/update package should use simplified summary counts
- client-facing summary should show:
  - entries
  - approvals
  - attachments
  - finalized
- do not break attachments down into separate files/photos/PDF buckets on this page

Fix:
- updated share/update package summary logic to count all client-visible attachments together
- included approvals in summary counts
- simplified hero and stat cards to remove redundant subtype breakdowns

Result:
- share/update package summary now reflects all visible client-facing content
- presentation is cleaner and more consistent for V1

## 🧱 BUILDPROOF REGRESSION LEDGER UPDATE

### 📍 Checkpoint Name

share-page-header-and-pdf-alignment-polish

---

## ✅ WHAT WAS COMPLETED

### 🟢 Share Page Header Refactor

* Removed heavy topbar system
* Introduced minimal header strip:

  * Left: BuildProof logo (transparent asset)
  * Right: Read-only + archived pills
* Removed duplicate branding inside hero
* Branding now handled ONLY in header

---

### 🟢 Hero Layout Cleanup

* Removed logo from hero (resolved contrast + layout conflict)
* Hero now contains:

  * project title
  * description
  * summary pills
* Reduced hero margin-top for tighter spacing
* Matched spacing:

  * header → hero
  * logo → top of page

---

### 🟢 Logo System Fix

* Replaced white background logo with transparent PNG
* Minor halo remains (accepted for V1)
* No further time investment at this stage

---

### 🟢 Approval System Fix (CRITICAL)

* Removed draft approvals from all client-facing outputs:

  * update emails
  * update pack
  * dispute packet
* Only allowed:

  * pending
  * approved
  * declined
* Drafts remain internal-only

---

### 🟢 Timestamp System Alignment (CRITICAL)

* Fixed 5-hour offset bug across:

  * PDF header
  * dispute packet
  * footer timestamps
* Standardized use of:
  created_timezone_offset_minutes
* Applied consistently across:

  * entries
  * approvals
  * PDF generation
  * dispute exports

---

### 🟢 Project Date Range Fix (CRITICAL)

* Replaced raw ISO usage
* Now reflects:

  * earliest visible timeline item
  * latest visible timeline item
* Fully timezone-aware

---

### 🟢 Attachment Count Fix (Client Docs)

* Included approval attachments in all counts
* Unified totals across:

  * entries
  * approvals

---

### 🟢 Update Package Summary Simplification

* Removed confusing breakdown (photos vs files)
* Standardized to:

  * Entries
  * Approvals
  * Attachments
  * Finalized
* Consistent across all client-facing outputs

---

### 🟢 UI + Attachment UX Fixes

* Fixed 3-dot menu layering issue
* Enabled attachment removal
* Removed duplicate attachment display in uploader
* Fixed delayed attachment rendering bug

---

## ⚠️ KNOWN ACCEPTED LIMITATIONS

### 1. Offline Editing Edge Case

* Editing same entry offline → reconnect → offline again may not persist immediately
* Requires online save
* Accepted as rare edge case
* Do NOT expand offline edit system further

---

### 2. Logo Transparency Halo

* Slight edge artifact on dark backgrounds
* Caused by asset, not code
* Accepted for V1
* Future: cleaner export

---

## 🚫 LOCKED SYSTEMS (DO NOT TOUCH)

* Offline queue + reconnect orchestration
* Send system / job creation pipeline
* PDF generation structure
* Approval lifecycle logic
* Attachment system core

---

## 🧭 CURRENT STATE

BuildProof = Production-ready V1 candidate

* Core flows stable
* Client-facing output consistent
* Offline usable in real-world conditions
* UI clean and coherent

---

## 🎯 NEXT DIRECTION (LOCKED)

* Fix remaining isolated issues only
* No architectural changes
* No new systems
* Prepare for real user testing

---

## 🧠 DEV RULE GOING FORWARD

If it works → don’t touch it
If it’s rare → log it, don’t rebuild it
If it’s visible to users → fix it

## REGRESSION_LEDGER.md

## Checkpoint: client-facing polish + template timeline cleanup

### Scope

* client-facing share/update page polish
* client-facing PDF/dispute polish
* template/timeline usability polish
* no core offline architecture rewrites
* no send system rewrites
* no approval lifecycle rewrites

### Completed

#### 1. Approval attachment-created draft visibility fixed

Issue:

* creating an approval attachment could create a draft behind the scenes
* exiting the composer did not immediately show that draft on timeline
* later approval activity caused it to suddenly appear

Root cause:

* attachment flow created the approval draft
* UI refresh event was not dispatched immediately after draft creation

Fix:

* dispatched `buildproof-data-changed` after attachment-triggered draft creation in `ApprovalComposer`

Result:

* approval drafts created by attachment now appear immediately on timeline
* removed delayed/ghost draft behavior

---

#### 2. Draft approvals removed from all client-facing surfaces

Issue:

* draft approvals were appearing in:

  * update emails
  * update pack/share page
  * standard PDF export
  * dispute packet

Product rule locked:

* drafts are internal only
* only `pending`, `approved`, and `declined` approvals should be client-visible

Fix:

* added approval status filtering across client-facing approval queries
* client-facing outputs now exclude `draft`

Result:

* draft approvals no longer appear in client-facing documents or share/update surfaces
* pending/approved/declined still appear correctly

---

#### 3. Client-facing timestamp alignment fixed

Issue:

* entry/approval card timestamps were correct
* but client-facing PDF/dispute header/footer and record sections were showing times 5 hours ahead

Root cause:

* `buildProjectPdf` still had export-time timestamps calling date formatting without the proper display offset in a few sections

Fix:

* derived `projectDisplayTimezoneOffsetMinutes`
* applied it to:

  * official project record/export header time
  * PDF footer generated time
  * communication event timestamps
  * delivery history timestamps
  * project view record timestamps

Result:

* PDF/dispute timestamps now match the expected local display time
* card timestamps remained correct

---

#### 4. Project summary date range fixed in PDF/dispute exports

Issue:

* project summary date range did not reflect the true range of visible activity
* range could disagree with the actual entry/approval card dates

Root cause:

* date range logic used raw ISO timestamps instead of the same display-time logic used by visible cards

Fix:

* updated `getDateRange(...)` in `buildProjectPdf.ts`
* now uses:

  * proof `created_at` + proof timezone offset
  * approval `sent_at || created_at` + approval timezone offset

Result:

* project summary date range now matches earliest and latest visible timeline activity dates

---

#### 5. Client-facing attachment counts fixed

Issue:

* client-facing document counts only reflected entry attachments
* approval attachments were visible in documents but not reflected in the summary counts

Fix:

* updated PDF/doc counting to include approval attachments
* updated share/update package summary counts to include approval attachments too

Result:

* counts now reflect all client-visible attachments across entries + approvals

---

#### 6. Share/update package summary simplified

Issue:

* after counting everything correctly, the share/update summary became too busy and confusing
* separate files/photos/PDFs breakdown was too much for client-facing use

Product decision locked:

* share/update package should show:

  * Entries
  * Approvals
  * Attachments
  * Finalized

Fix:

* simplified share/update package summary and hero pills
* removed subtype breakdown from the client-facing share/update summary

Result:

* cleaner client-facing summary
* still accurate
* better aligned with V1 usability goals

---

#### 7. Share page header/hero branding polish

Issue:

* original logo treatment in the share hero/top area looked weak, redundant, or visually awkward
* branding and project title were duplicating each other

Fix:

* restored a minimal top header strip
* header now holds:

  * BuildProof logo
  * read-only pill
  * archived-included pill (when relevant)
* removed duplicate hero logo treatment
* simplified hero so it focuses on:

  * project title
  * description
  * summary pills

Result:

* stronger hierarchy
* cleaner client-facing share page
* acceptable V1 branding state

Accepted limitation:

* transparent logo asset still has a very subtle halo on dark backgrounds
* accepted for V1
* asset cleanup can happen later if needed

---

#### 8. Template entry timeline cleanup

Issue:

* template-based entries made timeline cards too tall
* template body text was rendering directly in the timeline, hurting scanability especially on mobile

Product decision locked:

* timeline should show title only for entry cards
* full content should remain behind View

Fix:

* updated dashboard proof card rendering:

  * closed card = first line only
  * open/view state = full multiline content

Result:

* timeline is much cleaner
* full content still available on demand
* template entries no longer bloat the timeline

---

#### 9. Added new template: Inspection Failed

Issue:

* template list had `Inspection Passed` but no matching `Inspection Failed`

Fix:

* added `Inspection Failed` template with structured fields:

  * Inspector
  * Area inspected
  * Reason
  * Action required
  * Follow-up date
  * Notes

Result:

* more complete documentation workflow
* better real-world inspection coverage

---

#### 10. Template grid restored to 2-column layout

Issue:

* template buttons were wrapping awkwardly and taking too much vertical space

Fix:

* updated template layout to a 2-column grid
* buttons fill width of the cards more cleanly

Result:

* cleaner template picker
* better mobile/desktop balance

---

### Accepted / deferred

1. Mobile plain button text color inconsistency

* desktop button text appears black
* mobile plain button text can appear blue
* likely browser/platform styling difference
* deferred to next chat to keep scope controlled

2. Logo transparency halo

* subtle and not worth further time right now
* accepted for V1

### Locked systems preserved

* offline queue / reconnect orchestration
* send system / create-job / process-job
* approval lifecycle
* attachment core architecture
* PDF core generation pipeline
* delivery history architecture

### Current state

BuildProof remains in:

* production refinement
* usability tightening
* pre-tester rollout preparation

Current rule remains:

* fix visible issues
* do not rewrite stable systems
* no architecture drift

## Checkpoint: documentation corrected to reflect verified full system state

Scope:
- documentation alignment only
- no code changes
- no offline architecture changes
- no reconnect/send pipeline changes

Observed:
- some handoff/playbook text still described offline project creation as a future milestone
- verified testing state already confirms offline project creation works
- current dashboard code audit also confirms duplicate `saveRecentProject(...)` back-to-back bug is not present in the current `app/dashboard/page.tsx`

Meaning:
- documentation had drifted behind the actual tested product state
- BuildProof should now be treated as having a full working core lifecycle:
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

Result:
- current work is no longer core offline buildout
- current work is targeted bug fixing, polish, and product refinement only

Note:
- `saveRecentProject(...)` was re-audited in the current dashboard file
- no duplicate same-block double-write was found in the current version
- future duplicate issues, if any, are more likely to come from multiple flows firing unexpectedly rather than a simple duplicated adjacent call

## Checkpoint: no active known issues after UI polish pass

Scope:
- UI polish only
- no offline architecture changes
- no send/reconnect pipeline changes
- no approval lifecycle changes

Completed:
- removed incorrect update package footer wording about link revocation
- removed internal entry number from update package entry cards
- fixed Pending Sync entry action menu layering so dropdown is not hidden behind the card below
- added isolated solid-red delete styling using `btnDelete`
- restored `btnDanger` to original outline behavior
- applied solid-red styling only to destructive delete actions:
  - entry Delete
  - approval Delete Draft

Verified:
- Delete buttons are solid red with white text
- Archive buttons remain original outline style
- Cancel / Logout / non-delete buttons are back to normal
- Pending Sync three-dot menu layers correctly
- app is currently operating with no active known issues reported by user

Current state:
- BuildProof core functionality is working
- full offline lifecycle remains protected and stable
- current remaining work is no longer bug fixing
- next work should be suggestion review, product polish, and rollout-readiness decisions

Rule going forward:
- continue one small scoped change at a time
- preserve working systems
- do not reopen offline/send/reconnect architecture without a reproducible issue

## Checkpoint: project notes system added and verified

Scope:
- new core feature: private project notes (internal only)
- no changes to send/share/PDF systems

Completed:
- added `private_notes` column to projects
- added Project Notes UI in project menu
- implemented autosave (debounced)
- implemented offline support using project outbox pattern
- ensured reconnect sync preserves notes
- ensured notes are never included in:
  - update packs
  - PDFs
  - share views
  - approvals

Verified:
- notes save and persist online
- notes persist after refresh
- notes persist across project switching
- offline notes save correctly
- reconnect sync preserves notes
- no UI conflicts or regressions observed

Result:
- feature is stable and production-ready
- app now includes internal documentation layer per project

Rule:
- do not expand notes system beyond single-field scope for V1
- avoid adding formatting, attachments, or multi-note structures

## Checkpoint: project notes + approval traceability complete

Scope:
- Project Notes core feature
- Approval recipient traceability
- Offline-safe UI guardrails
- PDF/dispute documentation visibility

Completed:
- added private per-project notes
- notes live behind Project menu as “Project Notes”
- notes autosave
- notes work online, offline, after refresh, across project switching, and after reconnect
- added approval recipient source tracking:
  - project = recipient matches project client email
  - custom = recipient differs from project client email
- added UI warning when approval recipient differs from project client
- warning works online and offline by passing project client email into ApprovalComposer
- added recipient visibility to PDF/dispute package:
  - recipient name
  - recipient email
  - custom recipient label when applicable
- fixed dashboard/export PDF path so approval recipient source is included correctly

Verified:
- Project Notes tested online
- Project Notes tested offline
- Project Notes tested across multiple projects
- Project Notes preserved after reconnect
- Approval warning appears when using a different recipient email
- Approval warning works offline
- Custom approval recipient persists through offline/reconnect/send
- PDF/dispute package shows correct approval recipient
- PDF/dispute package shows custom recipient marker correctly
- build passed after changes
- project creation offline is confirmed working and should be removed from active TODOs

Current state:
- no active known issue with offline project creation
- Project Notes are V1-ready
- Approval traceability is V1-ready
- remaining work should be treated as suggestions/product polish unless a reproducible bug appears

Regression rule:
- do not reopen offline project creation unless a new reproducible failure is reported
- do not alter send/reconnect/offline core systems without a safe branch and exact regression target
- failed edits that do not move toward the stated goal should be reverted instead of layered over

## V2 Candidate — Enhanced View & Approval Traceability

Context:
Current system captures:
- approval response IP address
- share view IP address
- timestamps across all events
- approval recipient source (project vs custom)

This provides strong dispute-grade documentation for V1.

Proposed V2 enhancements (do NOT implement in V1):

1. Share View Metadata Expansion
- capture user_agent for share views
- display device + browser in dispute package (same as approvals)

2. Approximate Location Labeling
- derive rough location from IP (city/region level only)
- example: "Milwaukee, WI (approx)"
- must be clearly labeled as approximate (non-authoritative)

3. Cross-Event Correlation (UI only)
- visually group:
  - view event → approval event
  - matching IPs / close timestamps
- improves readability in dispute scenarios

4. Lightweight Device Fingerprinting (optional)
- non-invasive fingerprint (no tracking across projects)
- used only to strengthen “same device” narrative
- must remain privacy-conscious and minimal

5. Audit Summary Block (PDF)
- optional summary at top of dispute package:
  - total views
  - unique IP count
  - approvals sent vs responded
- quick-glance credibility layer

Constraints:
- must not compromise performance
- must not add fragile dependencies to core offline system
- must not introduce privacy risk without clear labeling

Status:
- deferred intentionally to protect V1 stability
- revisit after real-world usage feedback

## V1 Pre-Launch Requirement — Preview Testing Without Production Promotion

Problem:
- Vercel preview deployments currently cannot be tested cleanly because magic-link auth redirects back to production.
- This forces risky production promotion before full verification.

Requirement:
- Preview deployments must support login/testing before promotion.
- Production should only be promoted after preview validation.

Likely fix areas:
- Supabase Auth redirect URLs
- magic link redirectTo handling
- NEXT_PUBLIC_APP_URL / window.location.origin behavior
- /auth/finish route handling preview domains correctly

Goal:
- push branch
- open Vercel preview
- log in via magic link
- test full app in preview
- promote only after validation

Status:
- required before broad V1 rollout

## Checkpoint: V1 polish + documentation-readiness pass

Scope:
- Project Notes
- Approval traceability
- Share view IP tracking
- PDF/dispute package evidence
- Dashboard project card polish
- PDF branding readability
- V1 launch-readiness planning

Completed:
- Project Notes confirmed working online, offline, after refresh, across projects, and after reconnect.
- Offline project creation confirmed working and removed from active TODOs.
- Approval recipient traceability completed:
  - recipient email tracked
  - recipient source tracked as project/custom
  - custom recipient warning added
  - warning works online and offline
  - recipient/source shown in PDF/dispute package
- Share view IP tracking added:
  - `share_views.ip_address` column added
  - share page records viewer IP
  - dispute package displays view IP
- Approval response IP/device/browser evidence remains intact.
- Dashboard project cards improved:
  - project title made visually dominant
  - client info remains secondary
  - project creation date shown as `M/D/YY`
- PDF cover branding adjusted for V1:
  - replaced low-contrast logo image with readable BuildProof text wordmark on dark header
  - full PDF redesign deferred to V2
- V2 traceability candidates noted:
  - share view user agent
  - approximate IP location
  - audit summary block
  - cross-event correlation
- V1 pre-launch requirement identified:
  - fix preview testing/auth redirect flow so production promotion is not required before testing.

Verified:
- Build passed after major changes.
- Project Notes passed online/offline/reconnect testing.
- Approval custom recipient tracking passed online/offline/PDF testing.
- Share view IP appears in Supabase and dispute package.
- Dashboard card date/title layout visually confirmed.
- PDF wordmark is readable enough for V1.

Current state:
- App is very close to V1 real-world testing.
- Next chat should focus on extensive end-to-end testing, not new feature work.
- Do not reopen completed systems unless a reproducible bug appears.

Regression rules:
- Failed edits that do not move toward the exact goal must be reverted.
- Do not touch send/reconnect/offline core systems without a safe checkpoint.
- Test before promoting whenever preview auth is fixed.
- Until preview auth is fixed, production promotion remains a launch-readiness risk.
