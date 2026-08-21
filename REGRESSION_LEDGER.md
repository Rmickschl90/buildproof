# BuildProof Regression Ledger

This file is append-only.

Do not delete old entries.
Do not rewrite history.
Add new checkpoints as they happen.

---

---

# STAGING INFRASTRUCTURE ESTABLISHED — 2026-05-22

## Objective

Create a fully isolated staging/testing environment for the main BuildProof app without disrupting the protected tester production deployment.

Goal:
eliminate the previous workflow where production deployments were required for auth/session testing.

---

## Protected Production Environment

Current protected tester app:

https://buildproof-kappa.vercel.app

This environment remained operational during the entire staging setup process.

Verified after staging setup:
- dashboard access still works
- existing session integrity preserved
- project entry creation still operational
- no production auth disruption observed

---

## New Isolated Staging Environment

Created new isolated Vercel project:

buildproof-staging

Current staging URL:

https://buildproof-staging.vercel.app

Purpose:
- auth validation
- offline validation
- reconnect/send validation
- safe bug reproduction
- isolated deployment testing
- staging-first E2E verification

---

## Infrastructure Changes Completed

Completed successfully:

- installed Vercel CLI locally
- authenticated local Vercel CLI
- created isolated staging Vercel project
- connected GitHub repo safely
- linked local repo to staging project
- configured isolated environment variables
- configured staging app URLs
- validated Supabase auth redirects
- validated magic-link login
- validated dashboard access
- verified production tester environment remained stable

---

## Important Vercel Operational Rule

The local repo is now linked to:

buildproof-staging

through:

.vercel/project.json

Meaning:

vercel --prod

now deploys to staging by default unless manually relinked.

Safe expected deploy output:

buildproof-staging.vercel.app

If deploy output ever references:

buildproof-kappa

STOP immediately and verify Vercel linking before continuing.

---

## Current Safe Workflow (LOCKED)

Current workflow:

1. create staging work branch
2. make surgical code edit
3. commit/push branch
4. deploy to staging:
   vercel --prod
5. validate E2E safely
6. only after PASS:
   intentionally deploy verified code to production

Production is no longer the primary testing environment.

---

## New Safety Branch

Created and pushed:

safety-before-staging-infra

Purpose:
preserve pre-staging rollback checkpoint before infrastructure changes.

---

## Supabase Auth Notes

Production Site URL intentionally preserved as:

https://buildproof-kappa.vercel.app

Added explicit staging redirect:

https://buildproof-staging.vercel.app/auth/finish

Important:
production auth configuration was NOT aggressively modified.

---

## Result

BuildProof now has:

- protected production/tester lane
- isolated staging/testing lane
- safe auth testing
- safe reconnect/send validation path
- reduced production deployment risk
- safer rollout workflow going forward

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

## Checkpoint: V1 testing protocol locked

Scope:
- documentation/process only
- no code changes
- no offline architecture changes
- no send/reconnect changes

Rule added:
- do not assume behavior before changing logic
- verify exact user-observed behavior first
- if unsure, ask before modifying

Bug report format required before fixes:
- Step being performed
- Expected result
- Actual result
- Online or offline?
- After refresh or not?
- Screenshot if possible

Meaning:
- V1 testing must proceed through reproducible failures only
- no speculative fixes
- no broad rewrites
- working systems remain protected

## Checkpoint: approval attachment not visible until save draft

Scope:
- approval composer UI / draft visibility only
- no offline queue changes
- no send/reconnect changes

Test:
- create approval
- add attachment
- exit without saving
- reopen draft

Observed:
- attachment is not visible in draft
- attachment appears only after:
  - adding another attachment OR
  - clicking Save Draft
- hard refresh does NOT make attachment appear

Meaning:
- attachment is being stored but not surfaced in draft state
- likely missing linkage or refresh in draft approval load path

## Checkpoint: approval attachment visibility fixed without save draft

Scope:
- approval composer attachment flow only
- no offline system changes
- no send/reconnect changes

Issue:
- attachments added to draft approval were not visible unless:
  - Save Draft was clicked
  - another attachment was added

Root cause:
- dashboard was not notified after attachment insert
- approval list reload did not include newly attached files

Fix:
- dispatch buildproof-data-changed after attachment upload completes

Result:
- attachments appear immediately after upload
- no need to save draft
- no delayed/ghost attachment behavior

## Checkpoint: duplicate update email received during online send test

Scope:
- online send update flow
- email delivery / send job behavior
- no approval send tested yet

Test:
- online project update send
- update email content looked correct

Observed:
- duplicate update emails were received
- expected only one update email
- this is the first duplicate email observed after extensive prior update-send testing

Meaning:
- possible duplicate send trigger, duplicate process-job call, duplicate delivery, or double job creation
- must investigate before continuing approval send test
- do not modify offline/reconnect systems unless directly proven involved

## Checkpoint: client-facing no-draft rule locked

Scope:
- product rule
- PDF/export behavior
- share/timeline behavior
- dispute package behavior

Rule:
- drafts are only visible in the authenticated dashboard timeline
- client-facing outputs must never include draft entries or draft approvals

Allowed outside dashboard:
- finalized entries
- approvals with status pending, approved, declined

Reason:
- prevents accidental draft exposure
- keeps client records clean
- protects dispute documentation integrity
- simplifies testing and future development

Status:
- timeline update snapshot fixed
- standard PDF/export and dispute package draft filtering verified working

## V2 Polish: PDF layout refinement

Approval and entry attachment images render correctly, but some image/caption spacing can be improved later:
- keep approval attachment captions below images
- improve card height calculation for large image groups
- tighten photo grid spacing
- prevent minor visual overflow near card bottoms

Not a V1 blocker because attachments are present, readable, and tied to the correct records.

## ✅ Snapshot Integrity + Share Behavior + PDF Consistency (FINALIZED)

### 🎯 Goal
Eliminate all draft leakage and ensure consistent behavior across:
- dashboard
- share link
- send snapshot
- PDF / dispute exports

---

### 🔧 What Changed

#### 1. Snapshot Approval Fix (CRITICAL)
- Snapshot approval filtering changed from:
  - ❌ created_at
  - ✅ sent_at
- Prevents approvals that existed as drafts at send time from appearing later after being sent

#### 2. Snapshot Integrity Enforcement
- Snapshot now strictly respects:
  - entries → locked_entry_ids
  - approvals → sent_at <= processed_at
- Eliminates retroactive data appearing in snapshots

#### 3. Share Link Behavior Locked
- Manual share link is now:
  - ✅ LIVE (updates with project)
  - ✅ finalized entries only (locked_at)
  - ❌ no drafts

#### 4. Client-Facing Consistency Rule
- All client-facing surfaces now follow:

  Dashboard:
  - drafts visible (internal only)

  Share link:
  - live finalized view

  Send link:
  - frozen snapshot

  PDF / dispute:
  - frozen snapshot

#### 5. PDF Fixes
- Approval attachments:
  - fixed overflow issues inside card
- Entry attachments:
  - improved spacing to prevent visual overflow
- Removed all draft entries from:
  - PDF
  - dispute exports

#### 6. UI Clarity Improvement
- Added helper text near share link buttons:

  "This link updates as the project progresses. Sent updates provide a fixed record."

- Clarifies difference between:
  - live share
  - snapshot send

---

### 🧪 Verified Behavior

- No drafts appear in any client-facing surface ✅
- Snapshot does NOT update after send (entries + approvals) ✅
- Share link updates correctly with project changes ✅
- No retroactive approvals appear in snapshots ✅
- PDF / dispute match snapshot behavior ✅

---

### ⚠️ Edge Case (Accepted)

- Snapshot cutoff is based on `processed_at`, not button click moment
- Very small timing window exists during send processing
- Determined safe for real-world usage

---

### 📌 Notes

- Snapshot logic MUST always use client-visible timestamps:
  - entries → locked_at
  - approvals → sent_at

- NEVER use:
  - created_at for snapshot filtering

- Core system now considered:
  → PRODUCTION-STABLE FOR V1

  ## Checkpoint: mobile combined offline flow fixed

Scope:
- mobile Safari / iPhone full combined offline flow
- offline project creation
- entry + attachment
- approval + attachment
- offline update send
- offline approval send
- reconnect without navigation

Root cause:
- duplicate reconnect attachment flush in `app/dashboard/page.tsx`
- `flushOfflineProofs()` already remapped and flushed entry attachments after proof creation
- reconnect flow then called `flushOfflineAttachmentOutbox()` a second time
- mobile timing exposed a race where attachment records could be skipped or missed during the combined flow

Fix:
- removed the duplicate reconnect-level `flushOfflineAttachmentOutbox()` call
- kept attachment flushing owned by `flushOfflineProofs()` after proof remap
- preserved `getAccessToken` because approval/update flushes still require it

Related app-shell/cache fix:
- prevented service worker from caching auth/signing-in pages as `/dashboard`
- added service-worker control reload guard
- mobile Safari required clearing website data once to remove poisoned old cache

Verified:
- full mobile combined flow passed with Send Approval first, then Send Update
- full mobile combined flow passed with Send Update first, then Send Approval
- approval moved to pending
- approval attachment visible in UI and email
- entry finalized
- entry attachment visible in UI and email
- waiting banner cleared
- no navigation or manual resend required

Status:
- FIXED
- core mobile combined offline flow restored

## ❌ FAILED EDIT — DO NOT REPEAT

Change:
Triggered runReconnectFlow() from buildproof-attachment-complete event in dashboard.

Files:
- app/dashboard/page.tsx

Result:
- Entry disappeared from UI after reconnect
- Approval remained in draft state
- Approval attachments disappeared
- Update banner remained stuck
- System entered inconsistent state

Root Cause:
Violates single-orchestrator rule — introduces competing reconnect/send flows while attachment + proof sync still in progress.

Status:
❌ REVERTED (commit 0c68182a)

Rule:
Do NOT trigger reconnect/send flow directly from attachment-complete events.
All send orchestration must remain within the single reconnect flow owner.

FAILED EDIT — DO NOT REPEAT:
- Balance offline recovery flush across entry and approval queues
- Retry stale syncing offline proofs

Result:
- Mixed 7+7 stress still failed
- Entry/update remained draft
- Banner stuck waiting
- Did not solve entry attachment upload/finalize issue

Status:
- Reverted by 200e2fc7 and a3f2fb27

## 2026-05-06 — Mixed Mobile Offline Stress Investigation

### Stable Known-Good Baseline
Commit:
`1c3ef6cc`
Add stale upload retry + claim guard to entry attachments

