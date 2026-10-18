# Stage 3 — routine planning and refinement

Updated October 18, 2026. Stage 3 is implemented and tested locally, including the approved dark interface, frequency questionnaire, `rules-2.0`, exercise detail arrows, catalog expansion and mobile fixes. Stage 4 has not started.

The user confirms all three original Supabase migrations, including `202610170003_routine_save.sql`, executed successfully. The prior save-function installation blocker is resolved; **do not rerun migrations 001–003**. Full hosted saves, persistence and signed-in user isolation remain pending. No hosted SQL was executed by the agent during refinement.

New migrations **004 (profile frequency/equipment)** and **005 (catalog/sources)** are local reviewed proposals, not approved/applied on hosted Supabase. See the complete [refinement and SQL review guide](STAGE_3_REFINEMENT.md) before approving their installation. The new profile fields require 004; full expanded catalog coverage requires 005.

## Available behavior

- Dashboard shows actual saved preferences and active routine counts, with empty/error/retry states.
- Profile uses 2–6 training days/week with no weekday questionnaire. Legacy availability and other data are preserved; old profiles explicitly confirm a new preference. Timezone stays automatic.
- Equipment confirmations distinguish broad categories from actual benches, racks, supports and machines.
- Recommendations use ordered Full Body, Upper/Lower and PPL A/B workouts with flexible days, suitable loadable exercises, stable main lifts and purposeful variation. Beginner high-frequency requests get a clearly labeled conservative alternative.
- Workout cards expand to full sets/reps/rest. Each exercise arrow reveals notes, requirements, loading conventions and an original movement schematic.
- Recommendations can be customized and saved, or routines built from scratch. Saved routines support edit, reordering, archive confirmation and archived viewing. New plans have null weekdays; old schedules persist unless deliberately edited.
- Atomic saves still use the installed caller-privilege RPC, optimistic concurrency and retry receipts. Editing plans with session references creates a new version and archives the original; original history stays intact.
- Account switches clear prior account UI state. Network failures retain the form and do not claim success. Unsaved editor drafts remain page-local; workout draft persistence is Stage 4.

## Rules and evidence

The exact programming defaults, citations, access levels and scientific limitations are in [RECOMMENDATION_EVIDENCE.md](RECOMMENDATION_EVIDENCE.md). ACSM/NSCA and peer-reviewed publications are the primary basis; Menno Henselmans and Legion are supplementary interpretation. Exact splits/rankings/budgets are app heuristics. Timeline affects review timing only; the app assigns no weight, requires no maximal test/failure, and guarantees no results.

Production uses actual Supabase catalog rows; prepared reference JSON is not a replacement backend. The reviewed expansion adds 18 exercises, seven sources and 18 alternatives without overwriting seed data. Loaded and bodyweight exercises retain separate loading conventions/history. Band setup is not equivalent to kilogram tension.

## Verification and next step

Run `npm run check` and, with local process/socket permission, `npm run test:db:concurrency`. Current counts/results and Git milestones are recorded in NOTES.md and the final handoff. Tests cover profile compatibility/upgrades, rules, cards/editor, errors/retries, account switching, atomic routine saves, history and RLS. Native tests cover six concurrent-save/edit/archive scenarios.

Isolated Playwright snapshots at 1440px and 390px use approved mocks and block all external requests. They verify layout, not live sign-in/persistence/isolation. Local PostgreSQL emulates Supabase identities; it cannot certify hosted JWT/policy deployment.

Next: review and explicitly approve 004/005, then complete manual hosted acceptance from [STAGE_3_REFINEMENT.md](STAGE_3_REFINEMENT.md). Keep `live_rls.sql` and `live_routine_save.sql` rollback-only and substitute test identities only in SQL Editor. Do not start workout logging, session completion or in-session substitutions without Stage 4 approval.
