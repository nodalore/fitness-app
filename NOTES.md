# Fitness App — session handoff

Updated 2026-10-18. Stage 3 refinements are authorized and implemented locally. No hosted database changes were made by the agent. Stage 4 remains unstarted and unauthorized.

## Current state and boundaries

- Existing React + TypeScript + Vite + React Router + Supabase app; preserve authentication, saved profiles, routines, RLS, ownership constraints, atomic saves, retry receipts, exact microsecond concurrency tokens and history-preserving versions.
- User confirms all three original hosted migrations (001–003) executed successfully. Do not rerun them. Full live routine-saving, logout/login persistence and two-signed-in-user isolation remain pending; local tests do not prove these.
- The user approved the Stage 3 refinement plan, Step 1 design, and short gym-focused copy, then authorized the remaining profile/rules/catalog/mobile work and tested Git commits. Future hosted changes still require separate explicit review/approval through the user's Supabase SQL Editor workflow.
- Keep all file access and operations inside `~/fitness-app`. Never print/read local environment values into output, log secrets/private records, or commit credentials. No new credentialed service or deployment is authorized.
- Before using `playwright.browser_run_code_unsafe`, show complete code and get approval. The existing exact isolated screenshot script was approved and rerun unchanged. Do not relax its network isolation or use a real session without new approval.

## Implemented Stage 3 refinements

- Original dark/charcoal/beige design with shared UI tokens/components, local licensed fitness photography, dashboard, profile, recommendation and saved/archived routine cards, full prescription disclosures, and short copy. Sidebar on desktop; in-flow four-item navigation on mobile prevents overlay. Supporting text and mobile fields are larger. Asset provenance: `docs/ASSET_CREDITS.md`.
- Frequency questionnaire uses 2–6 days/week, without weekday checkboxes. Legacy weekdays are retained exactly. Existing profiles with NULL/missing frequency explicitly choose a preference; distinct legacy counts 2–6 appear only as suggestions. Counts 1/7 are not silently clamped. Automatic browser timezone on save and UTC fallback remain; no timezone input.
- Nullable frequency and specific equipment/support confirmations are prepared in local migration 004. Profiles use compatible `select('*')` reads plus explicit normalization, excluding server-only fields from editable payloads. Missing new columns produce a setup error and retain the form. Old profile data and routine access remain available.
- New custom/recommended workouts use null weekdays and ordered labels. Existing saved weekday values remain readable and optional in the editor; they are never rewritten automatically.
- `rules-2.0` filters actual live catalog records by equipment/support and beginner skill suitability, ranks by goal/loadability/experience, uses family-specific A/B variation and stable strength anchors, distributes weekly pattern budgets, and saves rationale/evidence/weekly primary-muscle set totals with new plans. Existing saved recommendations are unchanged.
- Requested 2/3 sessions use Full Body A/B/C, 4 uses Upper A/Lower A/Upper B/Lower B, experienced 5 uses Upper/Lower/Push/Pull/Legs, experienced 6 uses Push/Pull/Legs A/B. Beginners requesting 4–6 see an explicit three-session starting alternative. Split coverage gaps are explained instead of fabricating exercises. Experienced users prefer suitable loadable main movements; no weight is assigned from experience alone.
- Arrow disclosures on each exercise expose original technique notes, muscles, equipment/support and loading conventions, plus original movement schematics (clearly not photographs or technique demonstrations). No third-party exercise images or remote media are embedded.
- Local migration 005 adds 18 exercises, seven professional/publication sources and 18 directional alternatives, bringing the installed catalog to 30 exercises, 10 sources and 30 alternatives. Existing seed rows/IDs are untouched. Production only recommends records returned by Supabase; the expansion JSON is tooling/test data, never a substitute backend.

## Migrations and manual installation

Installed per user: `202610170001_schema.sql`, `202610170002_reference_seed.sql`, `202610170003_routine_save.sql`.

**Prepared locally, NOT approved/applied hosted:**

1. `supabase/migrations/202610180004_profile_frequency.sql`: nullable checked `training_days_per_week` and `equipment_details`; no backfill, row rewrite, policy/grant change, or RPC replacement.
2. `supabase/migrations/202610180005_catalog_expansion.sql`: additive catalog/source/alternative inserts only. Generated deterministically from `src/data/catalog-expansion.json` by `node scripts/generate-catalog-migration.mjs`. Do not edit old seed 002 or reapply installed files.

