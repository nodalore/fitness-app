# Fitness App — agent instructions

## Project and source of truth

- Work only inside this repository (`~/fitness-app`). Preserve existing Git history and user data.
- Read `PROJECT_CONTEXT.md` first for the current product, schema, deployment, and milestone state. Then read `SPEC.md`, the latest sections at the top of `NOTES.md`, and feature-specific docs before making changes. `NOTES.md` and many `docs/STAGE_*.md` files contain historical handoffs; old status statements can be superseded by newer user confirmations and later sections.
- Treat the user's latest explicit request as authorization and scope. Do not infer permission for another milestone, hosted operations, destructive data changes, or deployment/publishing.
- Keep changes small and focused. Do not redesign unrelated pages or change auth, routine, workout, or data behavior for a copy/style request.

## Architecture

- Frontend: React, TypeScript, Vite, React Router, plain CSS and `@supabase/supabase-js`.
- `src/App.tsx` owns the public shell, navigation, page routes and app-level scroll/focus behavior. Feature code is in `src/features/{auth,dashboard,profile,routines,workouts}`. Shared visual controls and the local gym image are in `src/components/ui.tsx` and `public/images/`.
- Supabase is the persistence/auth service. The browser uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; Vite embeds `VITE_` values into client assets, so they must never contain secrets. The client rejects non-HTTPS project URLs and secret/legacy keys.
- Routine/workout multi-table writes use validated PostgreSQL RPCs. Preserve the idempotency, owner checks, revision/conflict handling and history snapshots.
- `vercel.json` provides a Vite SPA rewrite to `/index.html`; preserve direct navigation and refresh for React Router paths.

## Product/data invariants

- Keep authentication, RLS, ownership, existing profiles, saved routines, actual workouts and completed history intact.
- Installed hosted migrations 001–009 are immutable; do not edit or re-run them. Migration `202610180010_routine_management.sql` is a local forward-only draft, **not confirmed installed in hosted Supabase**. Never execute hosted SQL unless the user explicitly approves that operation.
- Migration 010 enables the current Archive/Restore/Delete UI. Until the user confirms it was installed, do not claim those hosted actions work. Completed workout history is snapshot-based and read-only; routine deletion must preserve it. Unfinished workouts block routine deletion. Do not cascade-delete history.
- Planned routine targets and actual workout performance are separate. Adding an actual set logs a performed set; there is no Done checkbox. Never fill planned or actual weights/reps/sets automatically.
- Exercise names can be free text. Do not inject placeholder exercises. Editing an existing routine must preserve exactly its saved exercises and draft edits. Recommendation previews must not save until the user chooses Use This Routine.
- Workout cancel/delete, finish, retries, refresh recovery and ownership are race-sensitive; retain regression coverage and database guards.

## Style and accessibility

- Preserve the dark charcoal and warm beige visual identity. Reuse CSS variables and shared controls; avoid generic font or card substitutions.
- Keep mobile layouts responsive and avoid overflow. Preserve keyboard focus, semantic labels, accessible names, route focus/scroll behavior, and reduced-motion support.
- Keep workout history read-only. Don't add charts, analytics or Stage 5 work without authorization.

## Security and external systems

- Never read, print, commit, or copy `.env.local`, Vercel environment values, passwords, API secrets, access/refresh tokens, or personal workout data. `.env.example` contains placeholders only. If a credential scan is needed, report filenames/pattern categories without printing matched values.
- Never put SMTP credentials, service-role/secret keys, database passwords, or Supabase access tokens in source or any `VITE_` variable. Publishable Supabase keys are browser-visible.
- Unit and local PostgreSQL tests must not contact hosted Supabase. Use synthetic accounts/data. Hosted tests and real writes need explicit user authorization.
- Do not push, deploy, or publish unless the user explicitly asks. Check remote/branch/status first. Preserve the local `stage-3-stable` branch; do not push it unless requested.

## Development and checks

- Dependencies are installed with npm. `npm run dev` starts Vite. The app requires Node `>=22.12.0`.
- `npm run test` runs Vitest. `npm run typecheck` runs `tsc --noEmit`. `npm run build` type-checks and creates the Vite production build. `npm run check` runs tests and build together.
- `npm run test:db` runs migration/schema tests locally. `npm run test:db:concurrency` starts disposable embedded PostgreSQL and tests real transaction races/security locally; it does not contact hosted Supabase. `npm run check:connection` is a hosted read-only Auth probe and must not be run unless explicitly requested. `npm run check:security:live` is hosted access and likewise needs explicit approval.
- For browser verification, use a fresh isolated context, synthetic data, block external requests/WebSockets, never reuse a real signed-in browser, and inspect screenshots as well as layout metrics.
- Before finishing: inspect `git diff --check`, tests appropriate to the change, typecheck/build when requested or relevant, `git status`, and the exact changed files. Do not stage unrelated user work.
