# Stage 2 review and SQL Editor handoff

Status: implemented locally; live Supabase migration execution and end-to-end acceptance are pending your review. Stage 3 has not begun.

## What changed and why

The frontend now uses Supabase Auth for registration, email confirmation, login, local-browser logout, and password recovery. A session provider restores sessions and listens for sign-in/sign-out changes. Passwords are sent only to Supabase Auth over HTTPS; the app does not store them in profile tables or log them. The SDK persists its session in browser storage and refreshes access tokens. Treat shared-browser access accordingly; sign out when finished.

`/profile` requires a session and reads/writes only the current user's profile ID. Database policies provide the actual isolation even if someone bypasses the interface. There is no privileged frontend key. A profile is created on its first successful save, avoiding a privileged signup trigger and making profile-save errors visible rather than breaking registration.

The profile editor saves name, goal, experience, available days, equipment, review timeline, units, and timezone. It does not generate routines; that is Stage 3. New account defaults are starting form values and are not evidence-based prescriptions. Onboarding is not marked complete by this form.

New auth screens use a paper-and-ink training-journal direction: serif typography, CSS color variables, ruled background texture, vermilion accents, and a short entrance animation that respects reduced-motion preferences. No external font service or image download is required.

## Review the two migration files

1. `supabase/migrations/202610170001_schema.sql`
   - Creates all ten SPEC.md tables: profiles, evidence_sources, exercises, exercise_alternatives, routines, routine_days, routine_exercises, workout_sessions, session_exercises, workout_sets.
   - Enables and forces RLS on all ten, within the same transaction as table creation.
   - Grants anonymous clients no personal-table access. Signed-in users can select/insert/update/delete only rows with their user ID.
   - Uses composite foreign keys to prevent attaching an owned child to another user's parent or choosing a day from the wrong routine.
   - Restricts catalog clients to reads. Administrative SQL still has legitimate database-owner privileges; RLS tests must switch to client roles.
   - Validates ranges, positions, session timestamps, units, and ownership links. Preserves workout snapshots; referenced routines/days must be archived instead of deleted. Explicit session deletion removes its performed exercises/sets; account deletion cascades owned rows.
   - Adds caller-privilege timestamp triggers. No SECURITY DEFINER functions or workout/recommendation RPCs are introduced.
2. `supabase/migrations/202610170002_reference_seed.sql`
   - Adds three source records, twelve curated exercises, and twelve directional alternative descriptions (six pairs).
   - Rest values are editable product defaults, not individualized prescriptions. Movement comparisons are editorial descriptions; they are not medical substitution advice.
   - Reference source ID arrays follow SPEC.md's compact design. They are not foreign keys; future catalog edits must keep their references valid. The catalog is not client-writable.

Both files contain `begin`/`commit`. They are intended to run once in a new application schema. They deliberately fail if tables already exist rather than silently accepting a different schema. No existing user, table, or record is dropped. If the second file fails, the first remains applied; correct and retry only the failed file. Never disable RLS to address an error.

## Apply through Supabase SQL Editor — only after review

No migration has been executed on your project by the agent.

1. Open your Fitness App project in the Supabase dashboard. Verify it is the empty development project you intend to use.
2. Select **SQL Editor**, then create a new query.
3. Open `202610170001_schema.sql` locally, review it, and paste the complete contents into the editor. Keep both transaction statements.
4. When you approve the changes, select **Run**. Expect a successful completion without a result table.
5. Create another query with all of `202610170002_reference_seed.sql`. Review and run it once.
6. In Table Editor, confirm ten application tables. `exercises` should have 12 rows. Each table should show RLS enabled; never select a “disable RLS” option.
7. If the Data API was disabled during project creation, enable it for the `public` application schema. Our migrations provide explicit client grants and policies; do not add broad public read policies to personal tables.
8. If SQL fails, stop and share the error message only. Do not share connection strings, keys, or passwords. If the editor leaves a failed transaction open, execute `rollback;` before trying again.

The SQL Editor workflow does not populate the Supabase CLI migration-history table. Keep these files in Git and record which ones you applied. Do not later run a CLI push blindly; reconcile the already-applied migrations first.

## Configure authentication in the dashboard

Connectivity verification returned HTTP 200 from Supabase Auth, with email/password enabled and email confirmation required. These settings were read, not changed.

