# Stage 4 saving/resuming/finishing milestone — 2026-10-18

**Controlling status:** user approved local implementation/testing of the saving milestone. It is implemented locally. Migration `202610180008_workout_saving.sql` is a reviewed/tested local draft and is **NOT applied hosted**. Installed migrations remain 001–007 per user confirmation. No hosted calls, credentials/account access, SQL execution or data writes occurred in this implementation. Workout History UI must wait until saving/resuming acceptance. No charts/analytics/Stage 5.

## Implemented

- New 008 extends actual workout tables without changing 001–007/planned routine tables/RPCs or backfilling history. Supports custom actual names/unknown loading convention, nullable incomplete draft reps, exact entered weight/unit, original name/target snapshots, skipped/removed dispositions, source version/day metadata and revisions. New FORCE RLS owned receipts and parent-state/child-write guards secure transactional saves, retry tokens, direct writes and completed immutability. Migration preserves populated existing profiles/plans/catalog/history; NOT VALID legacy-compatible constraints check new writes without rejecting stored historical values.
- New caller-privilege `fitness_save_workout` derives owner from auth.uid(), verifies expected account identity (stale requests cannot write into a subsequently signed-in account), validates real owned routine/day/version, snapshots authoritative names, and saves one complete workout snapshot transactionally with stable session/exercise/set IDs. Shared account advisory locks coordinate with existing routine versioning; per-session locks/revisions serialize direct edits and finishing. Old retry acknowledgments expose current revision/state so queued changes cannot rebase over newer/completed data. Completed workouts reject application edits/deletes. No Done control; new actual rows are performed automatically.
- Stage 3 repository now exposes saved day IDs outside RoutineDocument; editing/saving routine documents stays unchanged. Today’s Workout uses a serialized 400ms autosave queue, 20s request timeout, status/error/retry UI, account-scoped unsent recovery, unfinished resume list, Save & choose session and Finish confirmation. Finishing requires reps on included sets and at least one actual set; partial workouts and skipped/removed metadata persist. Exact finish retries cannot duplicate or reopen a completed workout. Original routines remain unchanged.
- Recovery keeps stable pending requests/payloads and newer queued input through refresh/network loss. Confirmed clean saves clear local recovery. Route/account unmount stops new old-account writes, while recovery remains keyed to the original user. No tokens/passwords are stored by recovery. Storage failures are reported. Explicit conflict reload replaces local editing only after confirmation. If no initial server session exists and its source changed, the user can confirm saving the captured snapshot independently (same workout ID, NULL FK links); it checks for an existing server copy first. A workout completed elsewhere remains protected and conflicting unsent edits cannot be merged into history.

## Verification

- `npm run check`: **433 tests / 24 files passed**, TypeScript passed, production build passed. New database/model/repository/queue/recovery/UI regressions cover exact actuals and units, stable IDs, add/edit/remove sets, substitutions/skips/removals/additions, source preservation, populated upgrades, atomic rollback, malformed writes, incomplete finish validation, immutable completed data, anonymous/cross-account denial, stale-account requests, retries/timeouts, lost responses, refresh/resume, single finish, conflict handling and original routine preservation.
- `npm run test:db:concurrency`: **17 native PostgreSQL 18.4 scenarios passed** after local process/socket permission. Twelve prior checks plus simultaneous workout start retries, competing autosaves, concurrent finish retries, direct-set-edit versus finish, and routine versioning with actual completed/draft data. Disposable fixtures stay inside .test-postgres; no hosted credentials/services used.
- `git diff --check` passed. Installed 001–007 have no diff. `stage-3-stable` is still **24be6832b37180e8846fbe1c832847238f6599f1**. All pre-existing uncommitted Stage 4 work is retained; no commit/branch reset or history rewrite occurred.

## Stop / remaining work

Read `docs/WORKOUT_SAVING_REVIEW.md`, current `docs/TODAYS_WORKOUT.md` and SPEC.md §22. User must separately review/approve the full 008 SQL before hosted execution. After installation confirmation, obtain permission for dedicated test-account/data writes and observe hosted autosave → refresh/sign-out/in → resume → corrections → finish, plus two-account isolation and retry tests. Local fixtures/mocks are not hosted acceptance. Browser desktop/mobile/zoom/touch/focus checks are unverified; no unsafe Playwright script was executed. Do not run an old mocked Stage 3 browser candidate as proof of live persistence.

**Stop before hosted installation or any Workout History interface.** Its cards/pagination/read-only actual-set detail view are the next milestone only after saving/resuming works and is accepted. Stage 3's earlier signed-in live acceptance also remains pending independently.

---

# Today's Workout — implicit performed sets — 2026-10-18

- Removed the Done column, checkbox, completion flag and reconfirmation logic. Add set now creates a performed-set row directly; users enter/edit weight and reps without an additional check.
- Exercises, replacements and newly added exercises start with zero actual sets. Planned set counts never create performed rows automatically. Header/card counts show explicitly logged sets, excluding skipped exercises. Removing a set reduces that count; restoring a skipped exercise retains its entered values.
- Simplified the actual-set table and mobile column widths. Saved routine targets, kg/lb conversion, source snapshots, account clearing and local-only draft boundaries remain unchanged. No hosted SQL/data changes or migration edits.
- Updated regression tests and SPEC.md §21 / docs/TODAYS_WORKOUT.md. `npm run check`: **391 tests / 19 files passed**, TypeScript and production build passed; `git diff --check` passed. Browser visual acceptance remains pending.
- Stage 3 backup branch `stage-3-stable` remains at `24be6832b37180e8846fbe1c832847238f6599f1`. These local Stage 4 changes are not added to that checkpoint.

---

# Stage 4 first step — Today's Workout — 2026-10-18

**Latest authorization:** user explicitly approved beginning Stage 4 for Today's Workout only. This supersedes earlier no-Stage-4 instructions only for the frontend/local-test scope. No charts, advanced analytics, other Stage 4 flows, hosted SQL or hosted workout writes are authorized. Migrations 001–007 remain installed per the user; no installed migration was changed.

