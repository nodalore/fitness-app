# Fitness App — session handoff

Updated 2026-10-18. Last feature commit recorded in the previous handoff: `e80df1e` (final routine-save review). This update changes SPEC.md and NOTES.md only; no application, SQL, dependency, or hosted changes.

**Latest user confirmation:** all three hosted Supabase migrations, including `202610170003_routine_save.sql`, executed successfully. Full live routine-saving/persistence and signed-in user-isolation verification remain pending. Do not ask the user to reinstall migration 003. Comprehensive Stage 3 refinement implementation awaits approval of the plan in [SPEC.md §18](SPEC.md#18-stage-3-refinement-proposal--awaiting-implementation-approval).

## Scope and working rules

- Keep all file access and project operations inside `~/fitness-app`. Never print or commit credentials; do not read local environment contents into tool output.
- Existing Stage 3 work was authorized. The current request authorizes research, diagnosis, and documentation only; **wait for plan approval before any refinement implementation**. Stage 4 and later remain unstarted and require separate approval. Hosted changes always require explicit review/approval, including additive profile/catalog migrations. The user executed migrations 001–003 through SQL Editor; the agent has not applied hosted SQL.
- Prefer a working MVP, small testable changes, Git commits, and automated verification. Explain major decisions and how to test them. No paid AI API.
- `SPEC.md` is the product contract. Its current status and §18 supersede old migration-installation instructions in `docs/STAGE_3.md` and historical reviews. Those files were not edited in this two-document update. The initial inspection is historical; the current app must be preserved.

## Architecture and stages

React + TypeScript + Vite + React Router, plain CSS, Supabase JS SDK. Supabase Auth handles email/password accounts; its Data API and PostgreSQL RPCs provide the backend. RLS and composite ownership foreign keys enforce data isolation. No separate application server.

- **Stage 1 complete:** frontend shell, routes, configuration, build/test setup.
- **Stage 2 implemented:** registration, login, local-browser logout, confirmation/recovery routes, protected profile management, schema/RLS/seed. User confirms hosted registration, login, profile save, and the row in `public.profiles`. Full hosted acceptance remains incomplete below.
- **Stage 3 implemented locally:** profile-based rule recommendations, custom routine creation/editing/reordering, prescription display, archive confirmation/viewing, fresh Supabase reads, atomic save integration. **Migration 003 is installed per user confirmation; the setup blocker is resolved, but hosted functional/isolation acceptance is pending.**
- **Stages 4–6 unstarted:** workout drafts/sets/substitutions; comparisons/trends; public deployment. No public deployment URL exists yet. Planned hosting is Sites static hosting with SPA fallback; Supabase remains the database.

## Product and design decisions

- Current implementation uses deterministic `rules-1.0` with weekdays and the small live catalog. Proposed `rules-2.0` uses goal, experience, confirmed equipment and desired weekly sessions (2–6), ordered workouts without fixed weekdays, purposeful A/B variation, explicit exercise suitability rankings, audited volume, stable anchors, and explained feasibility gaps. New rules apply only to new plans; never regenerate saved routines silently.
- Evidence proposal: peer-reviewed ACSM/JSCR/BJSM publications and NSCA professional guidance are the primary basis; individually cited Menno Henselmans and Legion articles are supplementary commentary. SPEC.md §18 records citations, limitations, access levels, and rule implications. Create the source-to-rule register after approval. Exact sets/reps/rest and split choices remain editable app heuristics; timeline is a review point and no result is guaranteed.
- Persist plans separately from performed sessions. Archive/version referenced routines instead of destroying history. Store loads in kg eventually, with kg/lb display and consistent per-implement conventions.
- Detect timezone automatically on profile save using `Intl.DateTimeFormat().resolvedOptions().timeZone`, fallback UTC. **No timezone question.** Keep `profiles.timezone`; future date displays and weekly boundaries must use it explicitly.
- New design requirement supersedes the paper/ink/vermilion journal aesthetic: original premium dark fitness interface, charcoal cards, warm beige accents, elegant typography, rounded components, compact interactive workout cards, rights-cleared photography, and mobile-first navigation. Inspiration: [Majarul Islam’s Elevate reference](https://dribbble.com/shots/25204004-Elevate-Your-Ultimate-Fitness-Companion). Direct visual access was limited during planning; review visually before implementation. Redesign dashboard, profile, recommendations, saved/archived routines, planned-workout details, editor, public/auth/recovery screens and all states consistently. Share tokens/components with future Stage 4; no logging or fabricated metrics now. Record image/font licenses and maintain accessibility.
- Postpone advanced charts, countdown timers, extensive filtering, and a large catalog. No nutrition, rehabilitation, wearables, social features, or paid AI in MVP.

## Supabase state and configuration

Ten application tables from migration 001:

- Personal: `profiles`; `routines` → `routine_days` → `routine_exercises`; `workout_sessions` → `session_exercises` → `workout_sets`.
- Read-only public catalogs: `evidence_sources`, `exercises`, `exercise_alternatives`.
- Supabase manages `auth.users`. Personal tables use owner-only RLS; all ten tables enable/force RLS. Composite foreign keys prevent cross-owner parents and wrong routine/day combinations.

Migrations in `supabase/migrations/`:

1. `202610170001_schema.sql`: tables, constraints, indexes, RLS/grants, timestamp helper/triggers. Initial schema is present on the hosted project; do not rerun blindly.
2. `202610170002_reference_seed.sql`: 3 sources, 12 exercises, 12 directional alternative links. Hosted counts were verified read-only.
3. **`202610170003_routine_save.sql`: successfully executed on hosted Supabase, per user confirmation on 2026-10-18.** Creates `fitness_save_routine(uuid,jsonb,uuid,timestamptz)` and replaces existing `fitness_touch_updated_at()`. No table/column/policy changes or existing-row rewrites on application. Do not rerun it or edit the installed migration as an upgrade strategy. Any future function change requires a separately reviewed forward migration. Successful execution is not full live acceptance evidence.

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

## Diagnosis and proposed compatibility decisions

- Split sessions pass global indices 0/2 (Upper) and 1/3 (Lower) to `matches[index % length]`; with two candidates, each family repeats its exercises. Foundation/standard mainly differ by sets. Outside the strength goal, cycling can choose bodyweight squats for experienced gym users. Experience does not meaningfully rank exercises; tests miss these regressions. The catalog lacks several patterns/accessories needed for credible variety.
- Replace indexing with explicit ranked template roles and A/B occurrence counts; retain main lifts across weeks and vary appropriate accessories/emphasis when choices exist. Prefer suitable loadable working exercises for experienced users, without assuming machines are inferior or advanced users need complex lifts. Target a small, justified expansion of roughly 12–18 catalog entries, each with requirements, loading convention and a documented alternative; no large library rebuild.
- Replace profile weekday selection with desired sessions/week (2–6). Proposed migration 004 adds nullable checked `training_days_per_week`; retain `available_weekdays` and every saved field/value. No automatic backfill: show distinct legacy weekday count as a suggestion only for 2–6 and require explicit confirmation; legacy 1/7 counts require choosing a supported count. Saving a new preference never rewrites legacy weekdays. Timezone detection already exists: keep it and UTC fallback, with no timezone question.
- Install a reviewed additive migration before deploying the new client. Existing clients remain compatible; explicit new count is authoritative even if an old client edits legacy weekdays. New routine workouts use the existing nullable `weekday` plus `position`/`name`; preserve weekdays in existing saved routines unless deliberately edited. No save-RPC change is expected.
- Tentative session templates: 2 Full Body A/B; 3 Full Body A/B/C; 4 Upper A/Lower A/Upper B/Lower B; experienced 5 Upper/Lower/Push/Pull/Legs; experienced 6 Push/Pull/Legs A/B. These are practical heuristics, with volume budgets and recovery advice, not claims of a superior split. Beginners requesting high frequency see an explained conservative alternative. Equipment gaps may reduce options; never silently cap experienced plans at four sessions.
- Broad machine/dumbbell/barbell selections cannot prove ownership of each machine or support. Require explicit equipment/support confirmation; determine whether any extra persisted detail is needed when drafting migration 004 and include it in review. Proposed additive migration 005 covers exact new catalog/source rows after local review; do not rewrite installed seed 002. All hosted SQL remains approval-gated.

## Exact next steps for Stage 3

1. Present the diagnosis and the focused plan in SPEC.md §18; wait for the user's approval before implementing anything. Do not treat the redesign request as permission to start Stage 4 or modify hosted Supabase.
2. After approval, finalize the compatibility/evidence contract and exact catalog scope; prepare additive migrations 004/005 locally with populated-schema upgrade and RLS tests. Approval of local implementation does not approve applying hosted SQL.
3. Define the original dark/beige design system, licensed photo/font provenance, responsive navigation and representative screen layouts for review, using the existing React/router/auth/repository structure.
4. Implement the count questionnaire and compatible reads/writes, `rules-2.0` rankings and stable templates, then integrate dashboard, recommendations, saved/archived routines, workout-plan details and editor. Restyle remaining public/auth/recovery surfaces consistently. Preserve retry receipts, microsecond conflict tokens, archive/history semantics and account-switch clearing.
5. Verify goal × experience × session-count × equipment cases, purposeful variation and loaded-squat regressions, weekly volume/coverage, legacy profile preservation, stable saved routines, UI/error/retry and mobile/accessibility/auth flows. Run `npm run check`; rerun native concurrency tests if save semantics change. Old recorded test passes are not validation of unimplemented refinements.
6. Review exact new hosted SQL with the user before their SQL Editor execution. Do not rerun 001–003. After installation and frontend integration, verify real save/create/edit/archive/reload and logout/login persistence, retry behavior, and two-signed-in-user isolation. Keep `live_rls.sql` and `live_routine_save.sql` rollback-only, using user-controlled test accounts and UUIDs substituted only in SQL Editor. Never request passwords or put identities in tracked files.
7. Verify live logout/recovery and auth/email configuration; record observed results. Refresh stage documentation and handoff after implementation. Stage 4 approval is a separate later checkpoint.

## Evidence reviewed for the refinement

Full citations, URLs and rule mapping are in SPEC.md §18:

- Currier et al., ACSM 2026 position stand, DOI 10.1249/MSS.0000000000003897 (abstract/official summary; full-text access blocked).
- Currier et al., BJSM 2023 prescription network meta-analysis (flexible loading/sets/frequency).
- Kassiano et al., JSCR 2022 variation systematic review, DOI 10.1519/JSC.0000000000004258 (systematic variation; limited population).
- Ramos-Campo et al., JSCR 2024 split/full-body meta-analysis, DOI 10.1519/JSC.0000000000004774 (volume-equated split choice; abstract-level access).
- Baz-Valle et al., PLoS ONE 2019 randomized variation trial, DOI 10.1371/journal.pone.0226989 (small, short trained-men trial; motivation is distinct from adaptation).
- Lincoln, Ill & Ibrahim, NSCA PTQ 2023 movement-pattern teaching guidance (professional education).
- Supplementary: Menno Henselmans, *How to keep building muscle after the newbie gains*; Michael Matthews, Legion *Ep. #616: How to Find the Best Workout Split for You* (2020). Commercial/editorial interpretations do not override research or professional guidelines.

Research and reference browsing occurred during this documentation update; no hosted Supabase calls or verification were performed. No application tests were rerun for these documentation-only edits. Previous 216-test/build and six-concurrency-scenario results above remain historical evidence only.

## Files and commands to inspect first

- `SPEC.md`, `docs/ROUTINE_SAVE_REVIEW.md`, `docs/STAGE_3.md`, `docs/STAGE_2_REVIEW.md`, `docs/SUPABASE_SETUP.md`, `README.md`.
- All three `supabase/migrations/` files; `supabase/tests/schema.test.ts`, `live_rls.sql`, `live_routine_save.sql`.
- `src/features/routines/{recommendations,routineValidation,repository,types}.ts`, `RoutinesPage.tsx`, `RoutineEditor.tsx`, and adjacent tests.
- `src/features/auth/`, `src/features/profile/`, `src/lib/supabase.ts`, `src/lib/supabaseConfig.ts`, `src/App.tsx`, `src/styles.css`.
- `scripts/test-routine-concurrency.mjs`, `scripts/check-live-security.mjs`, `scripts/check-supabase.mjs`, `package.json`, `.gitignore`.

Run `npm run dev`; `npm run check`; `npm run test:db`; optional `npm run test:db:concurrency`. Native concurrency tests use development-only `embedded-postgres`, need local process/socket permission, never read Supabase configuration, and keep disposable files/sockets under ignored `.test-postgres/`. npm cache stays in `.npm-cache/`. `npm run check:connection` and `npm run check:security:live` are explicitly hosted read-only checks; obtain any required network permission. Avoid unnecessary hosted calls during documentation-only work.
