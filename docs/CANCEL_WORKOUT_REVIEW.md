> Current hosted status: user explicitly confirms migration 009 is applied. Its SQL file remains unchanged. References to unapplied installation below record the earlier pre-installation review. New routine-management migration 010 is separate and remains local/unapplied; see ROUTINE_MANAGEMENT_REVIEW.md.

# Cancel Workout — local implementation and migration 009

Migration `supabase/migrations/202610180009_cancel_workout.sql` is a **local, unapplied draft**. It requires separate approval before hosted installation. User reports migration 008 hosted saving works. Installed 001–008 are unchanged. No hosted calls, SQL or data modifications occurred here; all fixtures are disposable and local.

## Why 009 is required

008 deliberately makes receipts client-read-only and protects their parent with NO ACTION. Direct deletion is therefore insufficient. It would also leave an unanswered first-save request able to recreate a physically deleted session. A pending network request cannot safely be canceled just by aborting a browser fetch.

009 adds owner-scoped cancellation markers containing only user/session UUIDs and cancellation time. They have no workout FK and retain no names, exercises, weights or reps. They persist after deleting the draft, until account cleanup, to reject arbitrarily delayed retries. Client access is revoked, with FORCE RLS and no app policies. Account deletion cascades its markers.

`fitness_cancel_workout(session, expected_user)` is an authenticated-only SECURITY DEFINER endpoint with empty search_path. Ownership comes from auth.uid(), and the expected-user check protects stale-account requests. Under the existing account advisory lock it locks the owned workout, rejects completed or foreign-owned workouts, records the marker, deletes only that draft's receipts, and deletes its root. Existing owner FKs cascade exercises and sets. Routine/planned tables are never modified. Any failure rolls back everything. Repeating cancellation after a lost response is idempotent. Cancellation before the first autosave reserves that draft ID without creating a workout/history record.

The installed save implementation is renamed `fitness_save_workout_v008` and EXECUTE is revoked from PUBLIC/anon/authenticated. Its body is unchanged. A public `fitness_save_workout` wrapper retains the same signature, expected-user checks and receipt return contract; under the shared account lock it rejects canceled IDs before invoking that protected implementation. No authenticated client can bypass the wrapper through the helper. A narrow insert trigger also checks the marker under that lock to reject direct authenticated inserts recreating a canceled ID. Existing completed-history guards and RLS remain unchanged.

If save wins first, cancellation subsequently removes its data. If cancellation wins first, the late save is rejected. If Finish wins first, cancellation refuses it; if cancellation wins, Finish is rejected. Other accounts retain their independent locks. This intentionally uses no client-controlled privilege flag or dynamic SQL.

## Frontend

A secondary text Cancel Workout action sits beside/below Finish, with the exact requested warning and Keep Workout / Yes, Cancel Workout. Keep restores focus and preserves the workout. Confirm freezes edits, stops the debounce timer, and persists cancellation intent before calling Supabase. Old autosave responses/errors cannot mutate the cleared/new workout or drain queued old changes. Cancellation does not wait for an ambiguous save response; the server lock/marker makes either order safe.

Only a validated canceled acknowledgment clears the draft and device recovery, removes its resume entry and resets routine/session selection. On failure the workout stays visible with an error. Ambiguous cancellation remains recoverable across refresh/account sign-out, with Retry cancellation; it cannot resume autosaving or undo an already committed deletion. Completed-workout/ownership refusals remain visible conflicts. No Done checkbox, history writes or routine mutation are introduced.

Without hosted 009, the missing RPC is reported and cancellation is not falsely claimed. Do not treat local UI mocks as hosted cleanup verification.

## Verification and remaining acceptance

- `npm run check`: **476 tests / 27 files passed**, TypeScript and production build passed (existing nonblocking main-bundle-size warning).
- Seven new focused PostgreSQL tests cover populated upgrade preservation, exact owned cleanup, receipts/retry prevention, pre-save cancellation, direct authenticated attempts, completed protection, helper privileges and atomic rollback.
- UI/repository/queue/recovery regressions cover Keep/confirmation, preserving the original plan, failed cancellation, stable account identity, pending saves/queued edits/late errors, duplicate confirmations, cancellation intent after refresh and completion refusal.
- `npm run test:db:concurrency`: **23 native PostgreSQL 18.4 multi-connection scenarios passed**, including five cancellation races (in-flight save first, cancellation first, Finish first, cancellation before Finish, direct insert after cancellation).

Stop before applying 009 hosted. After separate installation approval, live test-account acceptance must confirm actual table cleanup, delayed retry rejection, no History entry, unchanged routine, sign-out/in recovery after a lost response, completed protection and two-account isolation. Real desktop/mobile/touch/keyboard acceptance also remains pending. stage-3-stable and existing Stage 4 History work are preserved; no unrelated feature is introduced.
