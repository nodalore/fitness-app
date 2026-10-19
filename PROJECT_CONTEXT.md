# Fitness App — project handoff

Last reviewed: 2026-10-19. This document describes the state at Git commit `4b97306d6447fe4720f2e26a6733caf608b130bb`; it is the current handoff. Re-read it alongside the latest user instructions, `SPEC.md`, and the current top of `NOTES.md` before continuing.

## Purpose and current product

Fitness App is a responsive training planner and workout journal. It helps people maintain a profile, explore a deterministic suggested routine, create and manage custom routines, log actual workouts, and review completed workout history. Its visual identity is charcoal with warm beige accents, a credited local gym image, and restrained editorial typography.

Current pages and routes:

- `/`: minimal public landing page with the gym photograph, “Make your training easier.” and “Explore our approach.”
- `/about`: personal creator note and clickable email address.
- `/login`, `/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/callback`: Supabase email/password auth, verification and recovery paths.
- `/dashboard`: profile summary, active plan count, and links to routines.
- `/routines`: Discover/recommendation, saved routines, routine editor, Today's Workout, archive/restore/delete controls.
- `/history`: read-only completed Workout History.
- `/profile`: name, required gender (including Prefer not to say), fitness goal, experience and training days per week.

Recommendations are deterministic and based on goal, experience and training frequency; the app does not assign invented weights. A recommendation is saved only when the user explicitly uses it. Custom exercises are free text. Planned targets are separate from actual performance. Today's Workout supports routine/session selection, substitutions/additions/skips, per-set actual values in lb/kg, autosave, resume, finish and cancellation. History shows snapshots and performed set values, not current routine data.

No charts/advanced analytics, Stage 5, medical personalization or coaching/social features are implemented.

## Stack and deployment