- Reviewed existing workout_sessions/session_exercises/workout_sets, ownership/RLS/history foreign keys, Stage 3 read/save models and My routines navigation. Explained the approach and custom performed-exercise schema limitation before coding.
- Added `src/features/workouts/workoutDraft.ts` and `TodaysWorkout.tsx`. My routines now begins with a distinct Today's Workout section; Saved routines remains separate below it. Select active routine → named Day/session → compact single-open exercise cards. No weekday assignment. Discover remains unchanged.
- Independent snapshot includes source routine ID/exact version/names/day position and original prescriptions; actual exercise identity/name/loading mode and actual sets are separate. Planned set count can create empty table rows; no planned reps or load becomes actual. A zero-target exercise starts one empty actual row. Actual rows support differing reps/weights, kg/lb display conversion over canonical kg, add/remove and Done validation/reconfirmation. Custom/catalog replacements reset only that exercise's actuals; skip/restore/remove/add affect today only. Original plans remain unchanged.
- Local in-memory draft only, clearly labelled; no workout save/finish claims, storage writes or hosted workout calls. Refresh, route changes or account changes clear it. Opening/cancelling the saved routine editor hides/preserves it. Change session offers explicit discard for modified drafts. No actual results are persisted yet.
- **No new SQL file is needed for this frontend-only step.** Future hosted saving needs a new forward migration to support free-text performed exercises and unknown loading conventions, an explicit strategy for unfinished sets (installed reps NOT NULL), atomic owner-checked/retry-safe saves and real persisted routine-day resolution/version checks. Do not modify 001–007 or enable hosted persistence without review/approval. Full rationale is in `docs/TODAYS_WORKOUT.md`.
- `npm run check`: **392 tests / 19 files passed**, TypeScript passed, production build passed. 23 new model/UI/integration regressions cover selection, names/order, independent snapshots and zero actual defaults, one-open cards, actual set operations/validation/conversion, replacement/custom additions, skip/restore/removal/cancel, source immutability, zero routine writes, routine-editor draft preservation, account clearing and Discover separation. Existing migration/RLS/auth/routine suites passed too. `git diff --check` passed.
- Browser viewport/visual acceptance was not run. Manual desktop/mobile/zoom/touch/numeric-entry/focus inspection remains. Hosted workout persistence, resume, history retrieval and custom performed-exercise RLS/concurrency are deferred and unverified. Stage 3 authenticated live acceptance remains pending; do not mark it complete because this local feature exists.

Stop after this local step. Do not run hosted SQL/data modifications or expand Stage 4 automatically. SPEC.md §21 is controlling; historical unstarted/unauthorized Stage 4 statements below apply to earlier checkpoints. No live accounts, credentials or production records were accessed during this step.

---

# Hosted 007 installed / final Stage 3 acceptance — 2026-10-18

**Current controlling status:** the user reports successful execution of migration 007 in hosted Supabase (Success) and confirms **migrations 001–007 are applied**. This supersedes every historical pending-installation/approval statement below. Do not rerun or modify any installed migration. Installation is user-confirmed; authenticated hosted persistence acceptance has not yet been observed. Stage 4 is unstarted and unauthorized.

## Completed this session

- Updated SPEC.md current status and §20 database status. Prepared `docs/STAGE_3_LIVE_ACCEPTANCE.md` with exact manual steps, synthetic names/targets, expected evidence, two-account/RLS tests, responsive checks and the permission boundary.
- `npm run check`: **369 tests / 17 files passed**, TypeScript passed, production build passed. This includes local migration/upgrade/security, custom exercise/per-set persistence, exact edit identity, deletion/history and UI regressions.
- `npm run test:db:concurrency`: **12 native PostgreSQL 18.4 scenarios passed** after process/socket escalation. Disposable fixtures stayed inside this project. No hosted access in these tests.
- Read-only hosted checks ran after network permission: `npm run check:connection` passed (Auth HTTP 200, email sign-in enabled, email confirmation required). `npm run check:security:live -- --expanded-catalog` passed: anonymous reads denied with HTTP 401 on profiles/routines/routine_days/routine_exercises/workout_sessions/session_exercises/workout_sets; public catalog counts 30 exercises, 30 alternatives and 10 evidence sources. No keys, response bodies or private records were printed. These scripts use public configuration only; no account credentials/session tokens were accessed and no hosted writes were attempted.
- The existing anonymous security script does **not** check `routine_planned_sets` or authenticated v2 RPC isolation. Passing these limited probes is not full 007/live acceptance. No claim of browser, sign-in recovery or two-account live persistence verification is justified.

## Pending acceptance / authorization

All eight user-requested authenticated hosted scenarios remain pending: custom free-text names; differing per-set targets; multiple exercises/sessions; refresh and sign-out/in retrieval; editing without duplicates; personal-copy deletion without affecting recommendation; accepting an independent recommendation copy; and authentication/two-account read/write/RPC isolation. Local tests cover their logic, not hosted integration. See the checklist for the concrete manual run.

No hosted account or routine/profile was created, edited or deleted. No hosted SQL ran. A user-choice question was presented: run the manual checklist, or approve its documented test-data scope and coordinate dedicated test accounts/app URL before execution. No permission to perform test writes has been assumed. Do not request passwords/tokens in chat. No new browser script was executed. The older localhost-only mocked Playwright candidate is stale for separate saved content and still subject to exact-script approval; it cannot verify hosted persistence.

If automation is chosen, first confirm the approved app URL and dedicated test identities/session setup and present any required exact browser script. Scope proposed in the checklist: A creates one custom plan and one recommendation copy, edits only its custom plan, deletes only its recommendation copy; B creates one simple plan for bidirectional isolation. Test profile setup and cleanup require explicit permission too. Preserve all real records. Wait for observed results before marking Stage 3 acceptance complete; never begin Stage 4 automatically.

---

# Discover / My routines separation — 2026-10-18

- Discover (`/routines`) now shows only the recommendation, its preview/customization actions and training sources. My routines (`/routines#saved`) shows only saved active/archived routines and their view/edit/archive/delete actions. Create My Own Routine remains available in both destinations.
- Existing navigation URLs and hash focus are preserved. Changing destinations clears local preview/editor state and reloads the owned workspace without database writes; account changes still clear private state. Recommendation generation is skipped on the saved view. Use This Routine retains its success message and saved plans are accessible via My routines.
- Updated route-aware regressions cover content separation, navigation with zero writes, acceptance followed by retrieving saved plans, and existing saved edit/archive/delete behaviors.
- Verification: `npm run check` passed **369 tests / 17 files**, TypeScript and production build; `git diff --check` passed. Browser acceptance was not run. No SQL/migrations or persistence implementation changed; no hosted access or Stage 4 work occurred. Migration 007 remains pending separate approval. The unexecuted browser candidate below will need adjustment for separate saved content before future browser acceptance.

---

# Stage 3 session navigator / Add Exercise — 2026-10-18

Latest UI request completed locally. No hosted SQL, migration execution, credential access, production writes or Stage 4 work occurred. No migration or persistence implementation was changed in this pass; existing uncommitted work and Git history are retained.