Under Authentication URL Configuration, use:

- Site URL: `http://127.0.0.1:5173`
- Allowed redirect: `http://127.0.0.1:5173/auth/callback`
- Allowed redirect: `http://127.0.0.1:5173/auth/reset-password`

Use the same origin in your browser. The app uses PKCE; open confirmation/reset emails in the browser where you initiated them. It does not require wildcards or a custom email template. Keep email confirmation enabled. The app requires at least 12 characters for new passwords; set the corresponding minimum in Supabase password settings too, so the backend enforces it for direct API requests.

For initial testing, Supabase's built-in sender may only deliver to permitted project-team recipients and is rate-limited. Configure custom SMTP for delivery to other users and for production. Enter SMTP secrets only in Supabase settings. Do not disable email confirmation to bypass email setup. Configure the production HTTPS Site URL and exact redirect paths in the later deployment stage.

## Test against the live project after migration approval

Start `npm run dev` and open http://127.0.0.1:5173.

1. Select **Sign in → Create an account**. Register with a test email you control and a unique password. Confirm the email in the same browser, then sign in.
2. On **Profile**, enter a recognizable display name and preferences, then select **Save profile**. Confirm “Profile saved to Supabase.” Reload: values must persist. Sign out and sign in again: values must still persist.
3. In the dashboard's `profiles` table, verify that row's `user_id` matches the account in Authentication > Users. Do not paste user records or passwords into chat.
4. Sign out. Visiting `/profile` must show sign-in, and the private form must disappear. Try a wrong password and confirm that it does not log you in.
5. Register/confirm a second test account you control (use another browser profile if needed). Its profile must be separate. Signing in as B must not display A's saved name or preferences.
6. From sign-in, request a password-reset email. Open it in the initiating browser, choose matching new passwords, and confirm the new password works on the next login.
7. Review `supabase/tests/live_rls.sql`. In a new SQL Editor query, paste it and replace `USER_A_UUID` and `USER_B_UUID` with the two actual IDs from Authentication > Users. These are IDs, not passwords or tokens. Do not modify the checked-in file to contain account-specific details.
8. Run the complete script after review. It creates temporary workout fixtures, tests profile save/read, switches to authenticated and anonymous roles, checks isolation and ownership, and rolls back everything. The final result should be **PASS: live RLS checks passed; all fixture changes rolled back.** If it fails, stop; run `rollback;` if needed and share only the error.

A normal administrator query in SQL Editor is not a valid RLS test: administrator access is expected to see records. The verification script switches roles deliberately. Its temporary claims simulate client identities to test database enforcement; the live browser steps separately test real Auth sessions and the Data API.

## Automated verification and limits

- `npm run check`: frontend tests, isolated PostgreSQL tests, TypeScript checking, and production build. Does not contact Supabase or create live accounts.
- `npm run test:db`: runs the exact migrations and seed in in-memory PGlite PostgreSQL, with emulated Supabase identity/roles. Tests anonymous denial, both users' reads, own writes, forged owners, cross-account parents, catalog permissions, history protection, cascades, invalid values, and the live verification script's rollback behavior.
- `npm run check:connection`: read-only Supabase Auth settings request using `.env.local`; prints only HTTP status and public feature flags.

PGlite is a development-only PostgreSQL test dependency and is not included in the frontend bundle. Its auth schema is a minimal local test fixture; it does not replace tests on your hosted Supabase installation. Auth UI tests use mocked SDK responses: passing them is not evidence that production email delivery or a real user session has passed.

Stage 2 is complete only after both migrations are applied and real registration/login/logout/recovery, profile persistence, and the live RLS test succeed. Until then, report the remaining work explicitly. Routine recommendation/editing, workout logging screens, and comparisons remain later stages.

## Operational notes

Personal records may be deleted by their owner under RLS; a self-service account-deletion UI is outside this stage. Account-owner/admin deletion through Supabase cascades personal application rows. Before public launch, document and verify account deletion and the backup/export/recovery options available on the selected Supabase plan. No backup configuration or paid service purchase has been performed here.

Official references: [Auth](https://supabase.com/docs/guides/auth/passwords), [redirects](https://supabase.com/docs/guides/auth/redirect-urls), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
