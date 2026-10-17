# Fitness App

Stage 2 connection preparation: a React + TypeScript frontend with a Supabase client configuration. The local website has a home page, an approach/source page, navigation, and a friendly missing-page route. Authentication, database persistence, routine recommendations, and workout logging are not implemented yet.

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

This runs React smoke tests and Supabase configuration/client tests, strict TypeScript checking, and the production build. `npm run test:watch` runs tests while editing. The tests cover page landmarks, navigation and focus, direct route entry, evidence links, and recovery from an unknown URL. They are DOM-based tests, not a complete browser accessibility audit.

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
- `src/App.tsx` defines the shared header/footer and three routes.
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

A blank `.env.local` was created locally and is ignored by Git. Open it in your editor and enter the project URL and publishable key from your Supabase project’s Connect panel:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

Do not use the dashboard URL or an API path such as `/rest/v1`. Save the file and restart `npm run dev`. The home page will report that configuration is loaded; this is a local configuration check, not a live connectivity or security test. The client accepts only HTTPS project URLs and `sb_publishable_` browser keys. There are no frontend administrative credentials.

To recreate the file if it is absent, copy `.env.example` to `.env.local`; do not overwrite existing values. You can verify exclusion with `git check-ignore .env.local`. Full dashboard and authorization steps are in [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

## Continue Stage 2 (already authorized; external access required)

Once the public settings are entered and the migration workflow is agreed, Stage 2 will add Supabase database migrations and a small reference seed, ownership security policies, sign-up/sign-in/recovery, and profile persistence. It will include tests for anonymous access and isolation between two users. See [SPEC.md](SPEC.md) for the approved architecture and schema.

The MVP prioritizes secure accounts, persistence, workout logging, basic recommendations/comparisons, substitutions, and public deployment. Advanced charts, countdown timers, extensive filtering, and a large exercise library are postponed. No live Supabase changes or deployment have been performed by the agent. Stage 3 remains unapproved.