Review exact SQL and `docs/STAGE_3_REFINEMENT.md`, obtain explicit approval, then have the user run each new complete file once in order in SQL Editor, keeping `begin`/`commit`. If SQL fails, stop; request error text only and resolve locally. Never request passwords. New frontend profile saving requires 004; complete expanded recommendation coverage requires 005. The agent did not execute either against hosted Supabase.

## Evidence and limits

`docs/RECOMMENDATION_EVIDENCE.md` is the source-to-rule register: ACSM 2026 full text (accessible during implementation), Currier 2023 network meta-analysis, Kassiano 2022 variation review, Ramos-Campo 2024 split/full-body review, Baz-Valle 2019 primary trial, and NSCA 2023/2025 professional education. Menno Henselmans and Legion Athletics remain supplementary commentary. Exact splits, rankings, sets/reps/rest and starting budgets are disclosed app heuristics, not universal optimums or individual outcome guarantees.

Band exercises identify band/setup rather than invented kilogram tension. Their existing database loading type is `external`; future Stage 4 logging must honor this distinction. No logging was implemented. Schematics are educational pattern drawings, not exercise-specific technique photos.

## Verification

- `npm run check`: frontend/unit/UI and isolated PostgreSQL suites, TypeScript and production build. **290 tests / 16 files passed**, including the new upgrade matrix; prior milestones passed 225, 243 and 285 as scope expanded.
- `npm run test:db:concurrency`: six native PostgreSQL 18.4 multi-connection scenarios passed after process/socket permission; disposable data/sockets stayed in ignored `.test-postgres/`, with no Supabase configuration or hosted access.
- Populated 001–003 upgrade tests preserve old profile values, weekdays, routine IDs and receipt metadata through 004/005; check new field bounds/RLS, read-only catalogs, complete sources/alternatives and 135 recommendation documents saved through installed RPC semantics across all goal/experience/frequency combinations.
- Rule tests cover suitability, advanced loadable squats, A/B variation and shared anchors, frequency/volume budgets, all 31 nonempty broad equipment combinations with confirmed/unconfirmed support, deprecated entries, deterministic catalog order, and timeline/weekday invariance.
- Existing auth/profile/routine UI, failed-save/retry, account-switch clearing, archive/history and ownership tests remain passing. Exercise arrows reveal description/loading/schematic; no real network is used in unit tests.
- Exact approved isolated Playwright script generated dashboard/profile/routines screenshots at 1440px and 390px with no horizontal overflow. Reviewed screenshots confirmed navigation no longer overlays page controls and supporting text is larger. All remote requests and WebSockets blocked; fresh browser context and synthetic data; no live Supabase or real session.
- Screenshots are ignored root files `preview-{dashboard,profile,routines}-{1440,390}.png`; older captures are replaced on reruns. Browser logs are ignored. Do not commit personal browser artifacts.

Remaining unverified: hosted new-column/catalog installation, real profile/routine save/edit/archive/reload and logout/login persistence, hosted two-user read/write/RPC isolation, live recovery/email delivery, and complete manual keyboard/screen-reader acceptance. Screenshot tests use mocked auth/repositories and collapsed workout cards; expanded exercise behavior is covered by UI tests, not a real signed-in browser test. Build has a non-blocking main-chunk size advisory.

## Next steps

1. Present final local results and concrete migration review links; ask for approval before hosted SQL.
2. After approved installation, run `npm run dev`; visit Profile, confirm frequency and actual equipment/support, save, then inspect the dashboard and routines. Review/create/edit/save/archive, refresh, sign out/in and confirm persistence.
3. Use two verified user-controlled accounts for isolation. Review existing rollback-only `supabase/tests/live_rls.sql` and `live_routine_save.sql`; replace identity placeholders only in SQL Editor, never tracked files. No passwords in chat.
4. Optional read-only hosted checks after authorization: `npm run check:security:live` for original catalog or `npm run check:security:live -- --expanded-catalog` after 005. These make real hosted GET requests; they were not run during refinement.
5. Record actual hosted acceptance outcomes. Obtain separate Stage 4 approval before drafts, per-set logging, workout completion, substitutions during sessions or comparisons.
