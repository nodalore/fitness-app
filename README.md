# Fitness App

Stage 1: a React + TypeScript frontend foundation. The local website has a home page, an approach/source page, navigation, and a friendly missing-page route. Authentication, database persistence, routine recommendations, and workout logging are not implemented yet.

## Run locally

Use Node.js 22.12+ (Node 24 recommended) and npm. From a terminal:

```sh
cd ~/fitness-app
npm ci
npm run dev
```

Open http://127.0.0.1:5173. If dependencies are already installed, skip `npm ci`. Stop the server with Ctrl+C. Port 5173 is fixed; if occupied, stop the other server first or pass `--port 5174`.

No Supabase account or environment values are needed for Stage 1. `.env.example` documents the two public values needed later. Never store service-role keys or database passwords in variables starting with `VITE_`: those values are exposed to browsers. Local `.env` files are ignored by Git.

## Automated checks

```sh
npm run check
```

This runs four React smoke tests, strict TypeScript checking, and the production build. `npm run test:watch` runs tests while editing. The tests cover page landmarks, navigation and focus, direct route entry, evidence links, and recovery from an unknown URL. They are DOM-based tests, not a complete browser accessibility audit.

To serve the production build locally:

```sh
npm run build
npm run preview
```

Open http://127.0.0.1:4173. When publishing in a later stage, configure the host to serve `index.html` for app routes such as `/about`.

## Manual smoke test

1. Open the home page; confirm the Stage 1 preview notice is visible.
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
- `tsconfig.json` enables strict TypeScript checks.
- `package-lock.json` pins the installed dependency tree for reproducible `npm ci` installs.
- `.npmrc` keeps npm's cache within this project; `.gitignore` excludes dependencies, build output, cache, and local secrets.

## Next stage (requires approval)

Stage 2 will add Supabase database migrations and a small reference seed, ownership security policies, sign-up/sign-in/recovery, and profile persistence. It will include tests for anonymous access and isolation between two users. See [SPEC.md](SPEC.md) for the approved architecture and schema.

The MVP prioritizes secure accounts, persistence, workout logging, basic recommendations/comparisons, substitutions, and public deployment. Advanced charts, countdown timers, extensive filtering, and a large exercise library are postponed. Nothing has been deployed or provisioned in Stage 1.
