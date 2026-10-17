# Fitness App — session handoff

Last feature commit: `e80df1e` (final routine-save review). Documentation-only handoff; no application changes in this update.

## Scope and working rules

- Keep all file access and project operations inside `~/fitness-app`. Never print or commit credentials; do not read local environment contents into tool output.
- Stage 3 is authorized. **Stage 4 and later require approval. Hosted schema changes always require explicit review/approval.** The user chose the Supabase SQL Editor workflow; the agent has not applied hosted SQL.
- Prefer a working MVP, small testable changes, Git commits, and automated verification. Explain major decisions and how to test them. No paid AI API.
- `SPEC.md` is the product contract. Its initial inspection describes historical startup conditions; the latest implementation/review sections and `docs/ROUTINE_SAVE_REVIEW.md` describe current state.

## Architecture and stages

React + TypeScript + Vite + React Router, plain CSS, Supabase JS SDK. Supabase Auth handles email/password accounts; its Data API and PostgreSQL RPCs provide the backend. RLS and composite ownership foreign keys enforce data isolation. No separate application server.

- **Stage 1 complete:** frontend shell, routes, configuration, build/test setup.
- **Stage 2 implemented:** registration, login, local-browser logout, confirmation/recovery routes, protected profile management, schema/RLS/seed. User confirms hosted registration, login, profile save, and the row in `public.profiles`. Full hosted acceptance remains incomplete below.
- **Stage 3 implemented locally:** profile-based rule recommendations, custom routine creation/editing/reordering, prescription display, archive confirmation/viewing, fresh Supabase reads, atomic save integration. **Hosted routine saving is blocked until final migration 003 is approved/applied.**
- **Stages 4–6 unstarted:** workout drafts/sets/substitutions; comparisons/trends; public deployment. No public deployment URL exists yet. Planned hosting is Sites static hosting with SPA fallback; Supabase remains the database.

## Product and design decisions

- Versioned deterministic recommendation rules (`rules-1.0`), using saved goal, experience, weekdays, equipment, and a small live exercise catalog. Explain feasibility gaps instead of inventing exercises or inappropriate plans.
- Sources: ACSM 2026 resistance-training summary, CDC adult activity guidance, NSCA program-design material. Exact sets/reps/rest are editable app defaults; never guarantee results by a timeline. Timeline is a review point.
- Persist plans separately from performed sessions. Archive/version referenced routines instead of destroying history. Store loads in kg eventually, with kg/lb display and consistent per-implement conventions.
- Detect timezone automatically on profile save using `Intl.DateTimeFormat().resolvedOptions().timeZone`, fallback UTC. **No timezone question.** Keep `profiles.timezone`; future date displays and weekly boundaries must use it explicitly.
- Distinctive training-journal aesthetic: serif typography, paper/ink palette, vermilion accents, ruled texture, CSS variables, restrained motion respecting reduced-motion preferences. Avoid generic Inter/Arial/Roboto/system-led designs and cookie-cutter layouts; preserve accessibility/mobile usability.
- Postpone advanced charts, countdown timers, extensive filtering, and a large catalog. No nutrition, rehabilitation, wearables, social features, or paid AI in MVP.

## Supabase state and configuration

Ten application tables from migration 001:

- Personal: `profiles`; `routines` → `routine_days` → `routine_exercises`; `workout_sessions` → `session_exercises` → `workout_sets`.
- Read-only public catalogs: `evidence_sources`, `exercises`, `exercise_alternatives`.
- Supabase manages `auth.users`. Personal tables use owner-only RLS; all ten tables enable/force RLS. Composite foreign keys prevent cross-owner parents and wrong routine/day combinations.

Migrations in `supabase/migrations/`:

1. `202610170001_schema.sql`: tables, constraints, indexes, RLS/grants, timestamp helper/triggers. Initial schema is present on the hosted project; do not rerun blindly.
2. `202610170002_reference_seed.sql`: 3 sources, 12 exercises, 12 directional alternative links. Hosted counts were verified read-only.
3. **`202610170003_routine_save.sql`: final reviewed draft, NOT approved/applied as of this handoff.** Creates `fitness_save_routine(uuid,jsonb,uuid,timestamptz)` and replaces existing `fitness_touch_updated_at()`. No table/column/policy changes or existing-row rewrites on application. Do not use an older draft. If any version was already installed after this handoff, inspect/prepare an explicit upgrade rather than blindly rerunning `CREATE FUNCTION`.

`.env.local` is configured locally and Git-ignored. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` belong in frontend configuration; no database password, secret/service-role key, or personal access token. Never include values in notes/output. No administrative Supabase connector/CLI was available in this session.

Auth uses PKCE, session persistence/refresh, and email confirmation. Local app: `http://127.0.0.1:5173`; dashboard redirect allowlist should include `/auth/callback` and `/auth/reset-password` at that origin. Use the initiating browser for email links. Production SMTP/delivery and final auth URL settings remain to verify.

## Final save-function decisions