- React 19, TypeScript 7, Vite 8, React Router 8, plain CSS.
- Supabase JavaScript client and Supabase Auth/Postgres/RLS.
- Vitest, Testing Library, PGlite/embedded PostgreSQL, and Playwright MCP for isolated browser acceptance.
- Node engine requirement: `>=22.12.0`; npm scripts are in `package.json`.
- GitHub repository: `https://github.com/nodaloree/fitness-app` (origin is `https://github.com/nodaloree/fitness-app.git`). Main is pushed and tracks origin/main.
- Vercel hosts the Vite SPA at `https://fitness-app-sooty-six.vercel.app`. `vercel.json` rewrites all paths to `/index.html` to allow React Router deep links and refresh. Commit `4b97306` added this fix and a config regression test. The code was pushed for Vercel redeployment; this handoff does not independently establish the deployment’s current Ready status.
- Build: `npm run build` runs TypeScript and Vite. `npm run check` runs all Vitest tests, then typecheck and production build.
- Browser Supabase configuration uses exactly `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; see `.env.example`. Values come from Supabase Connect / Settings → API Keys. Use only the HTTPS project URL and `sb_publishable_...` key. These are client-visible; no server secret is expected or required for this static app. Never commit `.env.local` or Vercel values.
- Vercel production env variables must be configured in the Vercel project and a new deployment triggered after changes. Supabase Auth Site URL and exact production redirect allowlist should include the production origin plus `/auth/callback` and `/auth/reset-password`; verify in Supabase before live signup/recovery acceptance.

## Authentication and email limitations

The client uses PKCE, persists and refreshes the browser session, detects auth callback URLs, restores session at startup, and listens for auth-state changes. Passwords are passed to Supabase Auth and are not stored in application tables. The login form sends users to Profile after success; expired/missing reset sessions render a message with a link to request another email. The callback page recognizes `error` in query/hash, cleans the URL after auth initialization and explains that an invalid/expired confirmation link may need another attempt.

Important operational caveats:

- Supabase's default email sender is limited/rate-limited and is not a reliable public signup/recovery mail service. Custom SMTP should be configured in Supabase Auth for public use; SMTP credentials belong only in the Supabase dashboard.
- Email confirmation remains enabled. Signup completion depends on clicking the verification email in the browser that initiated signup (PKCE). Do not disable confirmation as a workaround.
- The user reported a password recovery redirect containing `error_code=otp_expired`. This is a separate expired/invalid OTP issue, not a Vercel routing issue. The Vercel rewrite allows the React reset page to load and explain expiration; it cannot renew the token. Request a fresh reset email and open it promptly in the same browser. If repeated, inspect Supabase Auth email delivery/rate limits, Site URL/redirect allowlist, SMTP, and expiry configuration. Never ask the user to paste a recovery URL/token.
- Hosted signup/verification/recovery has not been fully re-accepted in this session. Passing mocked auth tests does not establish SMTP delivery or hosted OTP success.

## Database schema and migration state

Hosted installation status is based on user confirmations: migrations **001–009 are applied**. Migration 010 is committed locally but **not confirmed applied**. Do not execute any SQL or claim migration-010 hosted behavior is available without explicit user approval and confirmation. Do not edit migrations 001–009.

Migration files (timestamps are local names):

1. `202610170001_schema.sql`: base tables, constraints, indexes, composite owner FKs, RLS/grants and reference structures.
2. `202610170002_reference_seed.sql`: curated evidence, exercise and alternative data.
3. `202610170003_routine_save.sql`: atomic/versioned routine save RPC and timestamp helper.
4. `202610180004_profile_frequency.sql`: `training_days_per_week` and optional `equipment_details` additions.
5. `202610180005_catalog_expansion.sql`: additive catalog/evidence/alternatives seed expansion.
6. `202610180006_profile_gender.sql`: nullable constrained gender preserving legacy NULLs; UI requires explicit selection.
7. `202610180007_custom_planning.sql`: free-text exercise source, legacy vs per-set planning, owned `routine_planned_sets`, owner checks and v2 routine RPC.
8. `202610180008_workout_saving.sql`: actual workout snapshots, revisions, receipts, guarded actual child writes, authenticated save RPC and completed immutability.
9. `202610180009_cancel_workout.sql`: cancellation tombstones/guards and authenticated RPC so late retries cannot recreate a canceled draft.
10. `202610180010_routine_management.sql`: local forward-only routine archive/restore/permanent-delete RPC and guards. Security reviewed/tested locally, but hosted application is pending.

Core tables:

- `profiles`: one private row per `auth.users` owner. Legacy fields remain for compatibility; UI currently collects the five product fields listed above.
- Public read-only catalog: `evidence_sources`, `exercises`, `exercise_alternatives`.
- Owned planning: `routines` → `routine_days` → `routine_exercises` → optional `routine_planned_sets`. Exercises may be catalog references or custom names. Legacy aggregate targets remain readable; per-set planned reps/load and entered kg/lb units are supported.
- Actual training: `workout_sessions` → `session_exercises` → `workout_sets`. Workout roots retain routine/session snapshots, revision/status/timestamps and source-version metadata. Actual exercises preserve entered names, source/planned-name hints, positions and skipped/removed state. Sets retain actual reps, canonical kg load, original entered load/unit and performed/completion state. `workout_save_receipts` make retry acknowledgements idempotent. `workout_cancellations` prevents a late save from recreating a canceled session. Migration 010 adds `routine_deletions` tombstones.

Security/integrity model:

- Private tables use RLS with owner-qualified rows and grants; several tables use FORCE RLS. Composite foreign keys carry `user_id` through parent/child links, preventing cross-account attachment.
- Shared catalog rows are client read-only. Catalog writes are deployment-controlled.
- Routine and workout writes use authenticated RPCs with bounded payload validation, expected-owner checks, idempotency tokens, and concurrency/version checks. Workout completion snapshots and actual values are protected from application-role edits/deletion.
- Save receipts cannot be forged through direct authenticated table writes. Child-write guards serialize edits with finish. Cancellation and routine management are race-aware.
- Migration 010 preserves completed history by detaching source routine references only through a tightly authorized deletion operation; completed names, dates, exercise snapshots, sets, reps, loads, units and receipts stay intact. Unfinished sessions block source routine deletion. Do not claim this feature's hosted security protection until 010 is installed.
- Local PGlite/native PostgreSQL role tests are meaningful security evidence but do not replace hosted post-migration acceptance against Supabase JWT/PostgREST behavior.

## Important recent work and decisions

Recent commits on `main` (newest first):

- `4b97306` — Vercel SPA deep-link rewrite. Direct `/auth/reset-password`, callback, dashboard, routines, profile and history requests fall back to the SPA shell. Expired `otp_expired` remains handled by React as an auth-token issue.
- `72553dc` — sign-in gym photo/glass-panel styling and removal of the unnecessary “Targets unset” badge.
- `8143c91` — Workout History, routine management UI and documentation/features assembled; includes local migrations 009/010 and security tests.
- `df4f133` — workout saving security and corrected migration 008.
- `9b320be` — workout save/resume implementation.
- `24be683` — Stage 3 checkpoint and the local `stage-3-stable` backup ref.

Key UX and behavior choices:

- Home is minimal: one photo, one headline and one action. The brand always navigates to `/` whether authenticated or signed out.
- Sign-in uses the existing credited gym photo, charcoal/beige palette and a frosted/mirrored panel; registration/recovery framing otherwise retains the prior style.
- Exercise descriptions are opt-in and single-open; exercise photographs were removed. Empty planned targets do not display a “Targets unset” badge and are not fabricated.
- Existing routine editor forms start collapsed; an explicit row selection opens exactly one editor. Unsaved changes persist while switching/collapsing. New routine exercise input still starts empty.
- Workout History is compact and read-only, uses the actual saved unit/value snapshots, and labels replacements/skips/additions.
- The Vercel rewrite is a minimal wildcard source to `/index.html`, as recommended for static Vite SPA deep links.

## Verification record

Latest full app check after adding `vercel.json`:

- `npm run check`: **513 tests passed across 29 files**.
- TypeScript (`tsc --noEmit`) passed.
- Vite production build passed.
- `git diff --check` passed before the routing commit.
- Last local native PostgreSQL security/concurrency run reported **39 scenarios passed** (routine save/edit races, cancellation/finish/save races, RLS/ownership and migration-010 detachment/delete protection). These were disposable local databases, not hosted tests.
- UI Playwright work used isolated/synthetic contexts where noted in NOTES; it did not use real credentials or hosted account data.
- The Vercel rewrite config test verifies the wildcard `/`-to-`index.html` rewrite. Existing auth page tests verify an absent/expired recovery session shows a recovery-email action.

Current tip at review was `4b97306d6447fe4720f2e26a6733caf608b130bb`, clean `main`, tracking `origin/main`. The local `stage-3-stable` branch points to `24be6832b37180e8846fbe1c832847238f6599f1` and must remain preserved. Do not reset/rebase or force-push.

## Open work and recommended next steps

1. Confirm the latest Vercel deployment for commit `4b97306` is Ready. Direct-open and refresh `/auth/reset-password`, `/auth/callback`, `/auth/forgot-password`, `/dashboard`, `/routines`, `/profile`, and `/history`. Confirm the reset page gracefully shows expired-link guidance for an expired `otp_expired` URL. Avoid exposing full token-bearing URLs in screenshots/logs.
2. Verify Vercel env variable names are configured (do not print their values): `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Check Production and Preview scopes as needed.
3. Confirm Supabase Auth production Site URL and exact callback/reset redirect allowlist. Verify signup confirmation and password recovery with an account controlled by the user; do not use or request passwords in chat. If mail is throttled, wait/use supported provider limits and configure custom SMTP in Supabase dashboard.
4. Migration 010: user previously asked for final local security review; it passed 21 focused PostgreSQL tests plus 39 native scenarios. It remains unapplied hosted. Show/confirm approval before execution; after user reports success, run dedicated owner/isolation/Archive/Restore/Delete/history-preservation acceptance with permitted disposable test accounts/data.
5. Do not push backup branches, modify Stage 3 history, alter installed migrations or start additional features without user direction.

Historical documentation (`README.md`, `docs/STAGE_2_REVIEW.md`, stage milestone docs and older NOTES entries) was written at earlier checkpoints and can claim older schema/status/stage/deployment state. Prefer current user confirmation, this handoff, current files and latest NOTES entries. Correct stale docs only when asked or when needed for the authorized task.
