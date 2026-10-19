# Migration 010 — routine management review

**Status:** implementation and local validation complete. Migration `202610180010_routine_management.sql` is **UNAPPLIED hosted** and requires separate review/approval. User confirms 001–009 are installed. None of those migration files were changed, including the existing uncommitted 009 file. No hosted SQL, queries, credentials or real data were used. Prior History/cancellation/UI work and stage-3-stable remain preserved.

## User experience

Active routines show Edit, Archive and Delete. Archived routines show Restore and Delete. Restore reactivates the same ID and planned rows rather than saving a copy. Delete retains an explicit confirmation saying completed Workout History is kept. Failed or unconfirmed actions never remove a routine locally or report success. Missing migration 010 reports a setup error; there is no fallback to destructive table deletion.

Deleting a routine with linked unfinished workouts is blocked. The message asks users to finish or explicitly cancel them first. This applies to active and archived routines. Same-device active drafts and account-scoped unsent recovery entries are checked before the delete RPC, and the database rechecks persisted drafts under locks. No draft, recovery entry or actual set is discarded by routine management. Archive/Restore do not alter an unfinished workout.

## Database changes

1. Add private `routine_deletions` markers: owner UUID, routine UUID, deleted-version timestamp, deletion timestamp and full transaction ID (`deletion_xid`). FORCE RLS, no client grants/policies, auth-account cleanup cascade, no routine FK or personal plan content. Markers survive deletion so delayed initial-create retries cannot recreate a permanently deleted ID.
2. Add a guarded routine INSERT / identity UPDATE trigger. It takes the shared owner advisory lock before checking deletion markers, rejects recreating a deleted ID, and disallows changing a routine's owner/ID. Both existing v1/v2 save RPCs retain SECURITY INVOKER, signatures, implementations and receipt logic. New personal copies get new IDs as before.
3. Revoke direct routine DELETE from authenticated. Existing routine saves retain required INSERT/UPDATE and planned-child DELETE access. Applications delete through the validated transaction; direct clients cannot bypass marker creation. Existing owner RLS policies and all owner/source foreign keys remain in place.
4. Replace the workout root guard in this forward migration only. Every role is subject to completed-history immutability, including inherited/custom roles and unrelated SECURITY DEFINER paths. The authorized deletion transaction may clear **only routine_id and routine_day_id**, with every other root field identical, the caller matching the workout owner, and a private authorization matching owner, source routine and the current full transaction ID. This returns before revision/timestamp updates and finish validation, preserving legacy values. Ordinary completed-record updates/deletes fail; only the table-owning maintenance role may cascade deletion after the owning auth account is actually gone. No trigger is disabled and no client-controlled privilege flag is trusted.
5. Add authenticated-only `fitness_manage_routine(id, action, expected_updated_at, expected_user_id)`, SECURITY DEFINER with empty search_path, owned by the trusted migration administrator. Owner always derives from auth.uid(); expected account prevents stale-account requests. Every owned lookup/write is scoped to that owner and the selected ID. No dynamic SQL.

Archive/Restore use the same account advisory lock as saves/starts/cancellation and lock the owned routine row. Mutating actions require its exact edit timestamp. A repeated already-matching Archive/Restore is a no-op without changing timestamps; an old request cannot reapply over a later opposite state. Restore never INSERTs a routine.

Delete locks the owned routine, checks the exact confirmation version, locks linked workouts and refuses any draft. After all checks pass, it records the private transaction-bound deletion authorization, clears only completed source links and deletes the routine in one transaction. Planned days/exercises/targets cascade; completed sessions, exercises, actual sets, names, provenance, units and save receipts remain. NO ACTION source FKs are retained as additional safeguards, never changed to cascade. A late error rolls back detachments, the marker and all deletion work. Identical delete retries match the recorded version and acknowledge success without affecting anything else.

Installation itself does not update stored profiles, plans, history, exercises, sets, receipts or cancellation records. No historical-name backfill or performance normalization runs. Workout History continues to read its existing snapshots without a routine/catalog join. Recommendation catalog/template data are not modified.

## Concurrency and recovery

- A persisted workout start before deletion blocks deletion; if deletion commits first, a late start fails safely and leaves no orphan session.
- A finish committed first allows subsequent source deletion while preserving the completed record exactly. A deletion refused due to a draft leaves it available for finishing/cancellation.
- Two Restore requests return the same routine; Restore/Delete and stale Edit/Archive requests cannot undo one another silently.
- Late v1/v2 initial save retries and direct inserts cannot resurrect a deleted routine. Direct identity changes and deletion-marker forgery are denied.
- Completely unsent progress on another device is not visible to the server. If routine deletion wins before that device's first save, existing workout conflict/recovery handling keeps its captured draft and requires explicit recovery as an independent workout; no routine or actuals are silently invented/discarded. Same-origin recovery entries are checked before local deletion. Browser recovery must not be treated as server-persisted progress.