- Recommendation preview now starts with every session collapsed in a two-column desktop card grid (one column at widths ≤600px). One controlled session panel renders beneath the cards. Switching replaces the prior panel; clicking the selected card or its labelled X closes it. Incidental rerenders preserve the open session. Closing/switching clears exercise disclosure state. Saved routine disclosures retain their prior behavior.
- Each recommended exercise shows its name and equipment requirements before expansion, with a short text description on expansion. One exercise description opens at a time. No exercise photographs were reintroduced. Recommendation selection, Customize and Use This Routine persistence are unchanged.
- Replaced Add Next Exercise with **Add Exercise** for the separate new-exercise composer. It validates, appends exactly one local exercise and clears the composer/targets; blank repeated clicks never append placeholders. Existing selected rows use **Done Editing Exercise** to return to the composer without duplication. There is one conditional exercise action, not separate Add/Next buttons.
- Explicit Save Routine / Save Changes still includes all added exercises and any valid unfinished composer across every session exactly once. Invalid configured input blocks saving instead of being dropped. Day switching, per-set targets, cancel, retry tokens and exact saved document/ID behavior are retained.
- `npm run check`: **368 tests across 17 files passed**, TypeScript passed, production build passed. New/updated regressions cover initially collapsed sessions, exclusive switching, both close controls, rerender persistence, disclosure resets, cancel/reopen reset, visible equipment, adding one/multiple exercises without duplicates, clearing targets, saving whole sessions and valid unfinished per-set input while preserving saved source data. Full local upgrade/RLS/persistence regressions also passed. `git diff --check` passed.
- Responsive CSS uses bounded grid columns, wrapping names and a mobile stack. Browser viewport/visual acceptance was **not run**; no claim of measured overflow or visual acceptance is made. The isolated candidate `scripts/milestone2-browser.js` now opens a session before exercise disclosures; exact-script approval remains required before unsafe MCP execution under the existing contract. Prior native concurrency results below remain historical; no SQL changed in this UI pass.

**STOP here. Migration 007 remains a local draft, unexecuted on hosted Supabase. Hosted persistence is unverified. Next is the user's separate review/approval of 007 and live persistence testing; do not begin it or Stage 4 automatically.**

---

# Stage 3 editor/deletion corrections — 2026-10-18

The latest user request supersedes previous image requirements: **all exercise photographs are removed; text explanations appear only in the recommendation preview. The old photo-coverage gap is no longer an open task.** Continue Stage 3 only. No hosted SQL/data access or Stage 4 work is authorized or was performed. Existing uncommitted work and Git history are retained.

## Investigation and implemented fixes

- The previous editor used actual draft exercise-array entries as blank input forms, showed “New exercise” placeholders and stripped pristine rows during Save. This blurred addition versus editing. It also always labeled the submit button Save Routine. Existing backend updates already used the intended ID; apparent additional history-linked versions were the deliberate protection contract, not evidence of arbitrary routine duplication.
- `RoutineEditor.tsx` now separates each day's input composer from its added exercises. New creation starts with empty routine/session names and zero exercise records. The form immediately shows an empty Exercise 1 input, not a placeholder record. Day 1/Day 2 selection precedes workout/session name; one exercise form and a compact added list follow. Add Next Exercise validates the current exercise before appending exactly once and clearing only the input buffer. Repeated blank clicks do not append. Add Day starts an empty session; switching/reordering days preserves each day's unfinished input. Explicit Save includes valid last typed exercises without blank rows or duplicates.
- Existing saved exercises/IDs/order/aggregate ranges/per-set targets load exactly. Editing an existing row updates its local position; it does not append it again. Free text never infers a catalog ID. Retired catalog rows are now fetched for accurate saved names; recommendations and new library choices still filter availability. No stored exercise is silently replaced, added or removed.
- New plans use **Save Routine**; existing plans use **Save Changes**, keeping the saved ID and exact edit timestamp. Unreferenced plans update in place. History-linked plans still deliberately archive/version under the existing RPC; the editor explains this before save and the page reports it afterward. Regression tests confirm other active/archived routines remain unchanged and no extra routine is created for an ordinary edit.
- Active and archived routines have a **Delete** action separate from Archive. Opening confirmation/Keep routine never writes. Delete permanently sends one DELETE filtered by owner, intended ID and exact timestamp, requires a returned row before reporting success, and disables controls in flight. Stale/denied/network/FK failures leave the routine intact and report an error. The inline confirmation focuses its heading and explains permanence/history protection.
- **No database migration change is required for deletion.** Existing migration 001's owner DELETE RLS/grants and planning-child cascades already support it. Existing NO ACTION workout FKs block deleting a plan linked to any workout, including a workout with NULL routine-day ID. Such plans must stay archived. No history is detached or deleted and no RLS policy is relaxed. The local 007 draft and installed 001–006 were not modified by these corrections. 007 remains unexecuted hosted and separately gated for custom/per-set support.
- Removed all exercise-photo files (including research scratch media), runtime manifest/provenance modules, photo UI/attribution/placeholder messages, image-specific CSS/tests and `check:photos`. Decorative public/dashboard gym-floor images remain. `ExerciseInfo.tsx` is text only, opt-in only for recommendation preview; custom/saved plans show names/targets and user notes without automatic explanations. No replacement diagrams were added.

## Verification and remaining limits

- `npm run check`: **364 tests across 17 files passed**, TypeScript passed, production build passed. Focused regressions cover empty creation, no placeholder/catalog insertion, validating Add Next, multiple days/buffers, exact saved loading including previously saved Dead bug and retired catalog IDs, order/rename/removal, Save Changes identity, retries, NULL/zero/units, cancel, confirmation, delete ownership/timestamps/errors, and text-only recommendation explanations.
- Local PGlite upgrade/RLS tests include deletion of exactly one unreferenced plan and its planning children; anonymous/cross-owner denial; stale-delete refusal; unchanged unrelated active/archived routines; and complete preservation of existing completed sessions, snapshots and actual sets when history blocks deletion. These are synthetic fixtures, not Stage 4 implementation or hosted acceptance.
- `npm run test:db:concurrency`: **12 PostgreSQL 18.4 multi-connection scenarios passed**, after required local process/socket permission. Includes the 9 prior checks plus stale delete versus a save and both workout-insert/delete ordering races. Test data/sockets stay in ignored `.test-postgres/`; no credentials or hosted services are used.
- `git diff --check` passed. No migration file was changed during these corrections, no hosted migration/probe was executed, and no production data was changed.
- Playwright was **not run**. The candidate `scripts/milestone2-browser.js` was revised for the current empty-composer/delete/text-only UI, invalidating any prior script-specific approval. It still requires exact-script approval under the existing contract before unsafe execution. No new responsive screenshot/visual acceptance claims are justified. Hosted persistence and two-account acceptance also remain unverified until separately approved installation/testing.

Current explanation/review: `docs/MILESTONE_2.md`. SPEC.md §20 now records the updated editor, delete and text-only requirements. Historical handoff entries below are context only; their photography tasks are withdrawn. Do not resume photo sourcing or start Stage 4 automatically.

