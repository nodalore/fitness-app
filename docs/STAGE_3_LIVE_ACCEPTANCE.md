# Stage 3 live acceptance — migrations 001–007 installed

Updated 2026-10-18. The user reports successful hosted execution of migration 007 and confirms 001–007 are installed. Do not rerun migrations. Installation success is distinct from authenticated persistence acceptance. Stage 4 remains unauthorized.

## Permission and test scope

No hosted write or account creation is authorized yet. Run the following steps manually in the app, or separately approve an exact automation plan. Use two dedicated, confirmed test accounts (A and B) and only records created for this run. Do not supply passwords, access tokens or service keys in chat. Sign in through the app yourself. Do not use real profiles/routines or modify reference catalog data.

Proposed permitted writes, if approved: A creates one two-session custom routine and one accepted recommendation copy, edits only the custom routine and permanently deletes only the accepted copy. B creates one simple routine to establish isolation in both directions. Leave the remaining test routines for inspection unless cleanup is explicitly approved. A profile is required for recommendations: use a dedicated test profile; changing or creating it also needs permission. Agree the app URL and test-account identities before automation. No SQL execution, migrations, completed-workout logging or Stage 4 flows are required.

## Manual run and expected results

Use a unique prefix such as `S3-ACCEPT-20261018-<run>` for every test-created routine. Record pass/fail, viewport, routine IDs and before/after counts without recording credentials or personal information. All steps below remain PENDING until observed against hosted Supabase.

| Check | Steps with dedicated test accounts | Expected evidence |
| --- | --- | --- |
| 1. Free-text custom exercise | As A, Create My Own Routine; enter the prefixed routine name, Day 1 session `Pull`, exercise `Acceptance cable row`. Avoid the library picker. | Empty initial routine; custom name accepted without a catalog match. |
| 2. Individual planned targets | Set two sets: 8 reps at 20 kg, then 6 reps at 25 kg. Click Add Exercise. | One compact list entry; form and targets clear; no automatic placeholder exercise. |
| 3. Multiple exercises/sessions | Add `Acceptance curl`, one set of 10 reps at 8 kg. Add Day, name it `Legs`, enter `Acceptance split squat`, two sets (10 reps/12 kg and 8 reps/14 kg). Save without clicking Add for this final exercise. | One saved routine containing both sessions and exactly three exercises. Final typed input included exactly once. |
| 4. Hosted retrieval/auth persistence | Open My routines, expand the saved plan; hard-refresh; sign out, sign back into A, return to My routines. | Same routine ID and exact session/exercise order, names, reps, weights and units after every reload. Sign-out removes access to private routines. |
| 5. Edit without duplicates | Record custom routine ID and total saved count. Edit its name and one planned target; Save Changes, refresh. Use this new unreferenced test routine, not a routine with workout history. | Same ID, same routine count, only intended changes; other routines unchanged. |
| 6–7. Independent recommendation copy and deletion | In Discover, open a recommendation and note its sessions/exercises. Cancel once: no new saved routine. Reopen and Use This Routine once. Open My routines and record the copy ID. Refresh to verify it persists. Delete that copy, first choose Keep routine, then confirm Delete permanently. | Acceptance adds exactly one personal plan with targets unset. Keep routine does not delete it. Confirmed deletion removes only that copy. Discover still generates the original recommendation unchanged; custom routine remains. |
| 8. Account isolation | Sign out of A and sign into B. A's prefixed plans and edits must not appear. Create one prefixed B plan (only if approved). Sign out and back into A. | B sees only its plans; A cannot see B's plan; no stale private draft or preview crosses accounts. |
| 8. Server-enforced isolation | With explicitly approved test accounts, use B's token to attempt read/update/delete of A's test routine and its custom exercise/planned-set IDs; reverse for A/B. Also test RPC update using the other owner's ID and edit timestamp. Do not expose tokens in logs/chat. Re-read as owner afterward. | Foreign SELECT returns no rows, UPDATE/DELETE affect no rows or deny access, RPC edit denies; owner data unchanged. UI invisibility alone is insufficient proof of RLS. |
| Responsive acceptance | Repeat session-card switching/closing and custom entry at desktop and 320/390px mobile widths; inspect scrolling, focus and per-set controls. | Only one session panel open; no horizontal overflow or obscured actions; all targets remain usable. |

Optional zero-target case: save a named exercise without planned sets. It should reload with targets unset, not fabricated values. Do not confuse zero planned sets with zero reps (invalid); zero planned weight is allowed.

History-protected deletion and concurrent saves are covered by local database tests. Do not create or alter hosted workout history for this Stage 3 run. Any live history verification requires separately approved disposable fixtures and exact SQL/test steps.

## Evidence boundary

Local automated checks cover custom names, per-set targets, multiple sessions/exercises, inclusion of pending input, exact saved edits, independent recommendation copies, deletion/foreign keys/history protection, retries, RLS and concurrent transactions. They do not prove hosted JWT handling, PostgREST relationship resolution/schema cache, browser refresh, sign-in persistence or two-account hosted isolation.

Read-only hosted connectivity and anonymous security/catalog checks can provide limited additional evidence. The existing `check:security:live` script checks seven pre-007 owned tables; it does not include `routine_planned_sets` or authenticated RPC isolation. Its results must not be reported as complete 007 acceptance.

The existing isolated Playwright candidate uses mocked persistence, is stale for separated Discover/My routines content and needs exact-script approval before execution. It cannot establish live persistence. No browser or authenticated live acceptance has been performed in this run.

## Automated results — 2026-10-18

- `npm run check`: 369 tests / 17 files passed; TypeScript and production build passed.
- `npm run test:db:concurrency`: 12 native PostgreSQL scenarios passed after local process/socket permission.
- Read-only hosted Auth connectivity: HTTP 200; email sign-in enabled and confirmation required.
- Read-only anonymous security checks: HTTP 401 for all seven pre-007 private tables tested. Public catalog: 30 exercises, 30 alternatives, 10 sources, matching expectations.
- No authenticated hosted tests, browser acceptance, account creation or hosted data writes performed. The eight manual rows above remain pending. Migration 007 installation is recorded from the user's confirmation, not inferred from anonymous probes.