## Local verification

- `npm run check`: **507 tests / 28 files passed**, TypeScript passed and production build passed. The existing nonblocking main-chunk-size warning remains.
- **21 focused migration-010 PostgreSQL tests** include populated-upgrade equality, Archive/Restore identity and targets, active/archived deletion, exact snapshot/History/receipt preservation, legacy values, unfinished-workout blocking and finish/cancel resolution, ownership/direct authenticated attacks, tombstone/retry protection, cross-account history, stale versions and atomic rollback.
- UI/repository regressions cover both action lists, Restore success/failure without duplicate saves, archived deletion confirmation, active/recovered same-device draft blocking, exact owner/version RPC inputs and invalid acknowledgements. Test fixtures clear local recovery between cases.
- `npm run test:db:concurrency`: **39 native PostgreSQL 18.4 concurrency/security scenarios passed**, including nine management scenarios for simultaneous Restore, stale confirmation after Restore, Delete versus Restore, workout-start ordering, Finish/Delete, deletion refusal, delayed save retries and Archive/Edit. Fixtures are disposable; no Supabase connection/configuration is used.
- Earlier migration-specific tests intentionally retain their earlier installed schemas and protections; the new 010 suite validates the approved new deletion behavior. Native tests apply 010 after the prior 001–009 scenarios to verify both upgrade behavior and new operations.
- `git diff --check` passed; migrations 001–009 are unchanged. stage-3-stable remains `24be6832b37180e8846fbe1c832847238f6599f1`.

## Stop point / remaining acceptance

Review the complete 010 SQL file before approving hosted installation. Deploy the new management UI with its required RPC; before installation it reports migration 010 is needed. Do not rerun 001–009.

After separate approval/application, live test-account acceptance must verify Archive → Restore on the same ID; deletion of active and archived plans with completed history; refresh/sign-out/in History values; unfinished-workout refusal; two-account isolation; retries; and competing browser sessions. Real-device focus/touch/confirmation checks remain manual. This work made no hosted modifications. No charts, analytics, history editing or other features were introduced. Changes remain uncommitted.

## Final focused security review

The initial trigger depended on the exact current_user names authenticated/anon. Three new PostgreSQL regressions reproduced a bypass: a role inheriting authenticated permissions could directly detach source links or change completed names/dates; an unrelated privileged function could also detach without a deletion operation. The original twelve tests did not cover these paths. No hosted installation of 010 occurred.

Corrected 010 removes that implicit trust. All completed UPDATEs now require the exact FK-only shape plus authenticated ownership and private authorization bound to the old source routine and current full transaction ID. Only the exposed Delete RPC writes such an authorization, after ownership, confirmation-version and unfinished-workout checks. Old committed markers cannot authorize future transactions. App roles cannot read/write the authorization table, and spoofed client GUCs cannot influence the guard. Standard app roles still receive the original read-only rejection directly; other roles fall through to the same strict rejection unless the entire authorized-detachment condition succeeds.

Completed DELETE is restricted to the table-owning maintenance role during actual auth-account removal. A row hidden by auth.users RLS is explicitly not sufficient to let a custom role delete workout history. Both normal administrator edit/delete accidents and a simulated RLS-filtered account lookup were tested; deliberate account cleanup still passes. Database administration/DDL remains a trusted boundary, not a client API.

Native PostgreSQL 18.4 tests use a genuinely restricted SET SESSION AUTHORIZATION fixture, then authenticated, inherited-member, anon, outsider and limited custom roles with synthetic verified identities. The fixture cannot SET ROLE postgres. Direct root/child UPDATE/DELETE, source unlink, completed-to-draft reopening, name/date/weight/unit tampering, private-marker forgery, fake flags, unauthorized RPC calls, cross-account targets and unrelated SECURITY DEFINER writers are rejected. An administrative fixture also proves expired authorization is unusable. All accepted Archive/Restore/Delete operations preserve exact root snapshots, child rows and receipts; only the intended source links are cleared.

Final validation: **507 automated tests / 28 files**, including **21 focused 010 SQL tests**; TypeScript and production build passed; **39 native PostgreSQL scenarios** passed. Migrations 001–009 were SHA-256 checked byte-for-byte against their contents at the start of this review. Existing bundle-size warning remains nonblocking. No app UI/behavior changes were introduced by this review.

**Readiness:** no remaining blocker found for corrected migration 010 under the tested application-role boundary. It is ready for separate installation approval; hosted compatibility/acceptance has not been claimed or tested, and no hosted SQL was executed. The corrected SQL differs from the earlier reviewed draft.