---

# Milestone 2 continuation — 2026-10-18

The user approved Stage 3 routine refinement work only. **Routine functionality and local SQL are implemented/tested, but Milestone 2 is not release-complete: 10 exercise-photo matches and isolated browser acceptance remain open.** No hosted database access/SQL, production writes, credential inspection, deployment, or Stage 4 work occurred. All source, assets, scratch files, compiler cache and local test database files stayed inside `~/fitness-app`. Existing Git history and pre-existing uncommitted Milestone 1/spec work are retained; no commit or history rewrite was made.

## Completed local work

- Reviewed existing rules-2.0, catalog/skill metadata, page/editor/plan/disclosures, owner-filtered repository, installed v1 RPC and all of draft 007 before implementing.
- `rules-3.0` returns one deterministic actual-catalog plan from goal/experience/2–6 requested days. No frequency override, gender/inventory/units/timeline input, assumed equipment ownership, assigned weight or fabricated target/volume. Preserve stable strength anchors, systematic A/B variation and honest catalog/recovery limitations. All new targets are unset.
- Compact collapsed card → preview with session/exercise names. Only one exercise detail is expanded per plan. Use This Routine explicitly saves and reloads after server confirmation; stable ID/request on errors/retries. Customize creates an independent new-ID clone. Cancel clears draft/errors/retry/disclosures, returns to collapsed, sends no write and asks no discard dialog. Save/write/cancel controls are disabled in flight.
- Create My Own Routine works without a profile or catalog; saved goal or general-fitness bookkeeping default. One-session/one-exercise form supports free text, explicit catalog selection, ordered sessions/exercises, rename/remove/reorder, Next Exercise into an unsaved draft, 0–10 optional set rows, varying reps and weights, kg/lb controls. NULL is unset; zero is distinct. Per-implement/band notes preserve loading conventions. Untouched trailing composer is omitted on save; unnamed configured targets fail validation. Planned targets never become performed records.
- Existing v1 aggregates remain readable and unchanged on a plain edit/save. Switching to per-set targets or changing the exercise is explicit and explains clearing the range; exact repetitions are never invented from ranges. Legacy-only saves retain v1. New/mixed plans use v2 without downgrade. Owner filters, exact timestamps, private auth transitions, archive/history and receipt protections retained.
- Reads request ordered nested planned sets and custom fields; pre-007 relationship errors allow legacy-only reads. If per-set rows exist but targets cannot load, fail instead of silently presenting an empty plan. Missing v2 returns an actionable migration-007 error while keeping the draft.
- 007 locally reviewed/finished: remove redundant duplicate parent unique key; reuse installed composite owner key; serialize child-parent mode checks with `FOR UPDATE`; retain inverse guard, all source/mode/bound checks, FORCE RLS and owner-only grants. Caller-privilege v2 preserves per-user locks, versioned hashes, retries, exact edit conflicts, rollback and history versioning; v1 unchanged. Migrations 001–006 were not modified during this milestone; user now describes them as previously applied. No hosted status probe was performed.
- Removed generic movement schematics. Added original short descriptions, 12 visually checked licensed local photographs/static demonstration frames, disclosure-only lazy loading, reserved dimensions, responsive sizing, credit/source/license/change links and required government non-endorsement notices. Detailed per-image rights/provenance/variant/checksum register is `docs/assets/exercise-photo-provenance.json`; runtime mapping is `src/data/exercise-photos.json`.
- Refined graphite/chalk styling with restrained green accents, monospace session rails and a focused editor; no extra route, library dependency, credentialed service or generated demonstration was added.

## Verification and precise limits

- `npm run check`: **346 tests / 18 files passed**, TypeScript passed and production build passed. Includes 32 isolated custom-planning SQL tests (populated 001–006 → 007, preservation/v1 compatibility, both cross-version late retries, rollback, exact conflicts, history versioning, malformed input, NULL/zero/units, anonymous/cross-owner/forged-parent/owner-reassignment denial, all 45 actual-catalog recommendations through v2), UI/rules/repository tests and existing auth/profile regressions. Photo tests verify local JPEG provenance/checksums, dimensions/size, deferred loading and failure fallback.
- `npm run test:db:concurrency`: **9 PostgreSQL 18.4 multi-connection scenarios passed**, after process/socket permission. Preserves the 6 original scenarios and adds v2 duplicate/stale-save contention plus both parent-mode/child-insert blocking orders. Disposable data/sockets/password files stayed in ignored `.test-postgres/`; no Supabase configuration or hosted access.
- `git diff --check`: passed.
- **`npm run check:photos`: FAILED intentionally as a release gate: 12/22 reachable exercises covered; 10 missing.** The normal functional test pass does not clear this gate. Missing: band leg curl, cable triceps pressdown, dead bug, dumbbell hip thrust, dumbbell RDL, seated dumbbell shoulder press, machine chest press, seated leg curl, seated machine row, bilateral standing dumbbell calf raise. Do not change sound selection to fit the available photo pool or claim placeholders fulfill coverage.
- Rejected mislabeled wger drawings/renders/third-party copyrighted upload, Smith-machine squat for free barbell squat, stability-ball/incline press for flat bench, front raise for lateral raise, lying curl for seated curl, single-leg calf variant for bilateral calf, and an ambiguous cropped shoulder press. Some potential official/publisher sources returned 403/404/429. No paid stock, unverified image licenses or unrelated pictures shipped. Candidate research is ignored under `.asset-review/` / `.wger-*`; approved assets and provenance are tracked candidates.
- **Playwright has NOT run for Milestone 2.** A complete exact script is ready in `scripts/milestone2-browser.js`; its contents were displayed and script-specific approval requested with the async input tool. No response/approval has been received. It creates a fresh context, blocks external HTTP/WebSockets, mocks auth/config/repository modules, uses only synthetic sessionStorage and writes project-local screenshots. Covers 320/390/768/1440, short height/CSS zoom, overflow/navigation geometry, preview/details/cancel, custom per-set saves, error/retry, mocked refresh, and hash/history. Execute only after approval of that exact script; revisions need approval under the contract below. Review screenshots, not just metrics. No new screenshot claims are justified yet.
- True hosted create/edit/retry/reload/sign-out/in and two-owner acceptance remain **unverified** until the user separately approves and installs 007 and authorizes appropriate test accounts. No hosted migration probe or live security script was run.

Current review guide and once-only future hosted steps: `docs/MILESTONE_2.md`. Existing refinement guide now carries a historical warning; old “install 004/005” instructions must not be followed. `docs/RECOMMENDATION_EVIDENCE.md` records rules-3.0 boundaries above the historical rules-2.0 register. SPEC.md status updated without discarding its prior edits.

## Next actions within this milestone