- Strict JSON types, required fields, unknown-field rejection, name/notes/metadata bounds, integer ranges, and a 2 MiB document limit.
- Authenticated-only execution; explicit null-identity guard; `SECURITY INVOKER`, empty search path, schema-qualified relations. RLS stays enabled.
- Per-user transaction advisory lock plus routine row lock; exact loaded `updated_at` is the edit precondition. Do not round-trip that token through JavaScript `Date` and lose microseconds.
- Cumulative `_save_receipts` in existing assumptions preserve earlier successes after later edits. SHA-256 covers normalized document, routine ID, and expected version. Browser bookkeeping is ignored; repository strips it from editable documents. Replays acknowledge success without reverting later edits or unarchiving. Contract assumes app RPC writes and retained receipt metadata/routine rows.
- Timestamp helper now gives routine updates strictly increasing `greatest(clock_timestamp(), old.updated_at + 1 microsecond)` tokens; profile timestamp behavior stays unchanged.
- Editing a routine with any session creates a new active version and archives the original atomically, preserving original prescriptions, snapshots, and sets. A failed save rolls back everything.

## Verification and remaining limits

Last passed after review:

- `npm run check`: **216 tests / 12 files**, including **122 isolated PostgreSQL tests**, plus TypeScript and production build.
- `npm run test:db:concurrency`: **6 real multi-connection scenarios** on disposable local PostgreSQL 18.4: identical saves, conflicting edits, late retries, concurrent archive, and both workout/edit orderings. Also checks another user is not blocked by the first user's lock.
- Earlier hosted read-only checks: Auth HTTP 200 with email sign-in/confirmation enabled; seven personal-table anonymous reads HTTP 401; three public catalogs HTTP 200 with expected counts.

**Not verified:** hosted two-signed-in-user isolation; hosted routine save/edit/archive/reload/sign-in persistence with final RPC; live logout/password recovery/email delivery; full real-browser E2E/accessibility. UI tests mock SDK responses; PGlite/native tests emulate Supabase identities. Local passes do not certify hosted policies or JWT/email integration. No hosted access occurred during the final migration review.

Known limitations: bodyweight-/band-/machine-only profiles may get no complete suggestions because catalog coverage is limited; dumbbell plans assume suitable bench/seat/support. Unsaved routine drafts disappear on page refresh. If an edit replaces a day before a new session commits its old-day reference, PostgreSQL safely rejects the session insert; Stage 4 must reload/retry, never bypass the FK or claim success.

## Exact next steps for Stage 3

1. Read the final review and migration 003. Confirm whether the user has since approved/applied it; **do not execute hosted schema changes without approval**.
2. After approval, guide the user to run the complete final 003 file once in Supabase SQL Editor, keeping `begin`/`commit`. Do not rerun 001/002. If SQL fails, stop, obtain only the error text, and address it locally.
3. Run the app, sign in, open **Routines**, review a compatible recommendation, customize/save it, then verify refresh and logout/login persistence. Also create/edit/archive a custom plan and check archived content remains visible. Do not select equipment the user lacks just to force recommendations.
4. Have the user create/use two verified test accounts they control. Review/run `supabase/tests/live_rls.sql` and `live_routine_save.sql` in SQL Editor with test UUID placeholders replaced only in the editor. Both roll back temporary writes. Never request passwords in chat or store user IDs in tracked scripts. Record actual results, not assumptions.
5. Verify hosted logout/recovery and auth/email configuration. Fix any Stage 3 usability or persistence defects found, add focused tests, and rerun relevant checks. Keep sources/limitations visible and maintain the small catalog unless expansion is explicitly scoped.
6. Update status only after live acceptance. Stop and request Stage 4 approval before implementing workout logging or comparisons.

## Files and commands to inspect first

- `SPEC.md`, `docs/ROUTINE_SAVE_REVIEW.md`, `docs/STAGE_3.md`, `docs/STAGE_2_REVIEW.md`, `docs/SUPABASE_SETUP.md`, `README.md`.
- All three `supabase/migrations/` files; `supabase/tests/schema.test.ts`, `live_rls.sql`, `live_routine_save.sql`.
- `src/features/routines/{recommendations,routineValidation,repository,types}.ts`, `RoutinesPage.tsx`, `RoutineEditor.tsx`, and adjacent tests.
- `src/features/auth/`, `src/features/profile/`, `src/lib/supabase.ts`, `src/lib/supabaseConfig.ts`, `src/App.tsx`, `src/styles.css`.
- `scripts/test-routine-concurrency.mjs`, `scripts/check-live-security.mjs`, `scripts/check-supabase.mjs`, `package.json`, `.gitignore`.

Run `npm run dev`; `npm run check`; `npm run test:db`; optional `npm run test:db:concurrency`. Native concurrency tests use development-only `embedded-postgres`, need local process/socket permission, never read Supabase configuration, and keep disposable files/sockets under ignored `.test-postgres/`. npm cache stays in `.npm-cache/`. `npm run check:connection` and `npm run check:security:live` are explicitly hosted read-only checks; obtain any required network permission. Avoid unnecessary hosted calls during documentation-only work.