### Confirmed Working Isolated Tests
- Entry-only offline reconnect with 7 attachments succeeded
- Approval-only offline reconnect/send path can succeed
- Entry reopen/edit attachment path works in isolation
- Approval send pipeline can complete under mixed reconnect load

### Confirmed Mixed Failure Pattern
Mixed 7+7 mobile reconnect stress test consistently fails on ENTRY side while approval side may still complete.

Observed behavior:
- Approval eventually reaches pending
- Approval attachments may send successfully
- Entry remains draft
- Banner remains:
  "Waiting for attachments to finish uploading"
- No update email sent
- Entry attachments disappear from UI after reconnect during failed state

### Supabase Investigation Findings
Proof rows ARE created successfully during failed runs.

Observed:
- proofs.created_at populated
- proofs.locked_at remains NULL

Examples:
- proof 429 → NULL locked_at
- proof 428 → NULL locked_at
- proof 427 → successful attachment upload run

Attachment table investigation:
- Failed proof runs (429/428/etc.) have ZERO uploaded entry attachments
- Successful proof runs (427/423/etc.) contain uploaded attachments

Conclusion:
Failure is NOT proof creation.
Failure is NOT purely UI rendering.
Failure is specifically in entry attachment upload/remap/flush pipeline during mixed reconnect pressure.

### Failed Experiments (Reverted)
Reverted:
- Balance offline recovery flush across entry and approval queues
- Retry stale syncing offline proofs

Result:
- Did not solve mixed reconnect failure
- Introduced unstable behavior risk
- Reverted back to safe baseline

## Checkpoint: mobile camera attachment failure isolated

Scope:
- mobile mixed offline reconnect investigation
- entry attachments + approval attachments + offline send
- no core reconnect/send/remap architecture rewrite

Observed:
- Library-only mobile mixed 7+7 stress test passed.
- Camera-included mobile mixed test failed.
- Failure reproduced on WiFi when 2 of 7 entry photos were taken live with camera.
- Result: approval stayed draft, entry disappeared from UI before refresh, nothing sent, waiting banner remained.

Diagnostic finding:
- Entry attachment remap worked.
- Attachment records had server proofId.
- Several entry attachments uploaded successfully.
- Failure occurred during `/api/attachments/upload` prepare request.
- The failed prepare response returned HTML/non-JSON after about 60 seconds.
- Example error: `Unexpected token '<', "<html>..." is not valid JSON`.

Meaning:
- This does NOT currently point to proof remap failure.
- This does NOT currently point to send job architecture failure.
- Send gate behaved correctly by refusing to send incomplete update.
- Current likely target is mobile camera image normalization/compression before queue insertion.

Changes kept:
- Kept safe hardening patch that handles non-JSON upload prepare responses more defensively.

Changes reverted:
- Temporary entry attachment diagnostics logging.
- Temporary in-app diagnostics viewer.

Next target:
- Inspect and implement a focused mobile image normalization pipeline before entry attachment queue insertion.
- Do not reopen core reconnect/remap/send architecture unless new evidence proves it is failing.

## Checkpoint: successful library-only diagnostic compared against failed camera diagnostic

Scope:
- mobile attachment diagnostics comparison
- entry attachment upload pipeline
- no code changes in this checkpoint

Successful library-only diagnostic:
- Full mobile mixed test with photo-library-only entry attachments passed.
- Entry proof remap worked.
- All 7 entry attachment records had server `proofId`.
- All 7 `/api/attachments/upload` prepare requests returned signed upload data.
- All 7 storage uploads succeeded.
- All 7 metadata inserts succeeded.
- All 7 outbox records were removed.
- Flush finished successfully.
- Full 7-file flush completed in about 23 seconds.

Failed camera-included diagnostic comparison:
- Camera-included mobile mixed test failed.
- Entry attachment records also had server `proofId`, proving remap worked.
- Several attachments uploaded successfully before failure.
- Failure happened during `/api/attachments/upload` prepare.
- Failed prepare response returned HTML/non-JSON after about 60 seconds.
- The failing attachment never reached `SIGNED_UPLOAD_READY`.
- The failing attachment never reached storage upload.
- Send gate correctly blocked the update because attachments remained unfinished.

Conclusion:
- The strongest evidence now points to camera-originated mobile image handling, not core offline architecture.
- Library photos can pass the same queue/remap/send path.
- Camera-originated files likely need normalization/compression before queue insertion.
- Do not reopen reconnect/remap/send architecture unless new evidence appears.

## Checkpoint: mobile offline camera replay investigation narrowed to normalization/replay layer

Scope:
- mobile offline reconnect testing
- camera-originated entry attachments only
- no reconnect/send architecture rewrites

Stable restore point:
- safe-point-before-server-image-upload-lane

Confirmed successful:
- library-selected offline attachments
- approval attachment reconnect behavior
- single normalized camera-originated offline image
- proof sync during reconnect
- send gate correctly blocking incomplete sends

Confirmed failing:
- multiple camera-originated offline images during reconnect replay

Observed failed behavior:
- proof rows insert successfully
- attachment rows missing server-side
- proof remains draft
- waiting banner persists
- queued upload count may incorrectly show 0
- update email not sent

Important meaning:
- send gate behavior is correct
- failure is now believed to exist in:
  - mobile Safari/PWA blob replay
  - OR current normalization engine reliability/state consistency

NOT currently believed to be:
- reconnect orchestration failure
- proof remap failure
- approval architecture failure
- generic send lifecycle failure

Experiments reverted:
- timeout upload wrappers
- server upload lane experiment
- reconnect-trigger recovery experiments
- attachment-complete reconnect triggers
- broad reconnect balancing/recovery logic

Current next direction:
Replace current createImageBitmap(...) normalization path with Safari-safe normalization pipeline:

File
→ URL.createObjectURL(...)
→ <img>
→ canvas.drawImage(...)
→ canvas.toBlob("image/jpeg")
→ offline queue storage

Reason:
- broader web evidence suggests the older img/canvas path is more durable for:
  - iPhone camera files
  - Safari/PWA offline replay
  - IndexedDB blob persistence

Development rule:
Do not reopen reconnect/send/remap architecture unless new evidence directly proves failure there.

## MOBILE CAMERA REPLAY INVESTIGATION — BREAKTHROUGH SESSION

Branch:
safe-point-before-server-image-upload-lane

FINAL PASSING STATE COMMITS:
- d4e39f65 Store attachment bytes instead of raw file objects
- 3bb559ab Extend offline send retry polling window
- 52d0003c Store approval attachment bytes instead of raw file objects
- 4c7cf86d Harden approval send against duplicate emails

FAILED/REVERTED EXPERIMENTS:
- b2eb9f12 Replace image normalization with Safari-safe canvas path
- 99a2b6b5 Revert "Replace image normalization with Safari-safe canvas path"
- db55d22c Rebuild attachment file before replay upload
- 4a08cb0e Revert "Rebuild attachment file before replay upload"

BREAKTHROUGH FINDING:
The core mobile reconnect issue was raw camera-originated File persistence instability inside IndexedDB queues.

Persisting ArrayBuffer bytes at queue time stabilized:
- entry reconnect replay
- approval reconnect replay
- multi-camera reconnect flows

PASSING TESTS:
PASS:
- offline new project creation
- offline entry creation
- offline approval creation
- multiple camera-originated entry attachments
- multiple camera-originated approval attachments
- offline send update
- offline send approval
- reconnect replay
- entry finalization
- approval transition to pending
- attachment rendering
- update email delivery
- approval email delivery

IMPORTANT OBSERVED MOBILE BEHAVIOR:
iOS PWA reconnect execution may appear stalled until foreground interaction/wake activity occurs.

Observed repeatedly:
- reconnect idle
- user scrolls/interacts
- reconnect processing resumes

Current assessment:
execution wake/throttling issue
NOT offline replay corruption.

APPROVAL HARDENING:
Approval send duplicate-email race condition fixed through conditional atomic draft-claim behavior before email send.
No new lifecycle statuses introduced.

## 2026-05-11 — Full E2E verification + timestamp integrity stabilization

### Verified fallback branch
- Created and pushed:
  - `v1-e2e-verified-safe`

This branch is now the primary verified recovery point after full mobile + desktop E2E validation.

---

### Major verified systems

#### Mobile online
PASS
- Project creation
- Client save
- Entry create/edit
- Approval create/edit
- Mixed attachment uploads
- Update send
- Approval send
- Snapshot/share rendering
- Email rendering

#### Mobile offline
PASS
- Offline project workflow
- Offline entries
- Offline approvals
- Camera capture attachments
- Mixed attachment replay
- Offline update send queue
- Offline approval send queue
- Automatic reconnect replay
- No duplicate sends
- No missing attachments
- Correct finalized/pending states
- Correct email rendering

Stress test passed:
- offline project
- entry + 5 mixed attachments
- approval + 5 mixed attachments
- edit entry + additional attachments
- edit approval + additional attachments
- queue update send
- queue approval send
- reconnect replay

Result:
- full successful automatic replay
- no duplicates
- no missing attachments
- no stuck queues

---

#### Desktop online
PASS
- Core project workflows
- Sends
- Approvals
- Attachments
- Share/snapshot rendering

#### Desktop offline
PASS with one remaining issue:
- Offline project rename currently throws:
  - `Failed to fetch`

All other desktop offline replay systems passed.

---

### Timestamp integrity work completed

#### Share header timestamp fix
Problem:
- Share header "Last updated" used mixed timestamp semantics including `responded_at`
- Visible approval cards used `sent_at`
- This caused client-facing timestamp mismatches

Fix:
- Header now aligns with visible timeline event semantics
- Removed `responded_at` from share header latest-event calculation
- Header now uses:
  - proof `created_at`
  - approval `sent_at || created_at`

Commit:
- `8afe033e` — Align share header timestamps with timeline events

---

#### Offline approval timezone replay fix
Problem:
- Offline approval replay path dropped timezone metadata
- Result:
  - some approvals rendered 5 hours off
  - `created_timezone_id` and offset stored as null

Root cause:
- `offlineApprovalFlush.ts` did not forward:
  - `createdTimezoneId`
  - `createdTimezoneOffsetMinutes`

Fix:
- replay payload now forwards timezone metadata correctly

Verified:
- new offline approvals now persist:
  - `created_timezone_id`
  - `created_timezone_offset_minutes`

Commit:
- `abf7d19f` — Include timezone fields in offline approval flush

Important architectural conclusion:
- BuildProof correctly preserves jobsite-local event time
- Viewer-localized timestamps are NOT used
- DST-safe architecture confirmed

---

### Mobile attachment UI polish
Fixed mobile offline filename overflow for non-image attachments (PDFs etc).

Commit:
- `c1588cd1` — Fix mobile offline attachment filename overflow