1. Obtain exact-script Playwright approval, run isolated browser checks, inspect screenshots and address observed desktop/mobile/zoom issues. Until then, browser acceptance is pending.
2. Acquire and visually/license-verify exact photos for the 10 missing movements; complete provenance/attribution and rerun `npm run check:photos`. No unverified placeholders, changed exercise ranking, purchases or credentialed image services.
3. Present full 007 for separate hosted review/approval. **Do not execute it** merely because local tests pass. 001–006 remain immutable; do not rerun installed migrations.
4. Only after approved hosted installation and authorized test-account work verify real persistence and isolation. Stage 4 remains unstarted and needs explicit approval.

---

# Milestone 1 continuation — 2026-10-18

The user resumed work scoped ONLY to navigation/scrolling and the five-field profile. The historical handoff below remains context; its pause and broad next-step list do not authorize subsequent milestones.

Implemented locally: bounded authenticated shell, independent sidebar/main scrolling, reserved mobile navigation, removed sidebar motivational/profile decorative panels, route/history scroll reset and delayed hash focus for lazy content. Profile now edits only name, required unselected gender (including Prefer not to say), goal, experience and 2–6 training days. Saves send only these fields, detected timezone and owner ID; hidden data is omitted, with missing defaults retained for inserts. Legacy NULL gender is preserved until explicit save. Missing schema produces a truthful migration-006 setup error, no fallback write.

006 reviewed: additive nullable checked gender, no backfill/default/policy/grant changes. Tested ONLY in disposable in-memory PGlite after populated 001–005. Hosted 006 remains unapplied and needs separate approval. 007 was not changed or executed. No hosted access, credentials, installed migrations, routine behavior, saved production data or Git history changed.

Verification: `npm run check` passed 307 tests across 16 files, TypeScript and production build. Includes profile validation/narrow payloads, existing auth/routine regressions, route/history/hash behavior and local database upgrade/constraints/ownership preservation. `git diff --check` passed. Browser viewport/zoom/screenshots and true hosted acceptance are still unverified. Before new unsafe Playwright execution, follow the exact-script approval contract below. Native routine concurrency was not rerun because no routine save path changed.

Next scope requires user approval: single recommendations/save-cancel, custom planning/007 and exercise photos. Do not begin them automatically.

---

# Fitness App — complete Stage 3 handoff

Updated 2026-10-18. **Paused at the user's handoff checkpoint. Stop after this documentation update and wait for the user.** This checkpoint authorizes NOTES.md changes only: no additional features, application behavior changes, tests that access hosted services, or hosted SQL.

## Scope, approvals and source of truth

- Existing React + TypeScript + Vite + React Router application with Supabase authentication, profiles and routine planning. Continue this application; do not rebuild it.
- SPEC.md §20 defines the latest approved Stage 3 simplification and supersedes conflicting historical equipment questionnaires, multiple recommendations and exercise schematics. The user approved local implementation and then clarified that exercise photos should be small and appear when an exercise is opened, like the supplied reference. No video playback is requested.
- Gender is **required in the new form**, with Woman, Man, Non-binary and Prefer not to say. This supersedes the earlier optional-gender request. No response should be preselected. Untouched legacy database NULL values remain valid until the next profile save. Gender must not influence exercise choice or assumptions about strength.
- The latest plan is approved, but **almost all latest application work is still only planned**. Prior Stage 3 functionality is implemented. Only local SQL drafts 006/007 have been started for the latest scope; they are not tested or integrated.
- User explicitly confirms migrations **001–005 are already applied** to hosted Supabase; confirmation of 004/005 arrived on 2026-10-18. Do not rerun or edit those migration files. Installation confirmation is not evidence of live saving or isolation acceptance.
- New hosted SQL always needs separate explicit approval. No hosted SQL or production data access was performed during the latest work. No hosted changes are authorized by the local implementation approval.
- Keep project operations inside `~/fitness-app`. Preserve authentication, RLS, user privacy, all existing profile/routine/history data, catalog/evidence and Git history. Never expose environment values, private user records, passwords or service-role credentials.
- Stop and ask before hosted database changes, potentially destructive operations or new services requiring credentials. Do not publish/deploy, purchase assets or add a credentialed service under this approval.
- **Stage 4 remains unstarted and unauthorized.** Planned sets/reps/weights are future targets, never completed workout records.

## Working tree and tested Git milestones

At handoff inspection, `git status --short` showed:

```text
 M NOTES.md
 M SPEC.md
?? supabase/migrations/202610180006_profile_gender.sql
?? supabase/migrations/202610180007_custom_planning.sql
```

No application source files are modified for the latest simplification. SPEC.md contains uncommitted plan/approval/migration-status updates; leave them intact. The SQL drafts are untracked and must not be mistaken for installed, reviewed or tested migrations. This handoff changes NOTES.md only and creates no commit.

Latest existing commits, preserved:

| Commit | Existing milestone |
| --- | --- |
| `126b359` | Mobile/layout refinement and previous Stage 3 acceptance guide; current HEAD |
| `1992c88` | Personalized routine splits, expanded exercise catalog/evidence |
| `97b68c2` | Compatible frequency profile and equipment confirmations |
| `17bea61` | Dark fitness interface and planning dashboard |
| `6376d58` | Earlier project handoff |
| `e80df1e` | Save validation, retry and concurrency hardening |
| `7c24058` | Routine planning editor and saved-routine management |
| `e907684` | Initial routine recommendations and atomic-save migration |

Future implementation should use tested milestone commits; do not rewrite or discard earlier commits.

## Implementation status: what exists versus what remains

“Implemented” below describes current local code and previous verification, not completed hosted acceptance. “Partial” means useful earlier behavior exists but does not meet the latest contract.

