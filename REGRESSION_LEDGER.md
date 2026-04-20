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