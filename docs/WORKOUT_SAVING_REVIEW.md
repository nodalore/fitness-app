> Superseding status: user reports migration 008 hosted saving is successful. The separate read-only History milestone is implemented locally; see SPEC.md §23 and NOTES.md. The unapplied/History-deferred language below records the earlier pre-install review. The reviewed migration file remains unchanged.

# Workout saving/resuming/finishing — local review

2026-10-18. User approved implementing the saving milestone and local tests. **Migration 008 is a local draft and has NOT been executed against hosted Supabase.** No hosted queries, account access or writes occurred in this implementation. Installed 001–007 and the `stage-3-stable` branch remain unchanged. Workout History UI is deferred until saving/resuming acceptance.

## Migration 008

Review the complete file: `supabase/migrations/202610180008_workout_saving.sql`. It is a single transaction; do not combine with/reapply 001–007. It must receive separate hosted approval.

- `workout_sessions`: additive revision, update time and source-version/day-position metadata; owner, routine/day composite FKs, existing name snapshots and status remain. A partial index supports unfinished-workout lookup.
- `session_exercises`: nullable catalog ID/loading mode supports free-text movements without fake catalog entries or guessed loading conventions. Existing values remain unchanged. Add original-name snapshot, skipped and removed flags. Existing target_snapshot preserves original prescription metadata independently of actual values.
- `workout_sets`: nullable reps permit an explicitly added set to persist while its details are entered. No reps/weights are fabricated. New entered_load stores the displayed weight, while load_kg retains its existing numeric precision. The server derives normalized kg from entered weight/unit; older rows with NULL entered_load retain their existing kg/unit values. New actual-load, rep-bound and custom-name constraints are NOT VALID to preserve legacy rows; they still check new/updated rows.
- New owned `workout_save_receipts` has FORCE RLS and a composite owner/session FK. Authenticated access is SELECT-only under owner RLS; INSERT/UPDATE/DELETE are denied. The validated save RPC alone writes receipts. The session FK uses NO ACTION, preventing direct parent deletion from erasing retry evidence; account deletion still cascades through a direct auth-user FK. Anonymous access is denied. Receipt identity/payload hash prevents accidental changed-token reuse; retries acknowledge their original result without rewriting later data. A response also reports current revision/status, so replaying an earlier successful autosave cannot rebase queued edits over a newer/completed workout.
- Existing owner policies/grants on workout/planning tables are not relaxed. New caller-privilege, empty-search-path guards lock each parent workout for child changes and advance its revision. Completed workouts reject application-role edits/deletion, including direct child writes. Finishing checks valid reps, applicable weight and at least one included performed set. Server triggers derive completed flags and recompute them when exercise loading mode or disposition changes. Catalog loading modes cannot be spoofed. Skipped/removed exercises are excluded from counts/finish validation but retain their draft values.
- `fitness_save_workout` is SECURITY DEFINER with a fixed empty search_path and authenticated-only EXECUTE. This narrowly trusted writer is necessary to keep receipts unwritable by clients; it validates bounded JSON, derives owner from auth.uid(), and additionally compares an expected account ID. That comparison prevents a stale in-flight request from creating an independent workout under an account signed into afterward; it does not let clients select another owner.
- A shared account advisory lock coordinates with installed routine-save RPCs. Row locks/revisions protect edits. Starting validates the real owned routine-day ID, position and exact routine version, and snapshots authoritative names. Routine history FKs/versioning remain intact. A full snapshot saves transactionally, with stable child IDs; foreign/colliding IDs fail instead of being upserted into another workout.
- Draft start time preserves the captured finite timestamp. Completion time is server generated and no earlier than start. Exact retry IDs prevent repeated finishing. An ordinary new submission against a completed workout is rejected.

The populated-upgrade test verifies unchanged original values across profiles, routines, days, prescriptions, planned sets, catalog, sessions, historical exercises and actual sets. No data normalization/backfill or historical-row updates run during migration. Existing v1/v2 routine RPCs remain intact.

## Frontend behavior

Today’s Workout remains under My routines. The Stage 3 read model now retains persisted routine-day IDs outside the editable routine document. Explicit selection creates one workout ID; Add set creates a stable actual-set ID and records an incomplete draft row until valid reps and applicable weight are entered, without any Done control. Exercises start with zero actual sets. Planned targets never populate actual results.

Autosave waits 400ms after a change. One request runs at a time; later edits queue as the latest snapshot. Network operations time out after 20 seconds. Error/timeout retries reuse the exact pending payload/request ID and then save any newer queued input under the acknowledged revision. Conflicts stop automatic writes and require explicit server-version review; no automatic merge overwrites another tab.

Saving… / Saved to Supabase / Not saved / Save conflict indicators distinguish pending, acknowledged and failed writes. Retry saving is explicit after a failure. Before 008 installation, missing RPC errors explain setup and keep recovery rather than dropping actuals or calling the routine save RPC.