| Area | Status | Current behavior and missing work |
| --- | --- | --- |
| Existing authentication/Supabase integration | Implemented baseline | Existing auth provider, callbacks/recovery routes, owner-filtered reads and server-confirmed save feedback. Preserve these. Full live acceptance remains pending. |
| Dark/charcoal/beige design, shared UI, dashboard | Implemented baseline / partial latest scope | Responsive cards, local licensed decorative photography, short approved dashboard/routine copy. Still needs compact shell, reduced large blocks and independent scrolling. |
| Navigation/scrolling | Partial | Desktop sticky menu plus separately flowing sidebar note; mobile in-flow navigation. Latest bounded sidebar/main scroller is not implemented. |
| Frequency and timezone | Implemented baseline | 2–6 days/week, no weekday checkboxes, automatic timezone detection/UTC fallback; legacy weekdays preserved. NULL frequency requires explicit selection, with legacy count only a suggestion. |
| Five-field profile and gender | Planned; SQL draft only | Current UI still asks equipment, support details, review timeline and units, has decorative panels and no gender. Current save spreads the normalized profile; narrow visible-field writes are not implemented. |
| Recommendations | Implemented `rules-2.0`; latest selector planned | Equipment/support-aware options, goal/experience ranking, stable anchors and A/B variation. Current output can contain up to three options. One equipment-independent `rules-3.0` choice is not implemented. |
| Exercise disclosures | Partial | Arrows show original technique notes, muscles, requirements/loading conventions and generic SVG movement schematics. Compact real exercise photos are not implemented. |
| Preview/Use/Customize/Cancel state model | Partial / planned | Opening currently does not save. Current Customize opens an editor; native disclosures remain uncontrolled, Cancel uses confirmation and does not reset/collapse the recommendation. No dedicated Use This Routine acceptance flow. |
| Custom routine creation | Partial | Existing catalog-only routine editor supports sessions, aggregate sets/rep ranges/rest and explicit save. Creation/editing currently depends on a profile. Free-text names, per-set targets and profile-independent creation are not implemented. |
| Persistence | Implemented v1; v2 only drafted | Atomic legacy RPC, retry receipts, optimistic timestamps, archive/history versioning. TypeScript types/repository still require catalog IDs and aggregate targets; no custom/planned-set reads or v2 calls. |
| Catalog and evidence | Implemented baseline | 30 exercises, 10 sources, 30 directional alternatives after installed 005. Preserve records/IDs. No further catalog expansion is automatically needed. |
| Latest tests | Planned | No tests yet for 006/007, required gender, latest state model, free text, planned sets or photo coverage. Previous suite does not validate these changes. |

### Prior implemented programming behavior to preserve where compatible

`rules-2.0` filters actual loaded catalog records by equipment/support and beginner suitability, ranks by goal/experience/loadability, uses workout-family occurrence counts for purposeful variation, retains strength anchors and distributes weekly pattern budgets. It persists rule version, rationale/evidence and primary-muscle set totals. Existing saved snapshots are never regenerated from changed profile inputs.

Current splits: 2/3 sessions Full Body A/B/C; 4 Upper A/Lower A/Upper B/Lower B; experienced 5 Upper/Lower/Push/Pull/Legs; experienced 6 Push/Pull/Legs A/B. Beginners requesting 4–6 currently receive an explicit three-session starting alternative. **That mismatch is historical behavior, not the latest approved target:** the new selector must respect the requested session count with appropriate programming and honest limitations.

New plans already use ordered labels/null weekdays. Saved legacy weekdays and aggregate target ranges remain readable and must not be silently rewritten.

## All approved latest Stage 3 requirements

### Interface and navigation

- Retain the original dark/charcoal/beige identity inspired by the Dribbble reference, without copying its design or assets. Keep it minimal, gym-focused and technological, with concise powerful labels, rounded reusable controls, compact cards and responsive layouts.
- Preserve dashboard, profile, recommendations, saved routines and exercise details on the existing navigation/pages. Avoid unnecessary screens, long explanations, crowded layouts and extra confirmation interactions.
- Use a bounded desktop viewport shell with stable header/sidebar and independent main-content scrolling. Remove the large motivational sidebar panel and excessive hero/decorative space. On short heights/zoom the sidebar may scroll within its own region rather than overlap.
- Reserve space for compact mobile navigation; do not overlay page controls. Maintain readable type, focus visibility, route-scroll reset, hash links and browser history with the new scroll container.

### Profile

- Ask only Name, required Gender, Fitness goal, Training experience (Beginner/Intermediate/Advanced), and Training days per week (2–6), with a clear Save Profile button and success/error feedback.
- No equipment/support details, units, review timeline, weekday or timezone questions. Detect timezone automatically.
- Patch only visible editable fields plus detected timezone/owner identity. Do not overwrite hidden existing values from a stale full-profile object. New profiles use database defaults for retained legacy fields. Never delete old columns or data.
- No gender preselection/backfill; Prefer not to say is a valid explicit selection. Existing NULL remains untouched until a profile save. Recommendation inputs exclude gender and hidden inventory fields.

### One recommendation and explicit save/cancel

- Show one deterministic best-matched routine based on goal, experience and frequency using actual loaded catalog records and credible programming principles. “Best matched” is an app heuristic, not a validated personal optimum.
- Do not infer equipment ownership. Show each exercise's actual equipment/support requirements. Do not prescribe a weight; users choose their own sets/reps/weights.
- Retain stable progressively loadable anchors and purposeful variation, not random changes or identical sessions caused by indexing. Advanced users should receive suitably challenging choices; experience never implies a particular load.
- Use mutually exclusive collapsed, preview, customizing, creating and saved-plan-editing states. Opening/viewing/typing/disclosures never save.
- Preview offers Use This Routine, Customize and Cancel. Use explicitly saves an owned exercise-only plan with targets unset and reports success only after server confirmation.
- Customize deep-clones the recommendation into a new unsaved routine ID; do not mutate the original or an existing saved plan before Save. Editing an existing plan retains conflict/history protections.
- Cancel directly discards draft/error/retry state with zero writes and restores the recommendation's original collapsed state. Disable cancellation/write actions during an in-flight save; do not promise to undo an already submitted commit. Failures retain the draft and stable retry token.

### Custom routine planning

- Clear Create My Own Routine option, available even without a completed recommendation profile. Use saved goal if available, otherwise general fitness only as bookkeeping.
- Enter routine name, add ordered workout sessions, type any exercise name freely, add exercises with Next Exercise, add per-set rows with Add Set, and explicitly Save Routine or Cancel.
- Each set may have different target reps and planned weight. Units belong beside weight controls, not on the profile. Distinguish unset from zero; blank values remain NULL.
- Optional catalog suggestions must be selected explicitly. Free text becomes a private custom name on an owned routine row, never an inferred catalog match or public catalog insert.
- Preserve old aggregate set/rep ranges/rest without inventing exact per-set values. New planning targets are not completed performance logs. Leave performed-workout tables unchanged.

### Real exercise photography

- On opening an exercise, show a small real photo plus short description so the name is understandable. The user's supplied photo-card reference is interaction inspiration, not an image license. Do not add a fake video/play button.
- Every exercise reachable from the new recommended selector needs an accurate, rights-cleared photo of the actual exercise/variant. Verify visually and record source, author, license, attribution and permissions in a local asset manifest/credits register.
- Use lightweight local responsive assets, lazy loading and reserved aspect ratios. No arbitrary external hotlinks, copyrighted scraping, unverified bulk image-license claims, generated/stick-figure substitutes or decorative gym photos standing in for specific movements.
- Audit reachable recommendation IDs and test complete photo coverage. Report missing rights/variant coverage before release; do not change sound exercise selection merely to fit available imagery. Neutral placeholders are appropriate for custom/old nonrecommended exercises or image-load failure, not completed recommended-photo coverage.

