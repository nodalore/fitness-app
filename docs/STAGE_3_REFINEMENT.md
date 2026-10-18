# Stage 3 refinement — local review and acceptance

Status: local implementation complete; hosted acceptance pending. The user confirms original migrations 001–003 are installed. Do not rerun them. No hosted database changes were made by the agent. Stage 4 remains unstarted.

## Review migration 004

[`202610180004_profile_frequency.sql`](../supabase/migrations/202610180004_profile_frequency.sql) adds two nullable profile columns:

- `training_days_per_week`: integer checked from 2–6. NULL means not confirmed.
- `equipment_details`: checked array of 13 named supports/machines, without null elements and bounded in length. Broad equipment categories remain unchanged.

It performs no backfill, delete, row rewrite, policy/grant change or save-RPC replacement. All existing fields/defaults/values, ownership constraints, schedules and histories remain intact. Existing clients can continue writing old fields; a new explicit frequency is independent of old weekday availability. Migration is a forward upgrade and should run once, not be substituted for an installed file.

The frontend reads profiles with `select('*')` and normalizes editable fields, retaining old weekday arrays while never inventing an explicit frequency for an old profile. A distinct 2–6 legacy availability count is a suggestion only; the user confirms. Legacy counts 1/7 require choosing a supported preference. Automatic timezone detection on save, with UTC fallback, remains.

Profile writes include the new fields only when the user submits the form. If 004 is absent, missing-column errors preserve the form and explain setup; they never report success. Existing routine reads remain usable. New custom/recommended plans use existing nullable `routine_days.weekday`; saved weekday values remain unchanged unless deliberately edited.

## Review migration 005

[`202610180005_catalog_expansion.sql`](../supabase/migrations/202610180005_catalog_expansion.sql) adds 18 exercises, seven evidence sources and 18 directional alternatives to installed reference data. Totals become **30 exercises, 10 sources, 30 alternatives**. Existing reference rows and IDs are unchanged; no personal rows or policies are modified. Plain inserts fail and roll back on a conflicting installed ID rather than silently overwriting catalog data.

The additions cover rack-based/loadable and unilateral squats, floor/barbell pressing, vertical pulls, knee flexion, calves, shoulder/arm accessories and limited-equipment band choices. Every addition has muscle mapping, explicit equipment/support requirements, rest defaults, original notes, load convention, source IDs and an explained alternative. Some alternatives share only a training goal and are not identical stimuli; differences are documented. They are reference data only, not in-session substitution functionality.

`src/data/catalog-expansion.json` is the canonical migration input; `node scripts/generate-catalog-migration.mjs` generates the reviewed SQL locally without network access. Production suggestions use the catalog actually returned from Supabase and never inject JSON-only records. Existing catalog 002 must not be replaced/reseeded. Band tension is not treated as kilograms; notes require band identity/setup for any future logging.

## Recommendation behavior and interface

`rules-2.0` replaces global modulo exercise indexing with workout-family occurrence counts, equipment/skill filters and goal/loadability rankings. Experienced users prefer suitable loadable movements. Main strength anchors remain stable; A/B accessories/emphasis can vary. Weekly pattern budgets are distributed across requested sessions and primary-muscle set totals are saved with evidence, assumptions and rule version. Profile changes never regenerate saved routines.

Lower-volume and standard options are returned where distinct. A third option uses alternate main exercises at standard workload when there is a genuine selection difference; duplicate alternatives are suppressed. Requested sessions map to Full Body (2/3), Upper/Lower A/B (4), Upper/Lower + PPL (5) and PPL A/B (6). Beginners requesting 4–6 see an explicit three-session starting alternative. These are app heuristics with recovery guidance, not a claim that a particular split is best. Equipment gaps are visible.

Exercise arrows open technique, requirements, muscles, loading and original pattern schematics. Schematics are clearly labeled, not exercise photographs or technique demonstrations. Sources and evidence limitations: [register](RECOMMENDATION_EVIDENCE.md). Local fitness photography/font provenance: [credits](ASSET_CREDITS.md).

Mobile navigation is in flow, so it cannot cover forms/buttons. Supporting text, labels and mobile inputs are larger. Optional equipment confirmations are grouped in a disclosure. Desktop cards/columns stack on mobile. Dashboard counts represent saved plans/preferences, never invented workout history. Existing authentication and callback/recovery routes remain intact.

## Local verification and limitations

`npm run check` runs all frontend/UI tests and isolated PostgreSQL tests, followed by TypeScript and production build. Populated-schema upgrade tests verify preserved profile values and routine/schedule/receipt data, new constraints, anonymous/two-user RLS and read-only reference catalogs. All 135 generated recommendation documents across goals/experience/frequency combinations save through the actual installed RPC in local PostgreSQL. Rule tests cover all nonempty broad equipment combinations and multiple support configurations.

`npm run test:db:concurrency` passed six separate-connection PostgreSQL scenarios for retries, stale edits, archival and history preservation. This suite uses local disposable processes/sockets only. No migration function was changed.

The exact previously approved isolated Playwright script was rerun unchanged, using a fresh browser context with mocked auth/config/repository, only localhost GETs and all external requests/WebSockets blocked. Six screenshots at 1440/390 pixels show no horizontal overflow; reviewed navigation no longer overlays controls. They do not prove hosted login, real persistence or expanded-card interactions. Those interactions have UI coverage. Screenshot files live at project root, named `preview-{page}-{width}.png`, and are ignored by Git.

## Manual hosted steps — approval required

1. Review the complete current 004 and 005 files and this document. **Obtain explicit approval before any hosted execution.** Review of the local implementation alone is not hosted SQL approval.
2. In Supabase SQL Editor, run the complete 004 file once, then the complete 005 file once, preserving each `begin`/`commit`. Do not rerun 001–003. If SQL fails, stop; share only error text. Roll back any open failed transaction before retrying a corrected file.
3. Restart/refresh the frontend (`npm run dev`, `http://127.0.0.1:5173`). Save frequency and real equipment confirmations. Verify old profile values and saved routine weekdays remain intact. No need to select equipment you do not own just to obtain plans.
4. Review exercises with their arrows. Customize/save a new recommendation, refresh, sign out/in, and verify exact saved values. Create/edit/reorder/archive a custom plan; inspect archived content. Exercise descriptions/diagrams do not replace qualified technique instruction.
5. With separate verified test accounts, verify no cross-user reads or writes, including RPCs. Review/run rollback-only `supabase/tests/live_rls.sql` and `live_routine_save.sql` with placeholders replaced only in SQL Editor. Never put passwords or user identities into tracked files or chat.
6. Optional authorized anonymous checks after 005: `npm run check:security:live -- --expanded-catalog`. Before 005, the original command expects 12/12/3. These scripts access hosted Supabase read-only and were not run during refinement.

Still pending: hosted SQL installation 004/005, real saves/reloads/sign-out/in, two-user isolation, recovery/email delivery and full manual assistive-technology acceptance. No production data was touched. Stage 4 requires separate approval.
