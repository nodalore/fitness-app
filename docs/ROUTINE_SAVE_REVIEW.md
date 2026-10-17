# Final review: routine save migration

Reviewed locally on 2026-10-17. No Supabase requests, hosted SQL, or hosted data changes were made during this review. Apply only the final checked-in `supabase/migrations/202610170003_routine_save.sql` after your own review and approval.

## Findings and exact fixes

| Finding in the previous draft | Final change | Verification |
| --- | --- | --- |
| JSON objects could become text names, and numeric strings could be accepted as numbers through casts | Explicit JSON type and required-field checks before writes; strict name/goal/weekday/notes/metadata validation; integer ranges; unknown routine/day/prescription fields rejected | Regression tests first reproduced the coercions, then passed after correction; malformed/null/fractional/range cases covered |
| Only the most recent save token survived, so retrying an earlier successful request after another edit failed | Store a cumulative `_save_receipts` map in existing `routines.assumptions`, keyed by request UUID; earlier successes remain recognizable without replaying their writes | Tests retry creation and version creation after subsequent edits, without reverting the latest plan |
| The fingerprint omitted the edit precondition | SHA-256 fingerprint includes the routine ID, normalized document, and expected timestamp represented as epoch seconds | Reusing a token with a changed document or timestamp is rejected |
| Client assumptions could carry internal retry fields | Strip `_save_receipts`, `_save_request_id`, and `_save_payload_hash` from input before hashing or writing; preserve receipts from the stored row only | Forged input receipts are ignored; the frontend repository excludes those fields from editable documents |
| `now()` in the existing timestamp trigger is transaction-start time and can produce identical or backward conflict tokens | Replace `fitness_touch_updated_at()` so routine updates use `greatest(clock_timestamp(), old.updated_at + interval '1 microsecond')` | Two updates within one transaction receive distinct versions; a second editor with an old timestamp is rejected |
| A replay must not depend on an exercise still being available today | Validate document shape/UUID syntax before retry lookup, and check catalog availability only for new writes | An earlier success remains replayable after catalog deprecation; a new save using the deprecated exercise fails |
| Very large or loosely shaped metadata/prescriptions were not bounded at the RPC boundary | Add a 2 MiB document limit, 100-character optional template/version metadata limits, and explicit count/string checks | Oversized documents, days, exercises, notes, and metadata are rejected |

The input count/range limits are product bounds, not scientific prescriptions. Valid integer-valued JSON numbers such as `2.0` are accepted as numbers; strings such as `"2"` are rejected. Missing optional weekday maps to unscheduled/null. Missing optional notes maps to an empty string. Assumptions may be omitted and default to an object; explicit non-object assumptions are rejected.

## What the migration changes in Supabase

The file is still one transaction (`begin` through `commit`). It:

1. **Replaces the existing function** `public.fitness_touch_updated_at()` used by the existing profile/routine triggers. Only the routine branch changes: it generates strictly increasing edit tokens. Profile updates retain the original `now()` behavior. Existing trigger definitions are not replaced.
2. **Creates** `public.fitness_save_routine(uuid,jsonb,uuid,timestamptz)` with the same API signature as the previous draft.
3. Revokes direct execution of the timestamp helper from `PUBLIC`, `anon`, and `authenticated`, preserving the prior restriction. Revokes default/public/anonymous save-RPC execution and grants save-RPC execution to `authenticated` only.

It creates **no tables, columns, indexes, or extensions**, changes **no RLS policy**, and rewrites **no existing application rows** when applied. Future RPC saves store receipt metadata in the already-existing JSON assumptions column. Both functions are `SECURITY INVOKER` with an empty search path. All application relations and `auth.uid()` references are schema-qualified.

This is broader than the earlier draft's “one new function” description because it also fixes the existing timestamp helper. Review both definitions before execution. Do not apply an older copy of this migration. It is intended for first installation; if an earlier save-function draft has already been installed, stop and prepare an explicit upgrade rather than rerunning this file blindly.

## Authentication and RLS verdict