Unsent snapshots and pending request metadata are stored under an account-specific local recovery key. No auth credentials/tokens are stored there. Confirmed saves remove clean recovery entries. Account/route unmount closes the old queue, stops new writes and clears private UI state; it retains unsent account-scoped recovery for that user to recover after signing in again. Another account never loads that key. This is limited crash/network recovery, not general offline synchronization. Storage failures are reported; users should keep the page open until server saving is confirmed. Device-local recovery data is not an encrypted backup.

My routines lists unfinished server workouts and recoverable unsent drafts. Resume restores exact IDs, entered unit/weight/reps, exercise order and substitution/skip/removal metadata. Save & choose session flushes changes and returns to selection without deleting the unfinished workout. Pending exercise-name input must be added/cancelled first.

If a source routine changed before the first save ever reached the server, recovery remains intact. The user may explicitly save the captured workout independently, using its names/actuals with NULL routine/day links. It retains the same workout ID, checks for an existing server copy first and does not silently attach a different routine or create a second session.

Finish Workout becomes available after confirmed saving. It validates included set reps and applicable weight, blocks pending exercise-composer input, and shows a concise performed exercise/set summary. The editor is frozen during confirmation/submission. Confirm finish writes the same workout to completed status atomically; lost responses retry identically. Partial workouts are valid; empty completion is not. History records are prepared and immutable, but there is no Workout History navigation/page yet.

## Local verification

- `npm run check`: **445 tests / 24 files passed**, TypeScript passed, production build passed.
- `npm run test:db:concurrency`: **18 native PostgreSQL 18.4 scenarios passed** (12 existing plus 6 workout-specific). Local process/socket escalation was needed; credentials/data were disposable inside this project.
- `git diff --check` passed; installed migrations 001–007 have no diff. `stage-3-stable` remains `24be6832b37180e8846fbe1c832847238f6599f1`.

New tests cover populated upgrades, exact custom/actual roundtrips and units, stable IDs, set changes/removals, substitutions and skipped/removed/additional exercises, rollback, malformed payload rejection, direct constraints, ownership/RLS, stale account requests, idempotent/late retries, finish validation/immutability, autosave queue races, timeout/network recovery, refresh/resume UI, single finish submission and original routine preservation.

## Remaining acceptance / stop point

1. User reviews the entire 008 SQL file and separately approves hosted application. Nothing here authorizes its execution.
2. After user-confirmed installation, use separately approved test accounts/data to verify hosted start → autosave → refresh → sign-out/in → resume → corrections → finish, including units, custom names, failure/retry and two-account isolation. No real hosted routines/history should be modified automatically.
3. Browser desktop/mobile/short-viewport/zoom/touch/focus verification remains pending. No new Playwright script was run; existing exact-script approval requirements still apply.
4. Completed-history interface, pagination/cards/details and navigation are the next milestone only after saving/resuming acceptance. No charts, analytics or Stage 5 work was started.

Concurrency conflicts deliberately preserve the recovery copy. If another tab already finished a workout, its completed record cannot be overwritten; unsent conflicting edits cannot be merged into it. The UI reports when no unfinished server copy exists. Do not interpret an old retry acknowledgment as permission to reopen completed history.

## Final focused security review — 2026-10-18

Three regressions reproduced before correction: own receipt insertion could forge a save acknowledgment; incomplete draft rows were marked completed; weighted sets could finish without weight. The unapplied 008 now closes each boundary. Custom exercises expose a compact weight-entry selector so users explicitly choose bodyweight when no external load applies. Zero external load remains distinct from missing weight.

The save RPC now runs as its trusted migration owner. It derives ownership from auth.uid(), checks expected account identity, scopes owned reads/deletes to that identity, rejects completed-session submissions and uses no dynamic SQL. Collision tests prove foreign session/exercise/set IDs cannot overwrite another owner's records. Existing table RLS remains enabled and unchanged; direct authenticated receipt writes are denied. No client-controlled role flag grants access.

Focused PostgreSQL tests: **28 passed**. Direct authenticated attempts cover forged receipts and completed root/child insert/update/delete; exact snapshots survive routine edits, archival, blocked referenced deletion, and successful unreferenced-version deletion. Account cleanup remains an intentional administrative cascade. Native concurrent receipt-forgery/retry testing also passed.

Future Workout History retrieval must require parent status = completed, exclude skipped/removed exercises, and count only server-valid completed sets. Valid sets inside unfinished sessions do not make those sessions history. Incomplete rows can persist for resume, but cannot finish or appear as completed-history work. No History interface was introduced.

**Local installation readiness:** no remaining blocker found by this review. The corrected file requires separate hosted approval and post-install test-account acceptance; hosted behavior is not verified. These review corrections are included in the Stage 4 security checkpoint on top of the saving implementation commit.