---

### Diagnostics cleanup
Removed temporary investigation panels:
- ApprovalDiagnosticsPanel
- AttachmentDiagnosticsPanel
- SendDiagnosticsPanel

Preserved reconnect orchestration logs for rollout safety.

Commit:
- `24b99a36` — Remove temporary diagnostics panels

---

### Current known remaining issue
Only confirmed remaining E2E issue:

#### Desktop offline project rename
Symptoms:
- offline rename attempt returns:
  - `Failed to fetch`

Status:
- isolated for next chat
- no other replay systems currently failing

---

### Current trusted rollback branches

#### Primary verified recovery point
- `v1-e2e-verified-safe`

#### Earlier mobile replay stabilization point
- `v1-mobile-replay-stable`

FINAL V1 FIELD TEST STABILIZATION PASS — VERIFIED

ONLINE FLOW — PASS
• project creation
• client info
• notes
• entries
• attachments
• approvals
• update sends
• approval sends
• share links
• PDFs/dispute export
• archive/restore

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

SECURITY HARDENING — PASS
• RLS enabled and validated:
  - approval_tokens
  - approval_requests
  - approval_responses
  - send_jobs
  - message_deliveries
  - share_views
  - project_contact_events
• proofs_active secured with security_invoker=true
• second-account isolation validated
• fresh-user onboarding validated

MEDIA SUPPORT DECISION — V1
• verified support:
  - photos/images
  - PDFs
  - document/file attachments
• video uploads intentionally disabled for V1 field rollout
• entry and approval uploaders aligned to supported media only
• online video behavior observed functional
• offline/replay-safe video support deferred for future rollout cycle

VIDEO SUPPORT — FUTURE ROADMAP
Future rollout target:
• offline-safe video replay
• reconnect-safe video remapping
• mobile-friendly playback handling
• share/email video handling validation
• dispute export/PDF video behavior decisions
• large file handling validation

KNOWN V1 STATUS
• No known critical rollout blockers remaining.
• Production enters controlled private field-test phase.
• Production deployments should remain frozen except emergency fixes.
• Next infrastructure priority AFTER field testing:
  - stable preview/staging deployment
  - separated development auth flow
  - non-production testing workflow

  # PWA INSTALL AUTH FINDING

Installed iPhone home-screen app opens correctly, but Supabase magic-link login completes in Safari and does not transfer authenticated session back into the installed PWA context.

Result:
- Safari/browser login works
- installed app remains on login page
- PWA install experience is not yet app-store-ready

This is the first App Store prep blocker to investigate.

---

# TEAM ACCOUNTS V1 — STALE STAGING STRIPE PRICE FIXED + FULL LIVE PRODUCTION VALIDATION — 2026-07-23

## Objective
Close out Team Accounts V1: fix a known staging-only Stripe pricing gap, then run the complete Team Accounts lifecycle for real against production with a genuine live-mode Stripe charge, as the final verification step before considering the build done.

---

## Finding: stale/duplicate Stripe test price on leeward-staging-internal

`STRIPE_PRICE_ID` (individual plan) and `STRIPE_TEAM_PRICE_ID` on `leeward-staging-internal` were confirmed to point at the literal same Stripe test-mode price object (`price_1TuKRq2WIlxElWw0768YFf2K`, "Leeward Team (Test)" $10/month) — not just visually similar, the same price ID. This meant staging's individual-plan checkout displayed Team branding/pricing to testers.

Confirmed this was staging-only: production's live-mode individual ($29/month) and team ($69/month) prices were already distinct Stripe objects. No customer ever saw this — staging is not customer-facing.

### Fix
Created a genuinely separate "Leeward Individual (Test)" product/price (`price_1TwR0H2WIlxElWw0LPMFySsh`, $29/month) in Stripe test mode. Updated `STRIPE_PRICE_ID` on the `leeward-staging-internal` Vercel project and redeployed. Confirmed via Vercel env var detail view (not the truncated list view) that the new value landed correctly.

Left the Team test price's $10 test-mode amount unchanged, per explicit user decision — never customer-visible, not worth the churn.

---

## Full Live Production Validation

With Phase 8 (Production Rollout) and the Members/Invite/Upgrade/Dissolve UI already deployed to `app.getleeward.com`, ran the entire Team Accounts V1 lifecycle for real — real production, real live-mode Stripe charge, not staging, not API-simulated:

1. **Real Team signup**: a brand-new account signed up through the redesigned signup flow, chose Team, named the org, completed a genuine live Stripe Checkout with a real card (real $69/month subscription, real trial). Confirmed directly in production Supabase: `organizations`, `organization_members` (owner row), and `organization_subscriptions` all created correctly; subscription's Stripe metadata correctly carries `organization_id`.
2. **Real invite/accept**: invited a second brand-new account via the dashboard Members panel (real invite email, real magic link). Verified the wrong-account-mismatch detection and "Log Out and Continue" recovery path on `/invite/[token]` (triggered organically this session via a shared-origin `localStorage` session collision between two open tabs). New member appeared in the roster and could see the org's shared project through the real dashboard UI.
3. **Real Dissolve**: ran "Cancel Team & Return to Solo" as the owner. Verified three independent ways: app UI correctly bounced the owner to `/subscribe`; direct Supabase query confirmed the org's project was reassigned (`organization_id: null`, `user_id` = owner), the invited member's row shows `removed_at` set, and the owner's own `organization_members`/`organizations` rows were left untouched; Stripe's live dashboard confirmed the real subscription shows Canceled, $0.00 paid. Owner completed a real Individual-plan checkout afterward, confirming the same project remained accessible under solo ownership.

## Also confirmed (verification only, no new fix needed)
`app/auth/finish/page.tsx`'s previously-flagged broken redirect (`/auth/signing-in` → nonexistent route) is already fixed in the codebase and live in production — current code calls `router.replace("/auth/finish/signing-in")`, and the fix (commit `d149c47`) is part of `team-accounts-phase-1`'s own history on GitHub, not sitting unmerged.

## Android/iOS release impact
None. The Android wrapper is a thin Capacitor WebView shell loading `https://app.getleeward.com` directly at runtime with no bundled web UI; this entire body of work touched zero native code, so the existing production deploy is immediately live for Android users with no rebuild or Play Store resubmission required.

---

## Result
Team Accounts V1 (all 8 phases, plus the Signup Flow Redesign and Members/Invite/Upgrade/Dissolve UI) is now considered COMPLETE and production-verified, not just staging-verified. This is a genuine recovery/reference point: if any Team Accounts regression is suspected later, this entry marks the last point at which the full lifecycle was confirmed working end-to-end in production.

No production data was put at risk by this session's work — the staging price fix touched only `leeward-staging-internal`'s test-mode Stripe config, and the production test used a real but disposable account/org, cleaned up via the app's own Dissolve feature rather than manual data deletion.

---

# LOCAL `.env.local` WIPED BY `vercel link` + `vercel env pull` — RECONSTRUCTED FROM BACKUPS — 2026-07-26

## Objective
Deploy the `estimate-nav-phase-1` branch (Phase 1 of the Estimate/Change Order/Invoice + UI Nav Overhaul initiative) to `leeward-staging-internal` for verification. Linking the repo to that Vercel project via `vercel link` was step one.

## What went wrong
`vercel link` prompted to pull environment variables, then to overwrite the existing `.env.local`. Confirmed yes to both without checking the file's current contents or taking a backup first — an assistant-directed mistake, not a user error. `vercel env pull` only pulls one environment's vars (defaulted to "development") and does not merge — it silently *removed* any key from the file not defined in that environment, even though those keys had real, correct, working local values. Removed: `INTERNAL_APP_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_FROM`, `RESEND_API_KEY` (silently changed to a different key, not just removed), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, and all three Stripe vars. No backup existed anywhere outside three old, undated-in-name-only local backup files that happened to still be sitting in the repo folder (`.env.local.backup-20260622-165431`, `.env.local.backup-before-restore-prod-url`, `.env.local.backup-subscription-local-test`) — reconstruction relied on those existing at all, which was luck, not process.

Two further, compounding issues surfaced while fixing this:

1. **Local dev's actual Supabase target was tribal knowledge, undocumented anywhere.** Local `.env.local` was supposed to point at **production** Supabase (`uzuzwhzilhakewtbtzxh.supabase.co`) — Ryan's real account and subscription data live there, and local dev has always run against it, including a **live-mode** Stripe secret key. Nothing in `CLAUDE.md` said this before now, so there was no way to catch "wait, this got switched to a different Supabase project" quickly — it presented as "why do I suddenly need to pick a plan again," which cost real time to trace back to its actual cause (local dev now pointed at the staging Supabase project instead, a completely separate empty database for this account).
2. **A login redirect regression (separately caused by the header-merge work earlier in this session) turned out to have nothing to do with any env var.** After fixing `NEXT_PUBLIC_APP_URL` locally, magic-link login still redirected to `leeward-staging-internal.vercel.app` instead of `localhost:3000`, even after full dev-server restarts, killing lingering node processes, and confirming no OS-level env override existed. Root cause: Supabase Auth silently ignores a requested `emailRedirectTo` that isn't on that Supabase project's own Authentication → URL Configuration → Redirect URLs allowlist, falling back to the project's Site URL instead of erroring. `http://localhost:3000/**` was missing from `leeward-staging-internal`'s allowlist. This is a Supabase project setting, invisible from the codebase or `.env.local` entirely, and cost significant back-and-forth to isolate since every other more-obvious cause (stale build, stale process, OS env var) had to be ruled out first.

A third, unrelated stale-cache issue (the merged single-header UI and the new content/status filter chips appearing to have vanished, reverting to the old duplicate-header layout) turned out to be the same service-worker app-shell caching behavior already seen twice earlier in this session (see Phase 1 completion notes in the Estimate/Invoice implementation plan doc) — resolved via DevTools → Application → Clear site data, not a code regression.