- Function execute grants exclude anonymous clients. The explicit null-`auth.uid()` guard also rejects an authenticated-role call with no identity.
- The RPC never accepts a caller-supplied owner. Every new owned row uses `auth.uid()`, and existing-row reads/writes include that ID.
- RLS remains active for all statements because neither function uses `SECURITY DEFINER`. Existing composite foreign keys continue to prevent cross-owner parent links.
- Cross-account edit attempts are rejected; no other user's plan is returned or changed. The same retry UUID belongs independently to each user.
- Retry bookkeeping is not an authorization mechanism. RLS provides isolation. As with other owner-writable routine fields, manually altering/deleting a routine or its assumptions through a direct API/administrator path is outside the app RPC's retry contract. Receipts are retained while the owning routine row and its bookkeeping are retained; archiving/versioning through the app preserves them.

## Idempotency and concurrency verdict

The per-user transaction advisory lock serializes routine saves, including simultaneous creation attempts with the same request token. The existing-routine `FOR UPDATE` lock also coordinates against ordinary archive updates and workout foreign-key references. After the account lock, the RPC checks receipts before applying edit preconditions: an old success is acknowledged rather than treated as a fresh edit. It never rolls back later edits or reactivates an archived routine on replay.

The API contract is PostgreSQL's default **READ COMMITTED** isolation. Stronger transaction isolation levels are not covered by the concurrency runner; callers using them must handle whole-transaction retries as appropriate. PostgREST uses the database's configured isolation, so keep its normal READ COMMITTED setting for this app.

`updated_at` must be sent back exactly as returned by Supabase, including fractional seconds. The frontend does this; it does not convert the conflict token through a JavaScript `Date` (which would lose microseconds). Archive operations also keep the exact loaded token in their conditional update.

## Workout-history verdict

An edit of a routine referenced by any session (draft or completed) archives the old routine and creates a new active routine within the same transaction. Original routine days, prescriptions, completed-session snapshots, performed exercises, and sets remain unchanged. Old retry receipts remain with the old routine; the new version retains its own save receipts across later edits. A failed new-version save rolls back both the archive and the attempted new plan.

The native tests exercise both concurrent orderings:

- A workout that commits first causes the waiting routine edit to create a version, preserving the workout's original day ID.
- An edit that commits first safely rejects a workout request still referencing a replaced day with a foreign-key error. Stage 4 must reload the plan and retry that session creation; it must not suppress the constraint or claim the session saved.

## Test results

- `npm run check`: **216 tests passed across 12 files**, including **122 isolated PostgreSQL tests**; TypeScript checking and the production build passed.
- `npm run test:db:concurrency`: **6 real multi-connection scenarios passed** on local PostgreSQL 18.4: simultaneous identical saves, conflicting edits, old retry after later edit, concurrent archive, and both workout/edit orderings. The identical-save scenario also verifies another user's save is not blocked by the first account's lock.
- Existing SQL Editor verification scripts were exercised against the final migration in local PostgreSQL emulation.
- No hosted tests were run for this review, and no hosted verification is implied by these results.

The development-only `embedded-postgres@18.4.0-beta.17` dependency was added to test actual lock contention; it is not in the frontend bundle. `scripts/test-routine-concurrency.mjs` never reads `.env.local` and never uses a hosted connection string. It starts disposable PostgreSQL with separate connections, a random local-only password, no TCP listener, and a project-local Unix socket. Database files, sockets, and initdb temporary files stay under Git-ignored `.test-postgres/` inside this project and are removed after the run. It does not create OS users. Native process/socket execution needs host permission and a supported non-root runtime; ordinary `npm run check` remains the portable in-memory test command.

## Your review and application step

Open the final migration locally and review the timestamp helper and save RPC. When you approve it, paste the **entire final file** into a new Supabase SQL Editor query and run it once. Do not rerun migrations 001 or 002. After successful application, test routine selection/save/edit/archive and refresh/sign-in persistence; then run the separately reviewed hosted two-user SQL checks from `docs/STAGE_3.md`.

Technical references: PostgreSQL documents [transaction-start versus wall-clock timestamps](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT), [row and advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html), and [READ COMMITTED snapshots](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED). Local tests establish this migration's observed behavior; they do not certify the configuration of the hosted project.