### Compatibility, evidence and verification

- Preserve authentication, Supabase integration, saved profiles/routines, history, RLS/ownership, catalog/evidence and Git commits. New local forward migrations only; no edits to installed SQL.
- Use peer-reviewed publications and ACSM/NSCA guidance as primary evidence; Menno Henselmans and Legion Athletics as supplementary. Document individual publications and rule limitations. Avoid unsupported gender assumptions or claims that advanced means a fixed load/volume.
- Test profile preservation/required gender, single-selector invariance to gender/hidden equipment, opening and Cancel with zero writes, explicit Use/error/retry, Customize immutability, free-text/custom/catalog mixtures, different per-set targets, reload/auth transitions, atomic rollback, legacy receipts/history and owner isolation.
- Run automated tests, TypeScript and build; extend relevant native contention tests for the new save path. Test desktop/mobile navigation and scrolling with isolated Playwright. Keep mocked and local-DB verification separate from real hosted acceptance.

## Migration inventory and pending database approval

| Migration | Purpose | Local status | Hosted status |
| --- | --- | --- | --- |
| `202610170001_schema.sql` | Original owned schema, RLS/grants and planning/history tables | Existing committed migration | Applied, user confirmed; do not rerun |
| `202610170002_reference_seed.sql` | Original exercise/source/alternative catalog | Existing committed migration | Applied, user confirmed; do not rerun |
| `202610170003_routine_save.sql` | Atomic legacy save RPC with validation, retries, conflict/history protections | Existing committed migration; v1 remains authoritative in current app | Applied, user confirmed; full live saving/isolation verification pending |
| `202610180004_profile_frequency.sql` | Nullable checked training frequency and equipment details; no backfill | Existing committed migration | Applied, explicitly user confirmed 2026-10-18; do not rerun |
| `202610180005_catalog_expansion.sql` | Add 18 exercises, 7 sources, 18 alternatives without overwriting seed rows | Existing committed migration; generated from `src/data/catalog-expansion.json` | Applied, explicitly user confirmed 2026-10-18; do not rerun |
| `202610180006_profile_gender.sql` | Nullable constrained gender column; frontend will require explicit choice | **Untracked local SQL draft**, not tested/reviewed/integrated | Not applied; **separate explicit approval pending** |
| `202610180007_custom_planning.sql` | Custom exercise source, planning mode, owned planned sets and atomic v2 RPC | **Untracked local SQL draft**, not tested/reviewed/integrated | Not applied; **separate explicit approval pending** |

006 currently contains a transaction adding `profiles.gender` with `woman`, `man`, `non_binary`, `prefer_not_to_say`; legacy NULL is allowed. It does not implement form validation or narrow profile writes.

007 currently drafts:

- Catalog ID XOR bounded private custom name on `routine_exercises`; `planning_mode` defaults to `legacy`.
- Relaxed NOT NULLs for catalog ID and aggregate targets, guarded by source/mode CHECKs. Legacy mode still requires valid existing aggregate targets; per-set mode requires aggregate targets NULL.
- `routine_planned_sets` with ordered position, nullable positive reps, nullable nonnegative `load_kg`, entered unit, composite owner/parent FK, force RLS, owner-only policies/grants and parent-mode triggers. Zero child rows support exercise-only acceptance.
- Caller-privilege `fitness_save_routine_v2`, strict custom/per-set JSON validation, transaction rollback, same per-user advisory lock, versioned fingerprint, cumulative retry receipts, exact timestamps and history-preserving versioning. Existing v1 is retained; completed-session tables are not changed.

These are draft intentions and SQL text, **not verified guarantees**. Before review/hosted approval, test the populated 001–005 upgrade, direct-write constraints/RLS, parent-mode trigger contention, anonymous/cross-owner denial, v1 compatibility and late receipts, v2 retries/stale conflicts/rollback/history, target scalar bounds and all catalog/custom source combinations. The SQL was initially adapted from v1; inspect it rather than assuming correctness. Do not silently downgrade v2 saves to v1 or drop custom targets when capabilities are missing.

When ready, present the complete reviewed 006 then 007 files and precise once-only SQL Editor steps for separate approval. No approval to execute either has been received. Existing 001–005 must remain unchanged and must not be reapplied. Do not run even a hosted migration probe under the current local-work approval.

## Code map for resuming implementation

- `src/App.tsx`, `src/styles.css`, `src/components/ui.tsx`: app shell/navigation, layout overrides and shared controls; change scroll ownership carefully, preserving route focus/hash behavior.
- `src/features/dashboard/DashboardPage.tsx`: compact existing dashboard; counts are plans/preferences, not invented workout activity.
- `src/features/profile/ProfilePage.tsx`, `profile.ts`: current large form, normalization, legacy validators/defaults and full-object upsert. Add gender and visible-field validation/patch without clearing hidden data.
- `src/features/routines/recommendations.ts`, `exerciseMetadata.ts`: current rules 2.0, suitability/equipment metadata; replace selection contract without altering saved snapshots or falsifying equipment availability.
- `src/features/routines/types.ts`, `routineValidation.ts`: catalog-only aggregate prescription model; needs explicit legacy versus new per-set/custom representation and validation.
- `src/features/routines/RoutinesPage.tsx`: current options/native details/profile-gated creation and confirmation-based cancel; implement explicit state transitions in place.
- `src/features/routines/RoutineEditor.tsx`: current catalog selector and aggregate targets; extend to free text and per-set targets while preserving legacy ranges and retry behavior.
- `src/features/routines/RoutinePlan.tsx`, `ExerciseInfo.tsx`: current plan disclosures and SVG schematics; new small photo/description mapping goes here.
- `src/features/routines/repository.ts`: owner-filtered workspace reads, v1 RPC and optimistic archive. Currently reads no planned sets and maps no custom fields. Preserve server-only receipt stripping and exact timestamp strings; add safe capability handling/new reads/save adapter without pretending unsupported data was saved.
- `supabase/tests/schema.test.ts`, `refinement.test.ts`: existing isolated PostgreSQL tests. Add 006/007 coverage separately without erasing old-RPC regression tests.
- `scripts/test-routine-concurrency.mjs`: existing native multi-connection tests, disposable local database.
- `docs/STAGE_3.md`, `docs/STAGE_3_REFINEMENT.md`, `docs/ROUTINE_SAVE_REVIEW.md`: historical guides. **The refinement guide still says to install 004/005 and describes multiple equipment-aware options/schematics; those instructions are obsolete.** Use this handoff and SPEC.md §20 for current state; update old guides during a later authorized implementation milestone, not this checkpoint.

## Evidence and photo sourcing state