## Fix
- Reconstructed `.env.local` from the most recent backup file (`.env.local.backup-before-restore-prod-url`), restoring production Supabase (URL + anon + service role keys), the correct `RESEND_API_KEY`, and live-mode Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`). Kept `NEXT_PUBLIC_APP_URL`/`INTERNAL_APP_URL` on `http://localhost:3000` (a genuinely correct change, unrelated to the data-loss issue) rather than reverting those too.
- `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` were already blank in every backup — confirmed SMS was never actually configured for local dev, so nothing was lost there beyond the phone number, which was restored.
- `STRIPE_TEAM_PRICE_ID` could not be restored — it postdates the backup files (Team Accounts didn't exist yet when they were made) and its live-mode value isn't recorded anywhere in this repo's docs. Flagged as missing rather than guessed; only matters if a Team-plan checkout is tested from local dev.
- Added `http://localhost:3000/**` to `leeward-staging-internal`'s Supabase Redirect URLs allowlist. Production's Supabase project's allowlist has not been separately confirmed to already include it — check if local dev is ever pointed at production and hits the same symptom.
- Documented all of this in `CLAUDE.md` under a new "Local Dev Environment — known-good config" note, including the actual required Supabase target, the live-Stripe-key risk, the Redirect URLs gotcha, and the service-worker stale-cache gotcha, specifically so this doesn't have to be re-diagnosed from scratch again.

## Prevention going forward
Before running any command that can rewrite `.env.local` (`vercel link` → pull, `vercel env pull` directly, any "overwrite existing file" prompt): back up the file first (`Copy-Item .env.local .env.local.backup-<date>`) and diff the result before trusting it. Never confirm an overwrite prompt without checking current file contents first.

## Result
`.env.local` restored to its known-good, production-pointed state (with the two deliberate, correct localhost URL changes kept). No actual data was lost anywhere — Supabase/Stripe/Twilio/Resend credentials all still exist at their respective sources and were either recovered from backup files or (Twilio) confirmed to have never held real values locally. This was entirely wasted local-dev-environment time, not a data-integrity or production-safety incident — no production system, database, or deploy was touched at any point during this session.

---

# DUPLICATE-SEND COOLDOWN GUARD ADDED — 2026-07-27

## Objective
Close a real gap surfaced while troubleshooting an unrelated attachment-upload bug earlier this session: Ryan repeatedly retried "Send Update" against a project whose send pipeline *looked* stuck (a separate, already-fixed bug), and once the real underlying blocker cleared, several genuinely independent send jobs went out — 4 separate sends recorded in `send_jobs`/delivery history for one update.

## Root cause
`app/api/send/create-job/route.ts`'s existing duplicate-guard (`existingJob` query) only checked for a prior job still in an *active* status (`pending`/`processing`/`retrying`). Once a job reached a terminal state — `sent` **or** `failed` — the guard stopped applying entirely. Each retry landed after the prior job had already gone terminal, so nothing caught it. This was a real gap, not a misuse of the feature: a confused user retrying a button that appears to do nothing is an expected real-world scenario, not an edge case.

## Fix
Replaced the active-only `existingJob` lookup with a `mostRecentJob` lookup (no status filter, most recent by `created_at`) plus a cooldown window:
- If the most recent job is still active → same behavior as before (reused, no new job).
- If the most recent job is terminal (`sent` or `failed`) and finished within the last `SEND_COOLDOWN_MS` (3 minutes, measured from `processed_at` falling back to `created_at`) → also reused, returns `cooldown: true` and a clear message ("This project update was already sent a moment ago..." / "...just finished. Please wait a moment...") instead of creating a new job.
- Otherwise → proceeds to create a genuinely new job, unchanged.

Server-side only change — traced `lib/offlineSendFlush.ts` and confirmed the client already generically re-checks whatever `jobId` `create-job` returns and reacts to its real status, so no client-side change was needed for the fix to take effect.

## Verification (staging, `leeward-staging-internal`, real browser session, real Stripe-free send)
1. Called `/api/send/create-job` for a real project → created a genuinely new job, worked through an unrelated stuck-"processing" sub-issue (job needed the existing 3-minute staleness window in `process-job` to be re-claimable — not a new bug, matches documented `PROCESSING_STALE_MS` behavior), and confirmed it reached `status: "sent"` (one real test email sent to Ryan's own inbox, per his explicit go-ahead for exactly one test send).
2. Immediately called `/api/send/create-job` again with identical params → response was `{ reused: true, existing: true, cooldown: true, jobId: <same id as step 1>, status: "sent", message: "This project update was already sent a moment ago..." }`. No new job row was created and no second email was sent.

## Result
Duplicate-send protection now covers the full job lifecycle, not just the active-job window. Only one real email was sent during this entire verification — the cooldown guard correctly blocked the follow-up attempt.

---

# "PROJECT" → "RECORD" RENAME COMPLETE — 2026-07-27

## Objective
Copy-only rename of the app's primary noun from "Project" to "Record" (plus "Baseline Estimate" → "Original Estimate" and the earlier same-session "Change Order" → "Additional Charge" follow-through), so the product reads naturally for landlords/property managers as well as contractors. Full rationale: Current Implement/Project to Record Rename - Full Inventory and Plan.md in the Brain vault.

## Scope
Rendered display strings only — no DB columns, stored enum values, function/prop names, internal state values, or component/file names changed. 13 files: `app/dashboard/page.tsx`, `OnboardingWizard.tsx`, `NewProjectModal.tsx`, `SendUpdatePack.tsx`, `ApprovalComposer.tsx`, `app/share/[token]/page.tsx`, `app/archived/page.tsx`, `app/archived/entries/page.tsx`, `BulkCaptionUploader.tsx`, `app/api/send/email/route.ts`, `lib/pdf/buildProjectPdf.ts`, `ApprovalCard.tsx`, `app/api/approvals/create/route.ts`, `app/api/approvals/update/route.ts`. `app/help/page.tsx` and the marketing site explicitly deferred (already-planned separate review).

## Verification
`npm run build` passed. Then behaviorally verified live on `leeward-staging-internal` (real browser session against a real deployed build, not just source grep):
- Dashboard record list: "Records" heading, "+ New Record" button, "Search records or clients..." placeholder.
- Onboarding wizard: "Open your first record" / "Open First Record" step.
- A record's mini-header: "RECORD" eyebrow, Actions menu (Notes / Rename / Download PDF / Export dispute package / Archive), rename mode's "Record name" label.
- Estimate tab: subtitle ("Original estimate and additional charges for this record..."), "Original Estimate" badge, "Additional Charge" type label on a real approval.
- Invoice share page (`?invoice=1`): "This is an Invoice..." banner says "record photos", subtitle says "original estimate and additional charges for this record", "Shared by contractor • Original estimate and additional charges only." caption, "Original Estimate" badge.
- Regular share/journal page: "VERIFIED JOURNAL" badge, "A clean, read-only timeline of updates, notes, photos, and attached files." subtitle.
- Archived Records page: heading, "Restore a record..." subtitle, "Showing 0 of 0 archived records" / "No archived records." empty state.

## Result
Full rename verified live end-to-end on staging. Not yet promoted to production — this branch (`estimate-nav-phase-1`) is still mid-flight on other Estimate/Invoice/Dark-Mode work per this repo's staging-first rollout constraint for that whole initiative.

---

# RECORD RENAME — CLIENT-FACING PDF/EMAIL VERIFICATION + FOLLOW-ON FIXES — 2026-07-27

## Objective
Close out the remaining unverified surfaces from the Project→Record rename above (the actual client-facing dispute PDF and Send Update email, not yet behaviorally checked at that point) and address two real gaps Ryan caught while reviewing the live result.

## Verification
Pulled a real dispute-package PDF directly off `leeward-staging-internal` (intercepted `URL.createObjectURL`, parsed the actual bytes with `pdf.js`, not a source grep) and confirmed all 4 pages render the renamed strings correctly: "Official Record," "Record Summary," "remain unchanged in the record," "Leeward Journal," "Timeline," "Original Estimate" badge, "Type: Additional Charge," "Client Communication Record," "Delivery History," "View Record." Then triggered a real "Send Update" on staging — draft entries flipped Draft → Finalized (confirms a genuine send, not a cooldown-guard reuse) — and Ryan confirmed via his own inbox that the subject reads "Update: {title}", not the old "Project Update: {title}".

## Follow-on fixes found during this review
1. **"Shared by contractor" persona leak.** `app/share/[token]/page.tsx`'s summary caption hardcoded "Shared by contractor •..." on both the regular journal and `?invoice=1` share views. Missed by the original rename pass since the literal word wasn't "Project" — but it's the same root problem, assuming a contractor persona on a page meant to work for landlords/property managers too. Fixed by dropping "Shared by contractor" entirely (Ryan's explicit call, rather than inventing a new universal noun).
2. **Ambiguous status-dot legend.** Ryan flagged that the Pending/Approved/Declined dot legend next to the "Records" heading didn't say what it measured. Checked `app/api/projects/bid-statuses/route.ts` and confirmed it's scoped to `is_baseline = true` only (the record's original estimate, never an Additional Charge). Added an explicit "ORIGINAL ESTIMATE" eyebrow label — no "Status" suffix (redundant given the Pending/Approved/Declined values), "Original" kept explicit per Ryan's reasoning that a contractor could otherwise assume the dot reflects any submitted change, not just the baseline bid.
3. **Records heading + mobile layout.** Restyled the "Records" list heading to 20px/800/`var(--text)` (matching the app's `.h1` scale) since it was visually indistinguishable from the small legend text next to it. Then, after Ryan reported cramped/unpredictable mobile wrapping (the shared `.row` class's `justify-content: space-between` was fighting the heading and legend for horizontal space, wrapping across 3 lines), restructured to an explicit `flexDirection: column` stack so the heading and legend always render as two predictable blocks regardless of screen width.

## Result
Committed and pushed to `estimate-nav-phase-1` (`f2c6bade`, 16 files changed). Full Project→Record rename, including client-facing PDF/email, is now genuinely verified end-to-end — not just the in-app dashboard/share pages checked in the prior entry. NOT YET deployed to production.

# DOCUMENTS TAB BUILT + VERIFIED ON STAGING — 2026-07-28

## Objective
Design and build a record-level Documents tab (Timeline / Estimate / **Documents**) in one session, per Ryan's explicit request to implement rather than just plan it out. Core design question resolved through discussion first: how a Documents-tab file gets included in an Export Dispute Package PDF, given today's export is a frictionless one-click confirm. Resolved as a persistent per-document "Include in dispute packet" toggle, decided once at upload/edit time rather than via a checklist at export time — keeps the existing one-click export unchanged for everyone who doesn't use Documents, defaults off (opt-in) since these files may hold sensitive info.

## Built
Migration `20260728120000_project_documents.sql` (new `project_documents` table, RLS enabled with no `authenticated` policies — same server-route-only idiom as `project_payments`); six routes under `app/api/documents/*` (`upload`, `insert`, `list`, `update`, `delete`, `open`), all `canUserAccessProject()`-gated, mirroring the existing `attachments/*` signed-upload-URL flow; the Documents tab UI in `app/dashboard/page.tsx`; and `appendReferenceDocuments()` in `lib/pdf/buildProjectPdf.ts` (dispute-mode only) — a per-document cover page plus copied PDF pages or a full embedded image page, reusing `appendPdfExhibits()`/`loadEmbeddedImage()`'s existing machinery under a distinctly-labeled "REFERENCE DOCUMENTS" heading (vs. the always-included "SUPPORTING DOCUMENTS" exhibits) so the two are never confused. Deliberate scope-down, flagged not hidden: no offline outbox for Documents in this pass — uploads require live connectivity.

## Verification
Migration applied to `leeward-staging-internal` only (deliberately staging-first this time, unlike Estimate Phase 2/Payments — no local-dev-blocking reason here), confirmed via a combined query (`column_count: 10`, `grant_count: 28`, `pg_class_count: 1`). Deployed to staging and verified via real browser automation, not code review: uploaded a real file; toggled "Include in dispute packet" on and confirmed it survives a full page reload (server-side persistence, not local state); pulled a real dispute-package PDF, extracted actual text via `pdf.js`, and confirmed the "REFERENCE DOCUMENTS" / "REFERENCE DOCUMENT A" cover page renders correctly with the following page containing a genuine embedded image XObject (no extractable text — not a placeholder); toggled the same document off and re-exported — confirmed the section and image both vanish (8 pages → 6, blob size dropped accordingly); confirmed the regular (non-dispute) Download PDF never mentions or includes the document at all regardless of toggle state, proving it can't leak into the standard-mode PDF or any client-facing surface.

## Result
Documents tab is fully built and behaviorally verified end-to-end on `leeward-staging-internal`. NOT YET deployed to production; NOT YET applied to production Supabase.

---

# TRIAL LENGTH EXTENDED 14 -> 30 DAYS — 2026-07-28

## Objective
Ryan's call: 14 days wasn't enough time for a prospective customer to decide whether to pay for Leeward. Before changing anything, confirmed via Stripe's own documentation that trial length for a Checkout Session is governed entirely by the `subscription_data[trial_period_days]` param sent at session-creation time — there is no separate Price/Product-level trial default in Stripe's dashboard that this needs to match or that could override it. So this was a pure code change, no Stripe dashboard config required.

## Fix
Changed the literal `"14"` -> `"30"` in all three places a Stripe Checkout Session is created: `app/api/billing/checkout/route.ts` (individual plan), `app/api/billing/team-checkout/route.ts` (existing org owner upgrading to Team), and `app/api/billing/team-signup-checkout/route.ts` (brand-new Team signup). Swept for and fixed every other stale "14-day"/"14 days" user-facing string to match: one in `app/dashboard/page.tsx` (Upgrade-to-Team subtitle), five in `app/subscribe/page.tsx` (Plan Choice subtitle, both plan-card captions, Team naming-step subtitle, Individual trial-start heading).

## Verification (staging, `leeward-staging-internal`, real Stripe test-mode Checkout Session)
`npm run build` passed. Committed/pushed to `estimate-nav-phase-1` (`1a5fd0c2`), deployed to `leeward-staging-internal`. Deleted the test account's (`rmickschl23@gmail.com`) `user_subscriptions` row on staging to restore trial eligibility (any existing row, regardless of status, makes `isTrialEligible` false), called `/api/billing/checkout` directly with a real access token, and opened the returned Stripe-hosted Checkout Session page — it read "30 days free - Then $29.00 per month starting August 27, 2026," exactly 30 days from the test date, confirming Stripe computed the trial directly from the updated param. Checkout was abandoned intentionally (no card entered, nothing charged) — the test account's `user_subscriptions` row was left deleted as a result, not restored.

## Result
Trial length is now 30 days across all three checkout paths and all user-facing copy, verified against a real Stripe test-mode session, not just code review. NOT YET deployed to production.

---

# FULL REGRESSION PASS ON `estimate-nav-phase-1` — 2026-07-28

## Objective
Before promoting this large, multi-feature branch (Team Accounts, Estimate/Invoice, Dark Mode, Record rename, Payments, Documents, 30-day trial) to production, ran a real end-to-end regression pass across every system touched this cycle, on `leeward-staging-internal`, using a real signed-in account and real API calls rather than code review.

## Verified (all via real browser session against staging, real data, not simulated)
- **Offline/send/reconnect**: added an entry online, added a second entry with `navigator.onLine` forced false (real offline queue path, not a mock) - queued entry showed "Pending Sync"; flipped back online, the app's real reconnect flow (interval-detected) flushed it automatically to "Draft"; ran Send Update - both drafts finalized correctly, delivery status updated. Confirms the offline outbox/flush/send pipeline is unaffected by this cycle's work.
- **Estimate tab**: Current Total, Paid/Balance Due, Original Estimate/Additional Charges sections all render correctly with real data (1 approved, 2 pending).
- **Payments**: logged a real $250 payment via the modal, confirmed it appeared and the Paid total updated live; deleted it, confirmed the total reverted correctly.
- **Documents tab**: uploaded a real file, confirmed the file-type thumbnail badge, toggled "Include in dispute packet" on, confirmed persistence across reload.
- **PDF export, both modes**: called `/api/export/pdf` directly (bypassing a UI freeze encountered mid-session, root-caused as browser/tab flakiness, not a server bug - endpoint returned 200 in under a second both times) for both `reportMode: "standard"` and `"dispute"`, then extracted real text via `pdf.js`. Standard mode correctly excludes Payments and Reference Documents. Dispute mode correctly includes the Reference Documents section (uploaded file, opted-in), a full Payment Summary (Contract Total/Paid to Date/Balance Due) plus itemized payment log, and the Original Estimate badge.
- **Team Accounts**: confirmed the "Upgrade to Team" modal still renders correctly with the updated 30-day trial copy - not a full org-creation re-test (out of scope for a smoke check; Team Accounts code was untouched this cycle).
- **Dark mode**: toggled Light/Dark live across the dashboard shell, Records list (with colored status stripes and the "ORIGINAL ESTIMATE" legend), Estimate tab, and Documents tab - no invisible text or unstyled elements found in either theme.
- **Record rename correctness**: confirmed via extracted PDF text and the share/invoice pages - no leftover bare "Project" strings in any app-generated copy (the one match found was a project's own user-entered title, which legitimately contains the word).
- **Share/invoice page**: both the regular journal view and `?invoice=1` mode render correctly with live data (Current Total, Paid, Balance Due, Original Estimate badge, no draft leakage).

## Self-caught testing error (not an app bug)
Mid-pass, a set of direct API checks (bypassing the UI PDF-export freeze) initially appeared to show Payments and one Reference Document missing from the dispute PDF. Investigated rather than assumed a regression: the project ID used had been grabbed from a stale URL earlier in the session and pointed at a *different*, older test project that happened to share the exact same name/client ("Staging QA Test Project" / "Ryan QA Staging") from a prior session's testing. Confirmed via `localStorage`'s `Leeward_last_open_project_id` and cross-checking Timeline entries. Re-ran against the correct project ID and every check passed. No code fix needed - flagging only as a reminder that duplicate-named test projects from past sessions are still sitting in staging and can cause this exact confusion again.

## Result
No regressions found across any of the systems touched this cycle. Branch `estimate-nav-phase-1` is considered ready for the next step (Help section update, then production promotion) pending Ryan's go-ahead.

---

# PRODUCTION PROMOTION OF `estimate-nav-phase-1` — 2026-07-28

## Objective
Promote the full `estimate-nav-phase-1` branch (Team Accounts already live since 2026-07-23; this promotion adds the nav overhaul, Estimate/Change Order/Invoice system, Dark Mode, Record rename, Payments, Documents tab, updated Help section, and the 30-day trial) from staging-only to production (`app.getleeward.com`), following the careful multi-step sequence documented under the 2026-07-19/20 rollback incident above.

## Steps taken
1. Applied the one remaining pending migration (`20260728120000_project_documents.sql`) to production Supabase (`uzuzwhzilhakewtbtzxh`) via the SQL Editor, with the same explicit `grant all on table public.project_documents to postgres, anon, authenticated, service_role;` this repo's Phase 6 gotcha requires. Verified via a combined `information_schema.columns` / `role_table_grants` / `pg_class` query: `column_count: 10, grant_count: 28, pg_class_count: 1` - matching the exact values staging showed when this migration was applied there.
2. Re-verified (not assumed from docs) which Vercel project actually serves `app.getleeward.com` via `vercel project ls`: confirmed `buildproof-staging` -> `app.getleeward.com` (production), `leeward-staging-internal` (real staging), `buildproof-site` -> `getleeward.com` (marketing).
3. Confirmed clean git tree on `estimate-nav-phase-1`, captured pre-deploy `HEAD` (`c798e18d3d87dd091c1c4f24926e9c92f0a38ad4`).
4. Deployed via `vercel deploy --project buildproof-staging --prod` (the explicit `--project` flag pattern used to recover from the earlier rollback incident, rather than relying on the ambient `.vercel` link). Result: `Ready in 50s`, `Aliased https://app.getleeward.com`.
5. Verified the deployed commit via the Vercel dashboard's Source panel (CLI `vercel inspect` output was truncated before showing git metadata) - confirmed `c798e18` on branch `estimate-nav-phase-1`, matching the captured pre-deploy SHA exactly, aliased to `app.getleeward.com`, `Environment: Production (Current)`.

## Found and fixed during live production verification (same session)
While doing the post-deploy live click-through on `app.getleeward.com` itself (see next section), the empty Records-list state read "No matching projects. Try searching by client name/email/phone." - a leftover from before the Record rename that the original rename pass's grep sweep missed, because it only checked JSX text nodes (`>...Project...<`), not string literals passed to `setStatus()`/empty-state conditionals. This is also the reason the "Record rename correctness" check in the regression pass immediately above (which checked PDF text and share-page copy only) didn't catch it - the bug was specific to the dashboard's own Records list and status toasts, surfaces that pass didn't check.

Grepped every renamed file for the same pattern (quoted string literals containing "project", not just JSX text) and found 5 more misses, all in `app/dashboard/page.tsx`, all status toasts a user sees during normal use:
- `"No matching projects. Try searching..."` -> `"No matching records. Try searching..."`
- `"Saving project..."` -> `"Saving record..."`
- `e?.message || "Offline project save failed"` -> `"Offline record save failed"`
- `` `Add project failed: ${error.message}` `` -> `` `Add record failed: ...` ``
- `"Saving project name..."` -> `"Saving record name..."`
- `"Archiving project..."` -> `"Archiving record..."`

Checked every other renamed file (OnboardingWizard, NewProjectModal, SendUpdatePack, ApprovalComposer, share page, archived pages, ApprovalCard, BulkCaptionUploader) for the same string-literal pattern - all clean, no further misses found.

`npm run build` passed. Committed (`5c480f22`) and pushed to `estimate-nav-phase-1`. Deployed staging-first per this repo's standing rule (`vercel deploy --project leeward-staging-internal --prod`), spot-checked live on `leeward-staging-internal.vercel.app` (triggered the empty-state via a nonsense search term - confirmed "No matching records..." renders correctly), then promoted to production the same explicit-project-flag way as the main promotion (`vercel deploy --project buildproof-staging --prod`), and re-verified via the Vercel dashboard Source panel: commit `5c480f2`, branch `estimate-nav-phase-1`, `app.getleeward.com`, `Environment: Production (Current)`.

## Live production click-through (post-deploy)
Signed in as `rmickschl23+prodteam1@gmail.com` directly on `app.getleeward.com/dashboard` (already-authenticated production session). Confirmed on first load: dark mode rendering correctly, "Records" heading, "+ New Record" button, "ORIGINAL ESTIMATE" status legend with Pending/Approved/Declined dots - all new copy and layout live and correct on production, not just staging.

## Result
Production (`app.getleeward.com`) now serves the same code, commit-for-commit, as `leeward-staging-internal`, including the Record-rename completeness fix found during this verification pass itself. Migration applied and double-verified. Deployment commit double-verified via the Vercel dashboard, not just CLI text.

---

# ACCOUNT DROPDOWN OFF-SCREEN ON MOBILE — FIXED — 2026-07-28

## Objective
Work through the outstanding bug punch-list (per Ryan's instruction, in order, marketing site and email deliverability saved for last). First item: the previously-flagged "Account dropdown off-screen on mobile" bug (open since an earlier session, never root-caused).

## Root cause
`app/dashboard/page.tsx`'s header row (`className="row"`, which uses `justify-content: space-between` per `app/globals.css`) has `flexWrap: "wrap"` applied inline. On narrow phone widths (~320-360px, where "Upgrade" + "Account" don't fit beside the logo), the button column wraps onto its own line. `space-between` only right-aligns items while they share a line with something else to space against - a single flex item alone on a wrapped line collapses to flex-start (left) instead. The Account dropdown panel is positioned `right: 0` relative to its immediate anchor (a tight `position: relative` div wrapping just the Account button), which assumed the anchor would always sit near the screen's right edge. Once wrapped, the anchor sits at the far left instead, so the dropdown (240px wide, `right: 0`) rendered mostly or fully off-screen to the left - confirmed visually via a genuine 320px-wide iframe (real independent viewport, not just a resized window - `resize_window` was tried first but doesn't affect the actual rendered viewport size in this environment) against `leeward-staging-internal`.

## Fix
Added `marginLeft: "auto"` to the button-column div (`app/dashboard/page.tsx`, the flex column wrapping the Upgrade/Team button + the Account button/dropdown). This keeps the column flush against the container's right edge whether it shares a line with the logo or wraps onto its own line, since an auto margin on a flex item consumes all remaining space on its own line regardless of wrap state - preserving the dropdown's existing `right: 0` assumption in both cases rather than needing to touch the dropdown's own positioning logic.

## Verification
`npm run build` passed. Committed (`74f0f563`) and pushed to `estimate-nav-phase-1`. Deployed to `leeward-staging-internal` and re-tested at the exact width that reproduced the bug (320px, via a real iframe-based independent viewport) - Account button now stays right-anchored on its own wrapped line, and the dropdown renders fully on-screen and legible. Also spot-checked at 390px (common phone width) - unaffected, still correct. Promoted to production (`vercel deploy --project buildproof-staging --prod`) and confirmed via the Vercel dashboard Source panel: commit `74f0f56`, branch `estimate-nav-phase-1`, aliased to `app.getleeward.com`, matching the pre-deploy `git rev-parse HEAD` exactly.

## Result
Bug closed and shipped to production. First item on the current punch-list; regression pass on offline send/reconnect is next.

---

# OFFLINE SEND/RECONNECT REGRESSION PASS (POST FAILED-SEND FIX) — 2026-07-28

## Objective
Second item on the current punch-list: genuinely exercise the offline send outbox's failure-classification, retry-cap, and dismiss UI (added 2026-07-27, tracked as tasks #122-124) end-to-end on `leeward-staging-internal`, plus confirm the core success path (offline queue -> reconnect flush -> finalized send) still works correctly after that fix. This task had been left `in_progress` without ever actually being run.

## Test 1: permanent-looking failure that doesn't match the pattern list
Created a real test record ("Send Regression Test") with client email deliberately set to `not-a-real-address` (no @, syntactically invalid). Added a real Timeline entry, clicked Send Update. Server correctly rejected with "Invalid toEmail" - but this exact message does NOT match any of `isLikelyPermanentSendError()`'s substring patterns (checked: "invalid toemail" does not contain "invalid email" as a substring, since "to" sits between the two words). This is a genuine, if narrow, gap in the pattern list - flagging it, not fixing it, since the design's own stated intent is that the attempt-cap is the deliberate backstop for exactly cases the pattern match misses.

Verified the backstop actually works: read the record directly from IndexedDB (`buildproof-offline` / `send_outbox`) across 6 dispatches of the real `buildproof-run-reconnect-flow` event (the same event `OfflineReconnectBootstrap.tsx` fires on genuine reconnect) using 2.5s gaps to let each flush attempt complete:
- Attempts 1 -> 5: `status: "pending"` each time (retrying, as expected since it's not pattern-matched as permanent)
- Attempt 6 (`syncAttemptCount` hit 6, `>= MAX_SEND_ATTEMPTS` of 5): `status: "failed"` - correctly stopped
- 7th dispatch: record stayed at `status: "failed"`, `attempts: 6` - unchanged, confirming `getFlushableOfflineSendRecords()` correctly excludes terminal `"failed"` records and this can no longer loop forever

Reloaded the page and confirmed the UI layer: "⚠ 1 update couldn't be sent / To not-a-real-address: Invalid toEmail / Retry / Dismiss" rendered correctly (survives a real page reload, not just in-memory state). Clicked Dismiss - banner disappeared and the IndexedDB record count went to 0, confirming Dismiss is a real, permanent removal, not cosmetic.

## Test 2: core success path unaffected
Fixed the test record's client email to a real address, then genuinely forced `navigator.onLine = false` (real offline code path) and added a second Timeline entry - correctly showed "Pending Sync". Flipped back online and dispatched the real reconnect event - the queued entry correctly auto-flushed to "Draft". Ran a real Send Update (approved and sent to Ryan's own inbox per his explicit go-ahead) - both entries flipped from "Draft" to "Finalized", confirming a genuine send occurred (not a cooldown-guard reuse of a prior job).

## Result
The 2026-07-27 failed-send fix is confirmed working exactly as designed: the retry cap is a real, effective backstop even when the pattern-match classifier misses a message (flagged as a minor future improvement, not blocking), Dismiss genuinely removes the record, and the core offline queue -> reconnect -> flush -> finalize pipeline is unaffected by the change. Task #125 closed.

---

# DARK MODE SLICE 6 — FULL LIGHT/DARK QA PASS — 2026-07-28

## Objective
Third item on the current punch-list: a genuine visual QA sweep of both themes across every major surface, closing out the dark-mode initiative's final outstanding slice (previous slices covered token infrastructure, the toggle, and migrating individual components one at a time - this slice is the full-app confirmation pass that was never actually run end-to-end).

## Surfaces checked in both themes on `leeward-staging-internal`
Dashboard shell (logo, Upgrade/Account buttons, "Signed in as"), Account dropdown (Appearance toggle, Help, Manage Billing, Logout), Records list (search, filter, colored status stripes, ORIGINAL ESTIMATE legend), record mini-header (RECORD eyebrow, Close/Actions), Timeline tab (entries, Finalized/Draft badges), Estimate tab (Current Total, Paid/Balance Due, Original Estimate badge, Payments section), Documents tab (upload button, explanatory copy), New Record modal, Archived Records page. All rendered correctly in both light and dark - no invisible text, unstyled elements, or contrast issues found in any of them.

## Confirmed as intentional, not a bug
`/help` was checked with the app's theme preference forced to `"dark"` via `localStorage['leeward-theme']` - the page renders in its own fixed light styling regardless, matching this file's own documented note that the Help page was deliberately left out of every prior dark-mode migration pass (content-coverage rewrite only, no visual conversion attempted). Confirmed this doesn't look broken (no invisible text, no mismatched dark shell around light content) - it's a consistent, fully-light page, just not theme-reactive. Left as-is per the existing scope decision; a future dark-mode pass for this page would be a separate, explicitly-scoped task.

## Result
No dark/light regressions found anywhere in this sweep. Dark Mode Slice 6 is complete - the initiative (token infrastructure -> toggle -> component migration -> full QA pass) is now fully closed out. Task #68 closed.

---

# SHARE PAGE HYDRATION WARNING — INVESTIGATED, NOT REPRODUCIBLE — 2026-07-28

## Objective
Fourth item on the current punch-list: investigate a previously-flagged React hydration warning on the share page, which had never actually been root-caused.

## Investigation
Read `app/share/[token]/page.tsx` in full: it is a pure Server Component (no `"use client"` directive, uses `supabaseServer` and `next/headers` directly, `export const dynamic = "force-dynamic"`). Grepped the entire `app/share` directory for `"use client"` - zero matches. This means nothing in the share page's own component tree hydrates on the client at all; classic React hydration mismatches (server-rendered markup disagreeing with the client's first render) require a Client Component to actually hydrate, so the page's own code is not a structurally plausible source of a hydration warning as currently written.

Did find one real, if narrow, latent risk while reading `formatDate()`/`formatShortDate()` (lines 143-184): `formatShortDate` calls `.toLocaleDateString(undefined, {...})` and `formatDate`'s fallback branch (when no `timezoneOffsetMinutes` is available) calls `.toLocaleString()` with no locale/timezone argument - both depend on the runtive's default locale and timezone, which can differ between a Node.js server process and a browser. This is a generically real hydration-mismatch pattern in Next.js apps, but only actually fires if a Client Component reformats the same ISO string differently after mount - and there isn't one here, since the whole tree is server-only.

## Reproduction attempt
Created a real, live share link on `leeward-staging-internal` (`/api/share/create` for the "Send Regression Test" record) and loaded it fresh (full reload, not client navigation) in a brand-new tab, for both the regular journal view and `?invoice=1` mode. Captured console output both times - zero messages of any kind. Confirmed the console-capture tooling itself was working correctly via a `console.error`/`console.warn` sentinel test that was captured immediately after.

## Result
Not reproducible in the current deployed state, on either share-page mode. Most likely explanation: either a prior change (possibly the Record-rename pass, which touched this exact file) incidentally resolved whatever caused it, or the original warning was a dev-only artifact (e.g. React Strict Mode double-invocation noise in local `next dev`) that never applied to the deployed build. No code change made, since there's nothing currently reproducible to fix and speculatively "fixing" the locale/timezone calls above (a real but currently-inert risk) isn't warranted without a live warning to confirm against. Flagging the `toLocaleDateString(undefined, ...)` / bare `toLocaleString()` calls as worth pinning to an explicit locale/timezone defensively if this resurfaces. Task #92 closed as investigated/not reproducible.

---

# MOBILE VIEWPORT SWEEP (360px) — VERIFIED CLEAN — 2026-07-28

## Objective
Fifth item on the punch-list: verify mobile/phone rendering beyond the already-fixed Account dropdown bug, and check Play Store status.

## Method
Real browser viewport testing via an injected `<iframe>` (fixed 360x740px) pointed at `leeward-staging-internal.vercel.app`, since `resize_window` doesn't reliably change the actual rendered CSS viewport in this environment. This is the same technique used to originally reproduce and verify the Account dropdown off-screen fix (task #120).

## Surfaces checked at 360px
- Record detail view (Timeline tab): Record header, Client card, filter/search, entry cards - all render cleanly, no overflow.
- Send Update modal: title, delivery email field, "Include archived entries" checkbox, Send button, Delivery Status section - all wrap correctly, no clipping.
- Estimate tab: Current Total / Paid / Balance Due stat card, onboarding "Create Estimate" prompt, floating "+" FAB - all fit within the 360px width.
- Documents tab: "+ Upload Document" button and description text wrap correctly, no overflow.
- New Record modal: Record name / Address / Client name / email / phone fields, disclaimer note, and "Create record" button all render cleanly with no clipping or horizontal scroll.

## Result
No new mobile-overflow bugs found across any of these surfaces at 360px - the previously-fixed Account dropdown bug (task #120) appears to have been the only real mobile-layout defect in this area. Play Store status: not independently checked (no Google Play Console access available to this session) - per CLAUDE.md, the app is documented as LIVE on Google Play, and this cycle's changes (Team Accounts, Dark Mode, Estimate/Invoice, Payments, Documents, Record rename) are all web-only, served through the Capacitor WebView wrapper with no bundled native UI, so no new Android release is required for any of it - confirmed via docs, not via Play Console itself. Task #106 closed.

---

# LOGIN OTP ABORT-RACE BUG — FIXED (WITH ACTIVE MONITORING) — 2026-08-04

## Objective
Real production bug in `app/login/page.tsx`'s OTP sign-in flow, found and escalated to highest priority the same day Meta ad traffic was about to start driving new signups through `/login`. `supabase.auth.verifyOtp()` (in `handleVerifyCode`) and a plain `supabase.auth.getSession()` check (in the mount-time `useEffect`) could throw a generic `AbortError` ("signal is aborted without reason") even though the underlying sign-in had genuinely succeeded server-side and a real session already existed in localStorage - confirmed repeatedly by manually navigating to `/dashboard` in the same tab immediately after the error and finding the user was, in fact, signed in.

## Root cause theory
Not provable from application code alone (this is inside supabase-js's internals), but consistent with every observation across three separate fix attempts: supabase-js's internal `navigator.locks`-based auth mutex gets wedged after the abort - the lock from the original aborted call is never cleanly released, so every subsequent call on that same already-loaded page needing the same lock (polling OR event listeners) also hangs or fails, even though the real session sits in storage the whole time. Only a genuine fresh page navigation reliably recovers, since it gets a brand-new lock-manager scope and a brand-new supabase-js client.

## Fix attempts 1 and 2 - both failed on production
1. Fixed-interval retry loop (4 attempts / 400ms) - reproduced the identical abort error on the first production stress-test cycle after deploying it. Confirmed via manual `/dashboard` navigation that the session was genuinely real the whole time.
2. Event-driven `onAuthStateChange`-based wait (`waitForRealSession()`) - also reproduced on the first production stress-test cycle. This ruled out "the polling window was just too short" as the explanation and pointed at the wedged-lock theory above: no in-page recovery strategy on the already-loaded page can work once the lock is wedged, regardless of mechanism.

## Fix attempt 3 - hard navigation (shipped, live)
On the specific abort signature (`isAbortRace()`, regex `/abort/i` against the error message), both call sites now call `hardNavigateToSigningIn()`: a real `window.location.href` navigation to `/auth/finish/signing-in` (preserving `redirectedFrom`) instead of trying to recover in place. That destination page already had its own independent, previously battle-tested `waitForAccessToken()` polling loop (up to 6s) against a brand-new client on a freshly-loaded page, falling back to `/login` itself if there's genuinely no session. Scoped narrowly to this abort signature so a real wrong/expired code still shows an immediate, specific error rather than a silent multi-second redirect.

## Verification
Stress-tested repeatedly on production (`app.getleeward.com`), not staging, per the explicit "verify EVERY time" bar this was held to. Clean single-tab cycle: an already-signed-in session hitting `/login` redirected straight to `/dashboard` with no error (mount-time abort path); a full logout -> send code -> enter code -> verify cycle landed cleanly on `/dashboard` with the real record list, no error, no stall, in about 3 seconds (verifyOtp abort path). One false alarm during testing - a 16-second stall on `/auth/finish/signing-in` past its own 6s timeout - was root-caused to stale test tabs left open against the same origin contending for a browser-level lock, not a bug in the fix; closing them and re-running in a single clean tab resolved it immediately. Ryan separately confirmed a real-world pass outside this testing: signed in via Safari on `getleeward.com` with an existing account, no snag.

Explicitly NOT claimed as provably bulletproof - all automated verification was via desktop Chrome; mobile Safari/Chrome under real flaky-network ad-traffic conditions (the highest-risk untested surface) has not been separately stress-tested.

## Diagnostics added (non-invasive)
Same day, once Ryan confirmed it wouldn't touch the verified login flow: new route `app/api/diagnostics/login-abort/route.ts` logs to Vercel's function logs whenever the abort race fires in production (timestamp, catch site, error message, redirectedFrom, user agent). Wired into `app/login/page.tsx` via a fire-and-forget `reportAbortRace()` call (`fetch(..., {keepalive:true})`, never awaited, wrapped in try/catch) placed immediately before each existing `hardNavigateToSigningIn()` call - cannot throw back into or delay the actual recovery path. Purpose: real production data on frequency/browser clustering instead of manual spot-checks, while ad-driven signup traffic ramps up. Check via `vercel logs app.getleeward.com --project buildproof-staging`, grep `login-abort-race`.

## Result
Fixed and deployed to production, verified repeatedly with zero gaps in this session's testing. Flagged as still-open follow-up, discussed with Ryan and prioritized above the ad-campaign tasks but not yet executed: real mobile device testing (Safari iOS, Chrome Android, cellular network) and a confirmed-fast rollback plan kept ready in case a real user hits this before mobile coverage exists.

---

# SCHEDULE AND CALENDAR V1 SHIPPED TO PRODUCTION — 2026-08-05

## Objective
Ship the Schedule/Calendar V1 feature (per-record Schedule tab, global Calendar month-grid view, new Records/Calendar/Account global tab bar) to production, then close out two real gaps between the original design doc and what Phase 1 actually built, found when Ryan asked to double check against the design doc.

## What shipped
`project_schedule_events` table + 5 API routes (`app/api/schedule/*`), per-record Schedule tab, global Calendar view, and the Records/Calendar/Account tab bar replacing the old header-button row + Account dropdown. Full detail in CLAUDE.md's "Completed Build: Schedule and Calendar V1" section.

## Gaps found and fixed
1. Design doc (`Schedule and Calendar - Implementation Plan.md`, line 34) specified a "view record" row on an event's Edit modal that jumps to the source record - never built in Phase 1. Fixed via `openProjectFromScheduleEvent()`, mirroring the Records list's own click-to-open behavior.
2. Design doc (line 31) specified that tapping a day with existing events should open those events for viewing, not the add flow - Phase 1 shipped with this as a dead click. Fixed with a day-events list modal.
3. Follow-up same day: Ryan wanted an explicit "add new" option even on days that already have an event (previously only empty days or 2+-event days offered anything useful; a single-event day skipped straight to Edit with no way to add a second). Simplified so every non-empty day opens the same list modal, always with a "+ Add New Event" button.

## Verification
All three fixes verified with real Chrome sessions on both `leeward-staging-internal` and, after promotion, `app.getleeward.com` directly: created a real test event on a real record, confirmed the day-grid click opens the list modal (not straight to Edit), confirmed "+ Add New Event" carries the tapped date through to the record picker, and confirmed "View Record ->" correctly navigates to the source record. Test event cleaned up via direct `execute_sql` against production afterward rather than through the UI's own delete-confirm flow, since native `window.confirm()` dialogs freeze Chrome CDP automation (`Input.dispatchMouseEvent`/`dispatchKeyEvent` time out after 30s) - a known tooling limitation, not a product bug.

Also worth noting for future sessions: this environment's `resize_window` tool does not actually shrink the rendered CSS viewport below ~1065px here, and the calendar's day-grid cells are plain unstyled `<div>`s that `find`/`read_page` cannot reliably distinguish from same-labeled agenda-list text. Both were worked around via direct DOM queries through the Chrome extension's JS-execution tool rather than relying on the accessibility-tree tools or pixel-coordinate clicks.

## Result
Fully shipped and behaviorally verified on production. Phase 2 (offline outbox/flush) remains deliberately deferred - not scheduled. Full detail: CLAUDE.md's "Completed Build: Schedule and Calendar V1" section.

---

# ARCHIVED RECORDS ROW OVERFLOW ON MOBILE — FIXED — 2026-08-05

## Objective
Real bug reported by Ryan via a phone screenshot: on the Archived Records page (`app/archived/page.tsx`), a record with a longer client name/email showed its Restore button cut off at the screen edge (only "Res" visible) instead of the row's existing ellipsis-truncation rules kicking in.

## Root cause
Reproduced via a same-origin `<iframe>` fixed at a real mobile width (~386px), since this session's `resize_window` tool doesn't actually shrink the rendered viewport below ~1065px. Measured real `getBoundingClientRect()` values: the row's right edge exceeded the iframe's own width by ~34px. The per-record `.row` div had no `minWidth: 0` - its title/client-info text divs already had `overflow: hidden` / `textOverflow: ellipsis`, but `.row` itself, as a flex item of the column-direction `.list` container, had no min-width override, so its own min-content width (driven by the Restore button's non-shrinking text) exceeded available space, pushing the whole row past the viewport edge instead of letting the ellipsis rules engage. Confirmed the fix live in the DOM by patching `minWidth: 0` onto the row via the browser console and re-measuring before writing any code.

## Fix
Added `minWidth: 0` to the row's style (matching the same property already used one level down, on the row's own text-wrapper div) and `flexShrink: 0` on the Restore button. Scope-checked `app/archived/entries/page.tsx` (Archived Entries) - different layout, not affected, no change made there.

## Verification
`tsc --noEmit` timed out in this sandbox (recurring session issue) - verified manually, both added properties already-proven types in this exact file. Deployed to production same batch as the Schedule/Calendar fixes above. Verified live on `app.getleeward.com` against the real longest-email archived record ("Sksksk" / `rmickschl23+tiralanderroracpunt@leads.com`) using the same iframe-based mobile-width measurement technique: confirmed the fix is present in the deployed code and the row no longer overflows.

## Result
Fixed and verified on production. No other archived/list pages found with the same pattern during scope-check.

---

# NATIVE CHECKOUT STRANDING (ANDROID + IOS) — FIXED — 2026-08-05/06

## Objective
Real production bug found on a real Android device from Google Play: after completing Stripe checkout (Team signup), the app was left frozen on "Opening checkout...", stuck in whatever browser Stripe's redirect landed in, no way back into the native app. Escalated as a genuine fix required, not a band-aid, given the app is live.

## Root cause (two layers)
1. Capacitor's WebView hands any navigation outside its configured origin (`app.getleeward.com`) to the system browser as a separate app/task - Stripe's success_url/cancel_url/return_url just loaded there with no way to signal the native app.
2. After fixing that with an in-app browser (`@capacitor/browser`) plus a bridge page (`/checkout-return`), a second bug surfaced on real-device testing: Chrome Custom Tabs (and iOS's in-app browser equivalent) do not have Capacitor's JS bridge injected - only the app's own WebView does. `/checkout-return`'s `Capacitor.isNativePlatform()` check, evaluated inside the Custom Tab, always silently returned `false` on-device, defeating the fix.

## Fix
Platform detection moved to checkout-INITIATION time (the one place it's reliable) via `lib/capacitorCheckout.ts`'s `withNativeFlag()`, threaded through as a `platform=native` -> `native=1` query param across all 5 billing routes and `/checkout-return`. Android: `AndroidManifest.xml` custom-scheme intent-filter. iOS: matching `CFBundleURLTypes` entry in `Info.plist`. Two real XML build failures hit and fixed along the way (literal `--` inside XML comments, invalid anywhere in the comment body, not just next to `-->`) - once in each manifest file's own explanatory comment. Separate real bug found and fixed in the same pass: Codemagic's `codemagic.yaml` build script ran `npx cap copy ios` instead of `npx cap sync ios`, so newly-added native plugins (`@capacitor/app`, `@capacitor/browser`) were never actually compiled into the iOS build (`ios/App/CapApp-SPM/Package.swift` never regenerated) despite being correctly in `package.json` - confirmed live via a real TestFlight build throwing `"Browser" plugin is not implemented on ios`. Also fixed: dashboard's "Manage Billing" button always hit the individual portal route even for Team owners (no individual Stripe customer to find) - now branches to `/api/billing/portal/team` based on `billingSource`.

## Verification
Real devices, both platforms, not simulated. Android: local debug APK built and installed via Android Studio over USB onto a real Samsung device (diagnosed a charge-only USB cable as the reason ADB never prompted), confirmed a real Individual-plan Stripe checkout returns cleanly to `/dashboard` post-fix, versus the pre-fix build's exact reported stuck state. iOS: via Codemagic (no local Mac for this project) - TestFlight build 10 reproduced the Custom-Tab plugin gap live, build 11 (post `cap sync` fix) completed a real Stripe checkout via TestFlight and returned cleanly. Both platforms' resulting subscriptions confirmed correct server-side via direct Supabase queries against production (real `stripe_customer_id`/`stripe_subscription_id`, correct trial state). Three stray test trials from this testing were canceled through the now-fixed Manage Billing button itself, doubling as live verification of that fix.

## App Store resubmission
Found mid-investigation: the app's only prior App Store submission (built Saturday 8/1) was "Waiting for Review" with "Automatically release this version" selected - would have gone live with the broken checkout still in it the moment Apple approved it. Pulled from review before resubmitting with the verified-working build (TestFlight build 11).

## Result
Fixed and verified end-to-end on real devices, both platforms. Web-side fix deployed directly to production (narrow, additive URL-param-only change - no billing logic/schema touched). iOS build 11 submitted for App Store review, outcome pending. Merged `native-checkout-fix` into `estimate-nav-phase-1` (clean fast-forward). Deliberately NOT merged into `main`, which has been stale since the PR #28 incident and has diverged by months of real work - full "catch main up" explicitly deferred to a dedicated future session rather than folded into this one. Full detail: CLAUDE.md's "Fixed: Native Checkout Stranding (Android + iOS) + App Store Resubmission" section.

---

# IOS CAMERA CRASH ON TAKE PHOTO — FIXED — 2026-08-17

## Objective
Real bug found while trying to record the screen demo Apple's App Review requested for a Guideline 2.1 "Information Needed" reply: Take Photo crashed the app repeatedly on a fresh TestFlight install (build 11) every time it was tapped to attach a photo to an entry.

## Root cause
`ios/App/App/Info.plist` had no `NSCameraUsageDescription` or `NSPhotoLibraryUsageDescription` purpose strings declared. On iOS, invoking the camera without a declared purpose string crashes the app outright instead of showing a permission prompt. Leeward's camera capture uses a plain HTML file input (`accept="image/*" capture="environment"`, no native Capacitor camera plugin), but iOS still requires the native purpose strings regardless. Android never hit this - its file input doesn't require the same native permission declaration. Very likely also the root cause of the Guideline 2.1 rejection itself (review status showed "2.1.0 Performance: App Completeness," and Apple's own boilerplate separately flagged missing purpose strings as a common cause).

## Fix
Added `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` to `ios/App/App/Info.plist` (branch `ios-camera-permission-fix`, commit `401711e0`). Purely additive. Real mistake caught before committing: a literal `--` inside the new explanatory XML comment (not just adjacent to `-->`) produced invalid XML - same bug class already documented above in the Native Checkout Stranding entry. Caught via a Python `xml.dom.minidom` parse check, fixed by swapping `--` for `:`.

## Verification
New Codemagic build (build 12) installed via TestFlight on a real iPhone 15 (iOS 26.6). Confirmed on-device: Take Photo now shows a real iOS camera-permission prompt (none ever appeared before, since the crash happened before iOS could show one) and successfully takes and uploads a photo with no crash.

## Result
Fixed and verified on a real device. Build 12 selected as the build under review and a full reply sent to Apple covering all 7 items their Guideline 2.1 message requested (screen recording, device/OS, app description, demo setup, external services, regional differences, regulated-industry material). Awaiting Apple's response as of this writing - full detail: CLAUDE.md's "Fixed: iOS Camera Crash on Take Photo + App Store Guideline 2.1 Reply" section.

---

# APP REVIEW DEMO-LOGIN BYPASS: FOUND NEVER ACTUALLY DEPLOYED, FIXED — 2026-08-21

## Objective
Second Guideline 2.1 rejection (submission `63d6aeb4-3a48-4c94-ad27-cf4eea743198`, reviewed 2026-08-21): Apple couldn't sign in with the demo account credentials (`rmickschl23@gmail.com` / `Password: NorthS!de608`). Same submission also got a separate Guideline 3.1.1 (In-App Purchase) rejection - that one is a distinct, unresolved business-model decision, not covered by this entry.

## Root cause
Leeward has no password field anywhere - sign-in is email + a real emailed one-time code only (`app/login/page.tsx`). `NorthS!de608` was never a real password; it was meant to be typed into the app's code field as a fixed reviewer bypass code. That bypass mechanism was actually built on 2026-08-04 (`app/api/auth/review-demo-token/route.ts` + a matching `app/login/page.tsx` change) and even documented as complete in CLAUDE.md at the time - but it lived entirely on its own branch, `app-review-demo-login-bypass`, which was never merged into `main` or into `estimate-nav-phase-1` (the line every production deploy has actually come from since). Confirmed directly via `git merge-base --is-ancestor baf24d44 origin/main` and against `origin/estimate-nav-phase-1` - both false. The `APP_REVIEW_DEMO_EMAIL`/`APP_REVIEW_DEMO_CODE` env vars were, in fact, already correctly set on the real production Vercel project (`buildproof-staging`) since 2026-08-04 - so this wasn't the "wrong Vercel project" mistake documented on that old branch. The vars were right the whole time; the code that reads them just never shipped.

Second, smaller issue found while fixing this: the code value in the actual submitted App Store Connect notes is `72189138` - different from the `NorthS!de608` sitting in Apple's generic "Password" field (which only exists because Apple's form requires *some* value there, unused by the app). The notes are the authoritative reviewer instruction, so the fixed code needs to match the notes' value, not the Password field.

## Fix
Re-implemented the same 2026-08-04 design (server route mints a real Supabase one-time code via `admin.generateLink()` when the submitted email/code pair matches `APP_REVIEW_DEMO_EMAIL`/`APP_REVIEW_DEMO_CODE`; any non-match falls straight through to the normal `verifyOtp()` path, completely unchanged for every real user) on a fresh branch, `app-review-demo-login-fix-v2`, off the actual current production line rather than trying to merge/rebase the stale original branch. Verified via `tsc --noEmit` (zero errors) before committing. `APP_REVIEW_DEMO_CODE` corrected to `72189138` to match the submitted notes.

## Verification
Deployed directly to the real production project (`vercel deploy --project buildproof-staging --prod` - an initial plain `vercel --prod` was caught deploying to the wrong default-linked project, `leeward-staging-internal`, before this). Verified live on `app.getleeward.com`, in a real browser: logged out, entered `rmickschl23@gmail.com` + `72189138` (the exact code from the submitted notes, not the Password-field placeholder), landed cleanly on the real dashboard with real records. Re-ran the full logout/login cycle a second time after the env var correction to confirm the corrected code specifically (not just any code) was what worked.

## Result
Fixed and verified end-to-end on live production. No new App Store Connect notes needed - the already-submitted notes correctly describe the mechanism; the code just wasn't live to back them up until now. Branch `app-review-demo-login-fix-v2` pushed to GitHub. Not yet merged into `main`/`estimate-nav-phase-1` at the git level (worth doing for history hygiene) - production itself is already correct via the direct `--project` deploy. The separate Guideline 3.1.1 (In-App Purchase) rejection from the same submission remains open and unresolved - full detail: CLAUDE.md's "Fixed: App Review Demo-Login Bypass Was Never Actually Deployed" section.