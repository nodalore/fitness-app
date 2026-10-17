# Stage 3 — routine recommendations and management

Status: implemented and tested locally. The hosted database has not been changed. Saving routines requires review and approval of the new RPC migration below. Hosted signed-in acceptance is pending that approval and two-user verification.

## Stage 2 verification before Stage 3

The user confirmed successful hosted registration, login, profile saving, and visibility of the profile row. The available automated Stage 2 suite passed before Stage 3 work began (115 tests, including isolated PostgreSQL ownership checks). Read-only hosted checks also passed: all seven personal tables returned HTTP 401 anonymously; the catalog returned the expected 12 exercises, 12 alternative links, and three evidence sources.

These results are different kinds of evidence. Local PostgreSQL tests run the exact migrations with emulated Supabase identities. Hosted anonymous checks exercise the actual Data API, but cannot prove isolation between signed-in users. The public key cannot create a signed-in identity or run SQL. The separate rollback-only `supabase/tests/live_rls.sql` remains available for the two-user hosted check; do not claim it passed on the hosted project unless it was actually run there. Password recovery and logout also remain live acceptance checks unless verified manually. The current user instruction permits Stage 3 after the available security checks pass; those checks passed, with these limitations documented.

## What the user can do

Sign in and select **Routines**, or follow **Explore workout routines** from Profile. The page loads the saved profile, current catalog, and saved routines from Supabase each time it mounts. Account changes clear the previous user's workspace before fetching the next user's data.

- Review up to three explained recommendations, including all exercises and working-set prescriptions.
- Select **Customize & save** to review a recommendation in the editor, then save it.
- Create a routine from scratch; add/remove/reorder workouts and exercises; choose weekdays, goal, sets, min/max reps, rest seconds, and notes.
- Edit active saved routines. Archive a routine after confirmation; archived routines remain readable.
- Retry a failed save without losing the form or duplicating an already-committed retry.

Unsaved routine drafts live in the current page only. A successful saved routine is loaded from the database on refresh or a later sign-in. Workout-session draft logging is Stage 4, not part of this editor.

## Recommendation rules and evidence boundaries

The rule version is `rules-1.0`. The code lives in `src/features/routines/recommendations.ts`; it uses the live seeded exercise library, not a second hardcoded production exercise list.

1. Validate the saved profile. Filter out deprecated exercises and exercises requiring unselected equipment. Bodyweight exercises require no equipment and remain available.
2. Require coverage of squat, hinge, horizontal push, horizontal pull, and trunk patterns before generating a complete routine. The twelve-exercise library cannot cover all equipment combinations. Bodyweight-only, band-only, or machine-only profiles may have no complete suggestions; explain missing patterns and allow deliberate custom planning rather than invent movements. The editor marks exercises requiring other equipment.
3. Prefer two separated full-body days when possible. Select weekdays deterministically, considering the Sunday/Saturday boundary. With only one day or consecutive-only availability, offer one-day starting options and explicitly explain that they are below the general twice-weekly strengthening guideline.
4. Offer lower-volume foundation and standard workloads. If three separated days are available, offer a three-day full-body alternative; experienced users with four available days and suitable exercises can instead choose upper/lower twice weekly. Available days do not force training every day.
5. Beginner presets use 1–2 sets at 8–12 reps. Experienced strength main lifts use 2–3 sets at 4–8 reps; other main-lift options use 8–12 reps. Trunk exercises use 8–12 reps. Lower-volume general-fitness options start at one set. These exact ranges are adjustable product starting points, not uniquely effective prescriptions or guarantees.
6. Use the existing exercise rest ranges: generally 120 seconds, or 180 seconds for experienced strength main lifts; trunk work starts at 60 seconds. These are app defaults informed by program-design considerations, not precise findings attributed to ACSM's 2026 stand.
7. Explain bench/seat/stable-support assumptions for dumbbell plans. Selecting dumbbells alone does not confirm ownership of all supporting equipment.
8. Store the profile inputs used, rule version, source links, review timeline, and limitations with a recommended routine. Changing the timeline changes the review point, not training intensity or promised outcomes. Saved plans do not silently change when the profile changes.
9. Show auditable weekly primary-muscle set totals, excluding secondary involvement. Lower-volume plans may be below higher-volume hypertrophy targets; the app does not claim that all starting plans maximize growth. No load calculation, 1RM test, failure training, or paid AI service is required.

