# Fitness App

Stage 3: profile-based recommendations, a custom routine editor, saved-plan viewing, and archiving are implemented locally. Stage 2 accounts and profiles are working on Supabase as reported by the user. Routine saving requires review/approval of the atomic save-function migration; no live schema changes were made by the agent. See [Stage 3 setup and tests](docs/STAGE_3.md). Workout logging remains Stage 4.

## Run locally

Use Node.js 22.12+ (Node 24 recommended) and npm. From a terminal:

```sh
cd ~/fitness-app
npm ci
npm run dev
```

Open http://127.0.0.1:5173. If dependencies are already installed, skip `npm ci`. Stop the server with Ctrl+C. Port 5173 is fixed; if occupied, stop the other server first or pass `--port 5174`.

The public pages run without Supabase configuration. To prepare the connection, fill in the two public values in `.env.local` as described below. The app reports missing or invalid configuration without crashing. Never store service-role keys or database passwords in variables starting with `VITE_`: those values are exposed to browsers. Local `.env` files are ignored by Git.

## Automated checks

```sh
npm run check
```

This runs frontend/auth/profile tests and isolated PostgreSQL migration/RLS tests, strict TypeScript checking, and the production build. Tests do not use live account credentials or change your Supabase project. `npm run test:watch` runs tests while editing. The tests cover page landmarks, navigation and focus, direct route entry, evidence links, and recovery from an unknown URL. They are DOM-based tests, not a complete browser accessibility audit.

To serve the production build locally:

```sh
npm run build
npm run preview
```

Open http://127.0.0.1:4173. When publishing in a later stage, configure the host to serve `index.html` for app routes such as `/about`.

## Manual smoke test

1. Open the home page; confirm the connection-setup notice is visible.
2. Select **Our approach**, then **Back to home**; confirm each page and active navigation label changes.
3. Refresh `/about`; confirm it still loads.
4. Visit `/missing`; select **Back to home**.
5. Use Tab from the top of the page: the skip link should become visible, and navigation should have a visible focus outline. Activating a page link moves focus to the main content.
6. Narrow the window to phone width; cards should stack without horizontal scrolling.

## How the files work

- `index.html` loads `src/main.tsx`, which starts React and browser routing.
- `src/App.tsx` defines the shared header/footer and public/auth/profile/routine routes. The routine page is loaded on demand.
- `src/styles.css` provides responsive styling without an additional UI framework.
- `vite.config.ts` configures React development/build tooling and Vitest.
- `src/App.test.tsx` and `src/test/setup.ts` contain smoke-test setup and checks.
- `src/lib/supabaseConfig.ts` validates public settings; `src/lib/supabase.ts` provides `getSupabaseClient()`, a lazy shared client that returns null if configuration is unavailable.
- `src/lib/supabaseConfig.test.ts` and `src/lib/supabase.test.ts` check missing/invalid values, public-key validation, and single-client creation without making network requests.
- `src/vite-env.d.ts` types the frontend environment variables.
- `tsconfig.json` enables strict TypeScript checks.
- `package-lock.json` pins the installed dependency tree for reproducible `npm ci` installs.
- `.npmrc` keeps npm's cache within this project; `.gitignore` excludes dependencies, build output, cache, and local secrets.

## Configure your Supabase connection

Your `.env.local` is configured and ignored by Git. If recreating the setup, enter the project URL and publishable key from your Supabase project’s Connect panel:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

Do not use the dashboard URL or an API path such as `/rest/v1`. Save the file and restart `npm run dev`. The home page will report that configuration is loaded; this is a local configuration check, not a live connectivity or security test. The client accepts only HTTPS project URLs and `sb_publishable_` browser keys. There are no frontend administrative credentials.

To recreate the file if it is absent, copy `.env.example` to `.env.local`; do not overwrite existing values. You can verify exclusion with `git check-ignore .env.local`. Full dashboard and authorization steps are in [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

## Database setup and verification

Read [docs/STAGE_2_REVIEW.md](docs/STAGE_2_REVIEW.md) for the SQL review, exact SQL Editor steps, auth URL settings, and live test checklist. The initial two migrations have been applied by the user; do not rerun them. The new `202610170003_routine_save.sql` function migration is prepared for explicit review and approval before hosted execution. Never disable RLS or add public access policies to personal tables.

After applying them, select **Sign in → Create an account**, confirm email, and save your profile. Refresh and sign out/in to verify persistence. The guide explains testing two-account isolation and recovery. `supabase/tests/live_rls.sql` is a separate reviewed, rollback-only verification script, not a migration.

`npm run test:db` runs local security tests; `npm run check:connection` checks live Auth connectivity using only the public settings. Auth unit tests are mocked; local database tests emulate Supabase roles and cannot replace live acceptance checks.

The MVP prioritizes secure accounts, persistence, workout logging, basic recommendations/comparisons, substitutions, and public deployment. Advanced charts, countdown timers, extensive filtering, and a large exercise library are postponed. The agent verified read-only Auth connectivity (HTTP 200); no live Supabase changes or deployment have been performed. Stage 3 is authorized after the available security checks passed. Hosted two-user verification and routine-save migration approval remain pending; Stage 4 is unapproved.

## Routine planning

Sign in and open **Routines** or use the link from Profile. Review suggestions, select **Customize & save**, or select **Create a routine**. The editor supports workout days, exercise order, sets, rep ranges, rest, and notes. Archive preserves the plan and future history. [docs/STAGE_3.md](docs/STAGE_3.md) explains the rules, limitations, SQL approval step, and live persistence checks. No paid AI service or new frontend dependency is used.

## Final routine-save migration review

Before applying migration 003, read [docs/ROUTINE_SAVE_REVIEW.md](docs/ROUTINE_SAVE_REVIEW.md). The final SQL tightens input validation, retains older retry receipts, fingerprints the edit precondition, and fixes routine timestamp conflict tokens. It adds the save RPC **and replaces the existing timestamp helper** without changing tables or RLS policies. No hosted changes have been made by the agent.

`npm run test:db:concurrency` adds six real multi-connection tests using development-only embedded PostgreSQL. Its disposable data, temporary files, and Unix socket stay inside this project's ignored `.test-postgres/` directory. It never reads Supabase credentials; `npm run check` remains the portable frontend/in-memory database verification command.