`docs/RECOMMENDATION_EVIDENCE.md` records individual sources: ACSM 2026 (full text previously accessed), Currier 2023 network meta-analysis, Kassiano 2022 variation review, Ramos-Campo 2024 split/full-body review, Baz-Valle 2019 primary trial and NSCA 2023/2025 professional education. Menno Henselmans/Legion are supplementary. Exact splits, rankings and volume/rep/rest defaults are disclosed app heuristics; evidence does not establish a universal optimum. Review the register when implementing new rules rather than inventing stronger claims.

`docs/ASSET_CREDITS.md` covers existing decorative fitness photography/fonts, not complete exercise-photo coverage. Initial research found a candidate [barbell squat photo by Nenad Stojkovic on Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Woman_doing_squat_workout_in_gym_with_barbell.jpg), listed under CC BY 2.0. It is only a candidate: no exercise-photo asset has been downloaded for this scope, the exact variant has not been visually approved and no complete rights/coverage manifest exists. Do not claim photo work complete or infer licenses from unrelated image collections.

Band exercises currently use database loading type `external`; future logging must distinguish band identity/setup from measured kilogram tension. No Stage 4 logging work is authorized here.

## Recorded tests and limits

**Historical last verified milestone, before the current untracked SQL drafts:**

- `npm run check`: **290 tests / 16 files passed**, TypeScript passed and production build passed. Earlier checkpoints reported 225/243/285 tests as scope grew. Preserve the latest recorded result without implying a fresh run.
- `npm run test:db:concurrency`: **six native PostgreSQL 18.4 multi-connection scenarios passed**, after required process/socket permission. Disposable files/sockets stayed in ignored `.test-postgres/`; no hosted Supabase configuration/access.
- Existing upgrade tests covered populated 001–003 → 004/005, preserving profile values, schedules, routine IDs and receipt metadata; new bounds/RLS, read-only catalog/source completeness; 135 recommendation documents saved through actual local v1 RPC semantics across goal/experience/frequency combinations.
- Existing rule tests covered loadable advanced choices, A/B variation/shared anchors, weekly budgets, 31 nonempty broad equipment combinations with support variations, deprecated entries, determinism and timeline/weekday invariance. Auth/profile/routine UI tests covered errors/retries, account-switch clearing, archive/history and ownership.
- Existing exact-approved isolated Playwright script produced six 1440px/390px screenshots using synthetic auth/repository data, a fresh browser context, localhost-only requests and blocked external requests/WebSockets. Prior review found no horizontal overflow or mobile navigation overlay in those captured collapsed states, and larger supporting text. This does **not** resolve the subsequently identified desktop scroll/sidebar collision or test the latest planned UI.
- Screenshot files were confirmed present at handoff: `preview-dashboard-1440.png`, `preview-dashboard-390.png`, `preview-profile-1440.png`, `preview-profile-390.png`, `preview-routines-1440.png`, `preview-routines-390.png`, all ignored at project root. Reruns can replace them; do not commit personal browser artifacts.

**Not verified:** 006/007 syntax/upgrade/security/concurrency, latest profile/state/editor/selector/photos, new layout acceptance, true hosted save/edit/archive/retry/reload/sign-out/in persistence, two-account hosted read/write/RPC isolation, live recovery/email delivery and full manual keyboard/screen-reader acceptance. Migration installation 004/005 is confirmed by the user and is no longer an open item. Build previously emitted a non-blocking main-chunk-size advisory.

No automated tests, build or browser script were run during this handoff; only read-only inspection and NOTES.md editing. A whitespace check is documentation validation only, not application verification.

## Playwright permission and isolation contract

Before any new `playwright.browser_run_code_unsafe` execution, show the **complete exact script**, explain its actions and ask for permission. Earlier approval applies only to the exact previous script, not revised interaction tests. Do not silently alter it to permit external traffic, use a real auth session or read production data.

New proposed testing must use fresh contexts, synthetic profiles/catalog/routines, mocked persistence and localhost-only routing; block external HTTP/WebSockets, do not read real credentials/storage, write production data or visit unrelated sites. Mock refresh/sign-in persistence is separate from hosted acceptance. Seek approval for the complete revised script when it is ready.

Required coverage: widths 320/390/768/1440, short viewport heights and zoom; long/short main content with stable sidebar/mobile navigation; no text/phrase overlap; readable spacing and controls; focus/hash/history; exercise expansion/photo sizing; preview/open/Use/customize/create/cancel/reset; no writes on opening or cancellation and accurate feedback. Review screenshots and report paths/issues, not just overflow metrics.

## Known issues and next implementation steps — after the user resumes

Known gaps are the status table above: desktop sidebar collision risk, document-wide scrolling, overly large/wordy blocks, excessive profile fields/full-object writes, multiple equipment-dependent recommendations, frequency override for some beginners, uncontrolled disclosures/cancel reset, catalog-only/no-weight editor, profile-gated creation, no real exercise-photo coverage and no frontend v2 support. Local SQL drafts require review/tests before use. No hosted failure is newly diagnosed; live behavior remains unverified.

When the user explicitly resumes:

1. Recheck SPEC.md §20, this handoff and working tree. Keep 001–005 installed/unchanged; review the existing untracked drafts rather than creating duplicate migrations. No further implementation approval is needed for the already approved local scope once this pause is lifted.
2. Review/test 006/007 with populated legacy data and v1 regression/security/concurrency cases. Refine locally as needed; keep completed-workout tables unchanged. Prepare exact SQL and a separate hosted-approval checkpoint before execution.
3. Implement the compact bounded shell, narrow five-field profile and typed legacy/per-set/custom state contracts. Retain old-schema reads and give truthful setup errors for unavailable saves; no silent data loss.
4. Implement one selector based only on goal/experience/frequency, explicit preview/Use/customize/create/edit/cancel transitions and the shared free-text/per-set editor. Connect explicit saves and owner-filtered reads to tested v2 persistence; preserve v1 compatibility/history and error/retry drafts.
5. Source/verify locally stored real photos for every reachable recommended exercise; update credits/manifest and evidence-to-rule documentation. Add complete photo-coverage tests and report any unresolved licensing/variant gap.
6. Run all relevant UI/rules/profile/repository/upgrade/RLS tests, TypeScript/build and native contention checks. Create commits after tested milestones. Obtain approval for complete new isolated Playwright code, execute it only after approval, then review desktop/mobile/zoom/scroll screenshots and report observed issues/paths.
7. Update historical guides and final handoff. Only after separate approval/installation of reviewed 006/007 perform approved hosted acceptance with appropriate test accounts; never request passwords in chat. Distinguish implemented features, local evidence and unverified live acceptance. Do not start Stage 4.

**Current stopping point: handoff updated; wait for the user. Do not continue implementation automatically.**