Sources: [ACSM official 2026 summary](https://acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf) supports consistent training and goal-specific programming. [CDC](https://www.cdc.gov/physical-activity-basics/guidelines/adults.html) provides the broader activity baseline, including aerobic activity that this feature does not track. [NSCA](https://www.nsca.com/education/articles/ptq/time-efficient-training/) provides educational program-design context; its time-efficient or advanced examples are not universal novice prescriptions. These references are visible in the app. No scientific claims about an individual user's expected results are made.

## Why a new database function is needed

A routine spans `routines`, `routine_days`, and `routine_exercises`. Three separate browser writes can leave a half-saved plan. The RPC `fitness_save_routine` saves them in a single PostgreSQL transaction. Failure rolls everything back.

The function:

- Uses `SECURITY INVOKER`, an empty search path, explicit schema references, and the caller's `auth.uid()`. RLS remains enabled and unchanged. It never accepts an owner ID from the browser.
- Is executable only by `authenticated`; anonymous execution is revoked.
- Validates a maximum of seven days, 20 exercises per day, 1–10 sets, 1–100 reps, and 1–900 rest seconds. These are application input bounds, not exercise prescriptions. Existing table constraints additionally validate names, notes, rep ordering, weekday values, and exercise references.
- Retains per-request receipts in routine assumptions across later edits, plus a per-user transaction lock. A SHA-256 fingerprint covers the normalized document, routine ID, and expected edit version. An identical retry acknowledges the original result without rewriting later changes; reusing the token with changed inputs is rejected. Client-supplied retry bookkeeping is ignored.
- Requires the last loaded `updated_at` timestamp for existing-routine edits. Conflicting edits fail with a reload message instead of silently overwriting.
- Keeps original days and workout references intact when sessions already reference a routine. Editing creates a new active version and archives the old version atomically. Without historical sessions, it replaces the existing prescription within the same transaction.

Archiving is a single ordinary RLS-protected update with owner, routine ID, active-state, and timestamp filters. It never deletes workout records.

## Required review and approval — no live SQL executed

Review `supabase/migrations/202610170003_routine_save.sql`. It adds **the save RPC and its execute grants**, and replaces the existing timestamp helper so routine edit tokens strictly advance while profile timestamp behavior stays unchanged. The existing trigger definitions are retained. See [the final review](ROUTINE_SAVE_REVIEW.md) for the exact fixes and scope. It does not alter tables, relax policies, disable RLS, or change existing data. It is nonetheless a hosted schema addition, so it has not been applied without your approval.

Once you approve it, open the Fitness App project in Supabase SQL Editor, paste the entire file, and run it once. Keep `begin` and `commit`. Do not rerun the first two migrations, which are already installed. If an error occurs, stop and share only the error text; use `rollback;` if a failed transaction is left open.

Until the function is installed, recommendations, the editor, and reading saved plans are available, but saving shows a clear “reviewed Stage 3 SQL function” setup error and preserves the form. This is an explicit setup dependency, not a successful save.

## Tests and how to verify

```sh
npm run check
npm run test:db
npm run test:db:concurrency
npm run check:security:live
```

`check` includes frontend tests, all migration/security tests, TypeScript, and production build. `test:db` uses isolated in-memory PostgreSQL only. `test:db:concurrency` uses disposable native local PostgreSQL to test overlapping connections without reading Supabase configuration; host permission to start a local process/socket may be needed. `check:security:live` performs only anonymous GET requests against the configured hosted project, prints status/count summaries, and never prints keys, response bodies, or personal records.

Final migration review: 216 tests passed across 12 files, including 122 isolated PostgreSQL tests; TypeScript checking and production build passed. Six real multi-connection PostgreSQL scenarios also passed. A development-only embedded-postgres dependency was added for contention testing; see [ROUTINE_SAVE_REVIEW.md](ROUTINE_SAVE_REVIEW.md).

Automated coverage includes all goals and experience levels; all 127 nonempty weekday combinations; equipment gaps and deprecated exercises; stable recommendation results; timeline invariance; custom editor validation; selection/create/edit/archive UI; failed saves and retry token reuse; account-switch state clearing; fresh reload reads; RPC transaction rollback, conflicting edits, anonymous/cross-user denial, and history-preserving versioning. Recommendations generated from the actual seed are saved through the exact RPC in local PostgreSQL. A committed local routine remains readable by its owner and invisible to the other role after identity changes.

After approving/installing the function, manually verify hosted behavior:

1. Save your profile with dumbbells and suitable support available to get complete recommendations. If you have only bodyweight equipment, confirm the coverage limitation is honest; do not select equipment you do not have solely to obtain suggestions.
2. Open **Routines**, review a plan, customize its name or sets, and save. Check the saved plan, refresh, sign out/in, and confirm its values persist.
3. Create a custom routine, add a workout and exercises, save, edit it, and refresh to verify the change.
4. Archive after confirmation. Confirm it moves into Archived routines and that its days/exercises remain viewable.
5. Sign in with a separate verified test account. It must not see the first account's saved routines.
6. Review/run `supabase/tests/live_rls.sql` with the two test UUIDs for broad hosted ownership checks. Review/run `supabase/tests/live_routine_save.sql` for RPC-specific create/retry and cross-account denial checks. Both roll back test writes; neither needs passwords. Run each complete file as a separate SQL Editor query after replacing placeholders in the editor, not in tracked files.

Unit/UI tests mock SDK responses; they do not prove a real browser sign-in or live saved-routine reload. Local PostgreSQL tests emulate Supabase identities and do not prove the hosted policies are identical. The two hosted SQL scripts are also executed locally as syntax/behavior checks; hosted execution remains separate.

## Stage 4 remains unstarted

Stage 4 adds workout drafts and completed sessions, per-set reps/weights, substitutions during training, rest guidance, and reliable session saves. It will use existing session tables and add reviewed transaction functions as needed. Comparisons are Stage 5; public deployment is Stage 6. No countdown timer, advanced chart, extensive filtering, or new paid service was added here.
