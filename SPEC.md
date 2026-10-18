# Fitness App — MVP specification

Status updated 2026-10-18: existing React + TypeScript + Vite + Supabase application; Stages 1–3 implemented. The user confirms successful execution of all three hosted Supabase migrations, including `202610170003_routine_save.sql`. Full live routine-saving/persistence and signed-in user-isolation verification remain pending. Comprehensive Stage 3 refinements are specified below; implementation awaits approval of the plan in §18. Stage 4 and later are not authorized.
Prepared: 2026-10-17; refinement requirements and evidence review: 2026-10-18.

Current-state precedence: this status and §18 supersede older migration-installation instructions in `docs/STAGE_3.md` and historical review documents. Do not rerun migrations 001–003. Historical checkpoints below describe previous work, not permission for new implementation or hosted changes.

## 1. Historical initial project inspection

At the initial planning checkpoint, the project folder contained only an initialized `.git` directory. There were no application files, dependencies, existing commits, or project/ancestor AGENTS.md instructions. This was the first project document. The application and hosted Supabase integration now exist; preserve them. Public deployment remains pending.

## 2. Scope and user journey

Build a responsive public website for generally healthy adults who want resistance-training routines and a private workout history.

1. Visit a public introduction and evidence/methodology page.
2. Register, verify email, and sign in.
3. Supply goal (general fitness, strength, muscle growth), experience (beginner, intermediate, advanced), desired workout sessions per week (2–6), and desired review timeline (weeks). Also choose available equipment and kg/lb units so recommendations are usable.
4. See up to 2–3 genuinely distinct compatible routine options (fewer with an explanation when necessary), their ordered workouts without fixed weekdays, sets/rep ranges, rest guidance, explanation, and assumptions.
5. Copy a recommendation into a personal routine or build one from the exercise library; edit workouts, exercises, order, sets, reps, and rest. Users choose when to train; give recovery guidance without assigning weekdays.
6. Start a session, record individual sets, resume a saved draft, and complete the workout.
7. Review history and compare the same exercise with previous completed sessions.
8. Inspect suggested exercise replacements, read similarities and differences, and replace an exercise in the routine or current draft.

MVP excludes paid AI, nutrition/calorie prescriptions, rehabilitation, medical personalization, coaching/social features, wearables, subscriptions, offline synchronization, and guaranteed body-composition outcomes. Advanced users can customize routines but are not promised specialist athletic programming. Cardio guidance is educational; cardio logging is outside this MVP.

## 3. Proposed architecture and stack

- **Frontend:** React + TypeScript + Vite, React Router, plain CSS, Supabase JavaScript client. Stage 2 uses native form constraints, a tested profile validator, and PostgreSQL constraints; a validation library can be added when later payload complexity justifies it. A static app is sufficient for the authenticated dashboard and avoids an unnecessary custom server.
- **Backend:** Supabase Auth, its HTTP Data API, and PostgreSQL functions (RPCs) for atomic multi-table operations. This is a real managed backend; browser requests carry the user's access token and database policies enforce ownership.
- **Database:** Supabase PostgreSQL, versioned SQL migrations, reference-data seeds, constraints, indexes, and row-level security (RLS).
- **Recommendations:** deterministic, versioned TypeScript rules and curated templates. No AI API or model key required.
- **Hosting:** Sites static hosting with explicit public audience. Supabase remains the database; hosting-native storage will not replace it. Configure SPA route fallback, HTTPS, and Supabase auth redirect allowlists for the deployed origin.
- **Verification:** Vitest for rules and calculations; SQL/security integration tests against an isolated test database; Playwright for critical browser flows; TypeScript checking and production build. GitHub Actions can run these if a GitHub remote is supplied.

Data flow: browser → Supabase Auth → authenticated Data API/RPC → PostgreSQL with RLS → returned records → dashboard/charts. The static host serves application assets; it does not hold private workout records. Derive trends from session rows initially instead of maintaining a separate analytics store.

Suggested folders after approval: `src/features/`, `src/lib/`, `src/data/`, `supabase/migrations/`, `supabase/tests/`, `tests/e2e/`, and `docs/`.

## 4. Database design

All ordinary entity IDs use UUIDs; timestamps use `timestamptz`. Owned tables have a non-null `user_id` referencing `auth.users`. Public reference records are deployment-managed, not visitor-writable.

| Table | Main fields and relationships |
| --- | --- |
| `profiles` | `user_id` PK/FK → auth.users; goal, experience, available_weekdays (retained legacy data), proposed nullable training_days_per_week (2–6), timeline_weeks, equipment, display_unit, timezone, onboarding_completed_at |
| `evidence_sources` | id, organization, title, publication_year, url, accessed_on, supported_guidance, limitations |
| `exercises` | id, slug unique, name, movement_pattern, primary_muscles, secondary_muscles, equipment, loading_mode, technique_notes, default_rest_min_seconds, default_rest_max_seconds, evidence_source_ids |
| `exercise_alternatives` | exercise_id FK, alternative_exercise_id FK, similarities, differences, suitability_notes, source_ids; composite PK; no self-reference |
| `routines` | id, user_id, name, goal, origin_template_key nullable, recommendation_version nullable, assumptions JSONB, archived_at, created_at, updated_at |
| `routine_days` | id, user_id, routine_id FK, name, weekday nullable, position |
| `routine_exercises` | id, user_id, routine_day_id FK, exercise_id FK, position, target_sets, rep_min, rep_max, rest_seconds, notes |
| `workout_sessions` | id, user_id, routine_id nullable FK, routine_day_id nullable FK, routine_name_snapshot, day_name_snapshot, started_at, completed_at nullable, status (draft/completed), notes, client_request_id unique per user |
| `session_exercises` | id, user_id, session_id FK, exercise_id FK, exercise_name_snapshot, loading_mode_snapshot, position, target_snapshot JSONB, notes |
| `workout_sets` | id, user_id, session_exercise_id FK, set_number, reps, load_kg nullable, entered_unit, set_type (warmup/working), completed, notes |

Relationships: auth user → one profile and many routines/sessions; routine → days → prescribed exercises; session → performed exercises → actual sets. Exercises are shared reference data. Templates live in versioned source data and are copied into owned routine records on selection.

Use composite unique keys `(user_id, id)` and composite foreign keys containing `user_id` on owned parent/child relationships to prevent cross-account links, even if IDs are guessed. A session's selected day must belong to its selected routine. Session snapshots preserve history when routines change. Archive routines referenced by history; exercise catalog rows are deprecated rather than deleted. Explicit session deletion cascades to its sets. Account deletion cascades owned data.

Constraints: unique positions per parent; unique set_number per performed exercise; reps > 0; loads nonnegative; bodyweight load may be null; target_sets > 0; rep_max ≥ rep_min > 0; positive rest; valid weekday values; timeline within a documented UI range (1–52 weeks, a product limit); completed sessions have completed_at. Index ownership, child foreign keys, and `(user_id, completed_at)` for history. Store loads as decimal kg; convert lb at boundaries and label dumbbell load as per implement consistently. No comparison across different load conventions.

RPCs: copy template/create routine, replace routine structure, start session from routine, complete session. Use transactions, validated payloads, and idempotency keys where retries could duplicate records. Functions run with caller privileges (SECURITY INVOKER); any necessary privileged function requires narrowly scoped grants, fixed search_path, and explicit ownership checks. Deleting a routine must not erase workouts.

## 5. Authentication and database security

- Supabase email/password authentication with email verification, sign-out, and password reset; allow only configured local and production redirect URLs. Configure production email delivery and verify it end to end.
- Enable RLS on every exposed table. Owned SELECT/DELETE use `auth.uid() = user_id`; INSERT/UPDATE use equivalent WITH CHECK, with both old/new ownership enforced. Child-parent integrity is enforced independently by composite foreign keys.
- Anonymous users may read only the exercise/source/alternative catalog if needed for public education. Authenticated users also get read-only catalog access. No client role can write reference data.
- Public pages contain no private user data. Authenticated route guards improve UX; RLS provides security even when someone bypasses the UI.
- Browser configuration contains only Supabase URL and publishable key. No service-role key, database password, or migration credential enters the browser, repository, logs, or deployment bundle. Ignore local environment files and provide a placeholder-only `.env.example` after approval.
- Validate in UI and database; render notes as text; use parameterized API/RPC requests. Avoid logging tokens or workout payloads. Use HTTPS and hosting security headers compatible with Supabase requests.
- Security acceptance includes direct API attempts by anonymous, user A, and user B for every owned table and RPC, including forged user IDs, updates to ownership, and foreign-parent IDs. Unauthorized reads expose zero private records; writes fail or affect zero rows.
- Document account/data deletion and deployment backup/recovery options supported by the chosen Supabase plan. No analytics collection by default.

## 6. Recommendation rules and exercise guidance

Rules are product heuristics informed by evidence, not a validated clinical algorithm. Each returned recommendation includes rule version, selected inputs, rationale, and links to relevant guidance. The following is the refinement target pending implementation approval; the current `rules-1.0` behavior is diagnosed in §18.

- Filter by confirmed equipment, movement requirements, and experience suitability before ranking by goal and weekly session count (2–6). Use ordered Full Body A/B/C, Upper Body A/B, Lower Body A/B, or Push/Pull/Legs A/B workouts without fixed weekdays. Provide recovery guidance; do not infer readiness from a free day.
- Provide up to 2–3 meaningfully distinct feasible options with explicit tradeoffs; deduplicate equivalent prescriptions. Prefer the requested session count when suitable; explain and label any lower-frequency alternative, especially for beginners requesting 5–6 sessions. Never silently cap plans at four sessions or manufacture variety when equipment is limited. Legacy 1- or 7-day profiles require confirmation of a new 2–6 preference; existing routines remain usable.
- Use explicit exercise suitability rankings and stable tie-breaking, rather than alphabetic/modulo cycling. Experienced users with appropriate loadable options should not receive basic bodyweight squats as default main working exercises. Bodyweight movements can remain deliberate warmups, accessories, or equipment-limited choices. Machines and free weights can both be appropriate; advanced experience does not require complex barbell lifts. A short timeline changes the review date only; it must not trigger extreme volume or accelerated-result claims.
- Cover major muscle groups with squat/knee-dominant, hinge, push, pull, and trunk movements across the week. Template coverage and weekly set counts will be auditable.
- Initial product defaults: beginners generally 1–2 working sets at 8–12 reps; experienced strength options generally 2–3 sets at 4–8 reps for main lifts; muscle-growth options generally 2–3 sets at 8–12 reps. These are adjustable starting presets, not claims that these ranges are uniquely effective. Do not require 1RM testing or training to failure.
- ACSM's heavier-loading guidance informs experienced strength options; higher weekly volume informs muscle-growth options. Beginner routines start below higher-volume targets and offer gradual adjustments. Do not present an approximate weekly-set target as mandatory for every person.
- Rest presets: approximately 2–3 minutes for demanding compound sets and 1–2 minutes for simpler accessories, with longer rest allowed when needed. These are editable app defaults, not a universal optimum or a specific finding attributed to the 2026 stand. Provide a reminder to recover enough for controlled technique. Countdown timers are postponed.
- Progression suggestion: when all prescribed working sets reach the top of the rep range with controlled technique on two completed exposures, offer a small user-chosen load increase. This is a conservative app heuristic; never automatically increase logged weights or promise adaptation. Allow users to keep or lower load.
- Substitutions use curated shared movement patterns and muscle involvement, filtered by available equipment. Explain differences in stability, range of motion, unilateral/bilateral loading, equipment, and skill as applicable. Example: dumbbell bench press and machine chest press share horizontal pushing and chest/triceps involvement, but differ in stabilization and movement path. Do not transfer weights or merge their progress records. Catalog exercises must have at least one documented alternative; unavailable-equipment alternatives remain viewable with their requirement clearly labeled.
- Present guidance as general information for healthy adults; do not generate injury-specific substitutions. Encourage users with pain or relevant medical limitations to seek qualified individual guidance.

## 7. Progress calculations

- Compare the same exercise ID and loading convention across completed sessions, excluding warmups and incomplete sets. Display previous/current working sets, reps, and load, with absolute changes.
- Volume-load = sum of completed working-set reps × external load in kg. Label this as workload, not a direct measure of muscle growth or proof of increased strength. Show sets/reps without invented tonnage for bodyweight exercises.
- Show load at matched reps and reps at matched load when comparable; otherwise show both records and explain the changed conditions. Additional sets may increase workload without demonstrating improved performance.
- Detect timezone automatically using `Intl.DateTimeFormat().resolvedOptions().timeZone` when saving profiles; fall back to UTC if unavailable. Do not ask users to enter a timezone. Keep `profiles.timezone` and use the saved zone explicitly for workout date display and weekly boundaries when those features are implemented. No schema change is required.
- Trends: per-exercise load and rep history, per-session comparable volume-load, and completed sessions per week in the user's timezone. First session shows an empty comparison state; zero baseline has no percentage change; decreases are displayed honestly.
- A replacement exercise starts its own trend. No estimated 1RM, calorie estimates, or predicted physique outcomes in MVP.

## 8. Screens and accessibility

Stage 3 redesign target: public home and methodology; all auth/recovery screens; authenticated planning dashboard; profile questionnaire; recommended routines; saved/archived routines; routine editor; planned-workout details. Compact interactive cards replace long prescription tables. Workout details in Stage 3 show a plan, exercises, sets/reps/rest, and assumptions; logging, performed-session details, history, progress, and in-session substitutions remain later stages.

Mobile-first logger, visible save/error states, retries without duplicate sessions, confirmation before destructive deletion, keyboard-accessible controls, labeled inputs, readable contrast, focus management, and charts accompanied by accessible tables. Network failure must never be shown as a successful save. Refresh resumes persisted drafts; offline editing is not guaranteed.

## 9. Small, testable development stages

| Stage / proposed commit | Deliverable | Verification gate |
| --- | --- | --- |
| 0 — `docs: define fitness MVP plan` | This approved specification | Review scope, schema, and acceptance criteria; no implementation before approval |
| 1 — `chore: scaffold frontend and verification` | App shell, routing, environment placeholders, test/build scripts | Typecheck, production build, accessible shell smoke test |
| 2 — `feat: add Supabase schema and authentication` | Migrations, seeds, RLS, login/recovery/profile | Clean database migration; two-user/anonymous security matrix; verified auth flows |
| 3 — `feat: recommend and customize routines` | Onboarding, versioned templates/rules, routine CRUD | Goal/day/equipment rule tests, copy/edit persistence, no cross-account writes |
| 4 — `feat: log workouts and substitutions` | Drafts, individual sets, atomic completion, rest UI, alternatives | Reload persistence; failed-save/retry test; routine edits preserve history; substitute load reset |
| 5 — `feat: show workout comparisons and trends` | History, basic comparison tables, source page; advanced charts postponed | Known-fixture calculation tests, mixed-unit conversion, bodyweight, missing history, zero baseline |
| 6 — `chore: verify and publish MVP` | Public deployment, production config, setup/runbook | Full critical-flow E2E, production email callbacks, RLS checks, public HTTPS smoke test |

After approval, create the planning commit first, then focused implementation commits after each passing gate. Do not commit credentials. Use a CI workflow if a suitable remote is available; local automated commands remain required. Stage completion requires working behavior, not placeholder screens.

## 10. Final acceptance criteria

- A public HTTPS URL loads in a signed-out browser; private data requires sign-in.
- Verified user completes onboarding, receives explained feasible options, and selects or creates a routine.
- Routine edits and workout logs survive refresh, logout/login, and another authenticated browser session through Supabase PostgreSQL.
- Log multiple exercises and sets with reps and kg/lb inputs; edit/delete own records; save and resume a draft; complete without duplicate records on retry.
- Compare at least two completed workouts accurately using the documented metrics; displayed comparison values agree with saved records; substitutions keep separate histories.
- Every catalog exercise has an explained replacement and editable rest guidance.
- Sources, app assumptions, and timeline limitations are visible in the application.
- Automated build, typecheck, rule/calculation tests, RLS integration tests, and critical browser flows pass. Any infrastructure-limited verification is explicitly reported, not claimed as passed.
- Deliver migrations/seeds, environment setup instructions, test commands, deployment instructions, Git history, and actual deployed URL.

## 11. Sources and evidence boundaries

Original sources checked 2026-10-17; additional publication-level review and limitations are recorded in §18 (2026-10-18). Source mapping will be carried into the in-app methodology and reference seed records. Recheck the full paper before finalizing any numerical claim beyond its official summary; do not infer unsupported prescription details from an abstract.

1. **ACSM 2026 position stand:** Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. [Publication record](https://pubmed.ncbi.nlm.nih.gov/41843416/), [official position-stand index](https://acsm.org/education-resources/pronouncements-scientific-communications/position-stands/), [official summary](https://acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf). Supports regular progressive resistance training, goal-specific loading/volume, and simple adaptable programs; the official summary emphasizes major muscle groups at least twice weekly. It describes heavier loading for strength and approximately ten weekly sets per muscle group for hypertrophy. These do not establish guaranteed individual outcomes or mandatory novice starting volumes.
2. **CDC, Adult Activity: An Overview:** [Guidelines](https://www.cdc.gov/physical-activity-basics/guidelines/adults.html). Adults should combine at least 150 minutes moderate or 75 minutes vigorous aerobic activity (or equivalent) with strengthening all major muscle groups on at least two days weekly. Resistance logging alone does not demonstrate meeting the aerobic guideline.
3. **NSCA, Bonder, Shim, and Tangeman, November 2022:** [Time-Efficient Training Approach as a Solution to Sedentary Occupational Health Risks](https://www.nsca.com/education/articles/ptq/time-efficient-training/). Supports considering movement selection, experience, available time, and rest in program design. This educational article discusses different rest needs; its time-efficient examples are not universal prescriptions. App defaults do not adopt its advanced failure-based methods for novices.
4. **Supabase:** [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) and [password-based authentication](https://supabase.com/docs/guides/auth/passwords). Technical basis for authenticated access and database-enforced isolation.

## 12. Approval and external setup dependencies

The architecture and existing Stages 1–3 implementation were previously authorized. All three hosted migrations are now successfully executed according to the user. The current request authorizes only research and updates to SPEC.md and NOTES.md. Wait for approval of the refinement plan in §18 before changing application code, dependencies, migrations, or seeds. Future hosted SQL requires separate explicit review/approval. Stage 4 and later require explicit approval.

A real deployment requires access to a user-owned Supabase project (project URL, publishable key, and an approved secure path for migrations), production email configuration, and Sites hosting permissions. No connected Supabase provisioning tool is currently exposed. Verify the available CLI/dashboard authentication after approval; if unavailable, prepare migrations and exact setup steps and request the minimum required connection. Never ask for secret keys in chat. Service costs and plan limits must be checked before any paid provisioning; no paid resource purchase is included in plan approval. Public hosting exposes the app's entry pages, while individual workout records remain private.

## 13. Approved implementation priorities

Preserve the working frontend, authentication, Supabase persistence, profile data, and routine management. The immediate priority is comprehensive Stage 3 refinement under §18, pending implementation-plan approval; full hosted acceptance remains open. Workout logging/substitutions, comparisons and public deployment remain later-stage MVP goals, not authorization for current work. All project file operations stay inside `~/fitness-app`, including npm cache and build artifacts. Keep the catalog curated and expand only for demonstrated recommendation gaps. Postpone advanced charts, countdown timers, and extensive filtering. No hosted changes are authorized by this documentation update.

## 14. Persistent frontend design requirements

The 2026-10-18 redesign request replaces the earlier paper/ink/vermilion training-journal direction across the existing interface. Implementation awaits plan approval; preserve the current React application and Supabase behavior.

- Create an original premium fitness identity inspired by [Elevate: Your Ultimate Fitness Companion, Majarul Islam](https://dribbble.com/shots/25204004-Elevate-Your-Ultimate-Fitness-Companion). Do not copy its layout, branding, text, illustrations, or photography. The reference's indexed description was accessible during planning; direct visual-page access was limited. Complete visual review before implementing layouts.
- Use dark backgrounds, charcoal cards, warm beige accents, elegant readable typography, rounded components, and restrained depth. Define shared color, type, spacing, radius, elevation, motion, and focus tokens. Proposed starting palette: background `#111111`, surface `#202020`, raised surface `#2B2B2B`, accent `#DCC9AD`, text `#F5F0E8`; verify actual text and control combinations for contrast before use.
- Pair expressive display typography with a readable UI face and practical fallbacks; select appropriately licensed, preferably self-hosted fonts. Avoid generic system-font-led styling and the previous decorative ruled-paper treatment.
- Use rights-cleared fitness photography with responsive sizes, deliberate crops, readable overlays, useful alt text, and empty alt text for decorative images. Before shipping each asset, record photographer, source URL, license/version, download date, attribution and usage restrictions. Use owned or clearly licensed images; reference-page images are not licensed assets. No asset purchase is authorized by this plan.
- Build compact routine/workout cards with a clear label, focus, exercise count, and prescription preview. Expand or open workout details for the full plan and editing actions; avoid long tables as the main interaction. Do not hide sets/reps/rest or evidence explanations for visual brevity.
- Use intuitive desktop navigation and a compact mobile navigation for Dashboard, Discover routines, My routines, and Profile. Preserve existing auth links, callbacks, recovery routes, and direct routine/profile entry paths. Dashboard content is planning information from real data, with honest empty states; no invented workout statistics or Stage 4 controls.
- Redesign public, auth, profile, recommendation, saved/archived, editor, error/loading, and workout-detail experiences consistently. Components must support keyboard access, visible focus, labeled inputs, screen readers, reduced motion, mobile touch targets, zoom, and narrow screens. Target WCAG AA contrast; do not communicate status by color alone.
- Make tokens and components reusable for Stage 4 without implementing workout logging, countdown timers, progress charts, or in-session substitutions now.

## 15. Stage 2 implementation and review checkpoint

The user created an empty Supabase project, configured the public URL/key locally, and selected the SQL Editor migration workflow. Read-only Auth connectivity passed with HTTP 200; email sign-in and email confirmation are enabled. No credentials were printed and no live users or database records were changed by the agent.

Stage 2 is implemented locally: registration, sign-in/local-browser sign-out, confirmation/recovery routes, protected profile editing, the ten-table schema with RLS, a twelve-exercise seed, and automated frontend/PostgreSQL security tests. Profile rows are created on first save, avoiding a privileged registration trigger. The timestamp trigger uses caller privileges. Workout/recommendation RPCs are intentionally deferred to their feature stages.

The exact migration files are tested in isolated PGlite PostgreSQL with minimal Supabase identity emulation. This adds a development-only test dependency; it is not an application database or a replacement for hosted Supabase. The user now confirms all three migrations have been executed successfully. Retain `docs/STAGE_2_REVIEW.md` as historical review evidence; do not reapply installed SQL. Continue verifying real authentication, profile persistence, and live permissions. A separate SQL verification script uses client roles and rolls back its temporary data. Stage 2 remains incomplete until live acceptance passes. Stage 3 is authorized after the available security checks; hosted two-user verification remains pending. All file access and project writes for this stage stay inside `~/fitness-app`.

## 16. Stage 3 implementation checkpoint

The current user authorized recommendations and routine management after the available security tests pass. The original 115-test suite passed, including two-user local PostgreSQL isolation, and ten read-only hosted checks passed (seven anonymous personal-table denials and three seeded public catalogs). Hosted signed-in two-user verification cannot be inferred from those results; it remains explicitly pending.

Stage 3 now provides deterministic, equipment-filtered recommendations, explained prescription defaults, custom creation/editing/reordering, owner-filtered fresh database reads, and archive confirmation. The existing small catalog is reused; unsupported equipment coverage is explained rather than fabricating routines. Timeline affects review timing only. Sources, input assumptions, and rule version are saved with recommended plans.

The caller-privilege atomic-save function in `supabase/migrations/202610170003_routine_save.sql` is installed on hosted Supabase according to the user's 2026-10-18 confirmation. It changes no table or RLS policy. Its previous installation blocker is resolved; live save/edit/retry/archive/reload and two-account isolation acceptance remain pending. Future hosted changes still require explicit approval. Editing a plan with sessions creates a new version and archives the old version to protect history. `docs/STAGE_3.md` records the full rule mapping, test evidence, SQL review, and remaining live acceptance steps. Stage 4 has not started.

## 17. Final Stage 3 save-migration review

Before hosted approval, migration 003 was revised to explicitly validate JSON shapes/types/bounds, retain older per-request receipts in the existing assumptions column, use SHA-256 over the routine/document/edit precondition, ignore client-supplied bookkeeping, and acknowledge prior successes after catalog deprecation. The frontend excludes receipt metadata from editable documents.

Migration 003 now also replaces the existing timestamp helper: routine updates use strictly increasing wall-clock-based conflict tokens, while profile timestamps retain their original behavior. Its API signature, caller privileges, fixed search path, RLS policies, composite ownership constraints, and history-versioning design remain intact. No tables or columns are added. No hosted SQL or data changes were made during review. The exact scope and verified limits are in `docs/ROUTINE_SAVE_REVIEW.md`.

Verification: 216 automated tests including 122 isolated PostgreSQL checks, TypeScript, production build, and six real multi-connection tests on disposable local PostgreSQL passed. Development-only embedded PostgreSQL was added for the concurrency tests; all its data, temporary files, and sockets remain within ignored `.test-postgres/` under the project. Stage 4 remains unstarted.

## 18. Stage 3 refinement proposal — awaiting implementation approval

### Authorization and preservation

This update changes documentation only. Do not change application code, dependencies, SQL migrations, seeds, or the hosted database until the user approves the implementation plan. Plan approval will authorize local implementation; applying any new hosted migration or reference-data update requires a separate explicit review/approval. Keep all filesystem operations inside `~/fitness-app`. Do not start Stage 4.

Preserve authentication/session recovery, Supabase clients/configuration, existing profile fields and values, saved routine IDs and prescriptions, RLS, ownership foreign keys, atomic-save validation, retry receipts, exact optimistic-concurrency timestamps, archive behavior, and history-preserving versions. Do not reset, reseed, or rebuild the application. Never regenerate saved routines automatically when profile inputs or recommendation rules change.

### Why recommendations repeat

Inspection of `recommendations.ts`, its tests, the profile code, and migration 002 establishes these causes:

1. Candidates are mostly sorted by slug and selected as `matches[variant % matches.length]`. The split passes the overall workout index: Upper sessions at 0/2 and Lower sessions at 1/3 cycle back to the same choice when two candidates exist. This is deterministic indexing, not meaningful A/B programming.
2. Squats rank loadable movements first, but only the strength goal pins the first loadable choice. Other goals cycle into bodyweight squats on later workouts even for experienced users. Experience mainly changes sets/reps and split eligibility; there is no explicit difficulty, progression capacity, or goal-based exercise ranking.
3. The twelve-exercise catalog has only bodyweight and goblet squats, few alternatives per pattern, and no vertical pulls, knee-flexion accessories, or calf exercises. With only one compatible candidate, variation is impossible. Broad equipment categories also cannot prove access to a specific machine, rack, bench, or support.
4. Foundation and standard options use the same movements, mostly changing sets. Current tests assert compatibility, separation and volume, but do not catch identical A/B exercise lists or inappropriate experienced-user squat defaults. Four-day selection uses only the first four available weekdays and has no real 5–6-session programming.

Solution: versioned, curated workout roles; explicit equipment/suitability filters and stable rankings; A/B selection based on occurrence within each workout family; a small targeted catalog expansion; checks for coverage, workload, and duplicate options. Maintain selected exercises over repeated weeks so users can practice and progressively overload them. Variation is purposeful across workout roles, not random rotation on reload.

### Profile and backward-compatible database proposal

- Replace weekday checkboxes with “How many days per week would you like to train?” and a 2–6 selector. Keep display name, goal, experience, timeline, equipment, units, and automatic timezone detection. No timezone input; retain browser detection on save and UTC fallback.
- After plan approval, prepare a new migration 004 adding nullable `profiles.training_days_per_week integer` with a CHECK allowing NULL or 2–6. No fabricated weekday arrays and no destructive rename/drop. Leave all existing fields, constraints, defaults, grants, policies, IDs, and values intact. A nullable additive field lets old clients keep working and preserves the distinction between an explicit new preference and legacy availability.
- Avoid automatic data backfill: existing `available_weekdays` counts represent availability, not necessarily desired frequency. For a legacy profile with NULL count, show the number of distinct valid weekdays as a suggested value if it is 2–6, and ask the user to confirm it. For legacy 1/7 counts, require choosing 2–6 without overwriting old data. Do not persist a derived count until the user saves. Existing saved routines remain readable/editable regardless of this confirmation.
- New frontend reads the new count after migration installation, writes it only on explicit profile save, and leaves legacy weekdays untouched. For new profiles, the retained legacy column can use its existing database default; it is compatibility data, never an input to new recommendations. Old clients may update legacy fields without clearing the explicit count. There is no synchronization trigger that invents weekday choices.
- Use a deployment order of reviewed migration first, new frontend second. If the column is unavailable, preserve existing data access and show an actionable setup state for the new questionnaire rather than reporting a successful new-format save. Test both old-schema behavior and upgraded-schema round trips.
- New recommended/custom workouts use `routine_days.weekday = null`, which the installed schema and save RPC already support. Order is stored in `position`; meaningful labels live in `name`. Existing routine weekdays and names remain intact unless the user deliberately edits them. No save-RPC replacement is planned for this change.

### Proposed recommendation behavior (`rules-2.0`)

| Desired sessions/week | Primary template direction | Qualification |
| --- | --- | --- |
| 2 | Full Body A / Full Body B | Manageable whole-body coverage; appropriate for beginners through advanced users with tailored exercise/prescription choices. |
| 3 | Full Body A / B / C | Alternate movement emphasis; retain useful main lifts rather than forcing three unique versions of every movement. |
| 4 | Upper Body A / Lower Body A / Upper Body B / Lower Body B | Different emphasis/accessories where suitable; volume distributed across two exposures per region. |
| 5 | Upper A / Lower A / Push / Pull / Legs | Experienced-user option when equipment and volume checks pass; no automatic 25% volume increase from four days. |
| 6 | Push A / Pull A / Legs A / Push B / Pull B / Legs B | Experienced-user option, contingent on adequate catalog coverage and recovery guidance; no claim that six days is superior. |

These split choices are product heuristics, not research-mandated schedules. Rank conservative 2–3-session options for beginners; if a beginner requests 4–6, explain the mismatch and offer a clearly labeled lower-frequency starting plan rather than silently changing the preference or prescribing high volume. For experienced users, provide requested-count options when feasible; limited-equipment gaps are explained. Users decide which calendar days to train. Explain recovery between repeated muscle groups and how to continue the ordered sequence after missed days, without building a workout-completion tracker in Stage 3.

Selection and prescription requirements:

- Rank by confirmed equipment/support, goal relevance, experience/skill demand, loadability, movement/muscle coverage, and template role. Resolve ties by a stable key. Do not assume all machines are available from a single broad checkbox; confirm requirements in the questionnaire or plan selection before recommending specific equipment-dependent movements. Any additional persisted equipment-detail field must be included in the reviewed migration proposal, not silently added later.
- Prefer appropriate loadable knee-dominant movements for experienced gym users. Keep accessible machine and dumbbell options; complex lifts are optional. For limited equipment, retain a suitable repeated exercise with a transparent explanation rather than downgrade a suitable main lift just to make A/B lists differ.
- Keep core lifts stable within a saved plan. Where compatible alternatives exist, vary an accessory, angle, unilateral/bilateral role, or movement emphasis between A/B workouts. A different title alone is not a distinct workout. Distinctiveness checks compare actual exercise IDs and prescriptions, allowing deliberate shared anchors and documented limited-equipment exceptions.
- Start with the existing editable presets: beginners 1–2 working sets at 8–12 reps; experienced strength main lifts 2–3 at 4–8; hypertrophy main lifts 2–3 at 8–12 with simpler accessories allowed 10–15. Rest generally 2–3 minutes for demanding compounds and 1–2 minutes for accessories, with longer recovery permitted. These are implementation starting choices, not universal optimums or direct translations of a specific percentage of 1RM.
- Calculate weekly muscle exposure and primary-muscle working-set totals before finalizing a plan; label secondary involvement separately. Spread a selected workload across the requested sessions instead of multiplying it by frequency. Keep beginner starts conservative and disclose when hypertrophy plans are below higher-volume research examples. No automatic load increases, 1RM testing, mandatory failure, or estimated outcomes.
- Return a readable explanation of why this split and these exercises fit, recovery advice, equipment assumptions, weekly workload, evidence links, rule version, and review timeline. Store these with new plans; existing `rules-1.0` plans remain unchanged.
- Target roughly 12–18 additional curated exercises only where needed: loadable squat alternatives (e.g. leg press and rack-based squat), vertical pulls, knee flexion, unilateral lower-body work, calves, and a few accessories. Final list depends on demonstrated template gaps. Every new entry needs equipment/support requirements, loading convention, technique/rest guidance, muscle mapping, and an explained alternative. Use new stable IDs and an additive catalog/source migration (proposed 005); never modify installed seed 002 or delete existing entries. Exact SQL and data changes require review before hosted application. Keep unsuitable plans unavailable until their catalog requirements are actually installed.

### Publication-level evidence review (2026-10-18)

Primary basis is peer-reviewed research plus current professional guidance. Reviews summarize primary trials and are not independent replications of their included studies. Fitness websites provide supplementary interpretation only. Do not treat publisher affiliation or commercial editorial review as proof of a universal prescription.

| Publication | Evidence used and application | Limitations / access |
| --- | --- | --- |
| Currier et al. (2026), *Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews*, ACSM Position Stand, MSSE 58:851–872. [DOI](https://doi.org/10.1249/MSS.0000000000003897), [PubMed](https://pubmed.ncbi.nlm.nih.gov/41843416/) | Progressive resistance training; strength benefits from heavier loading, hypertrophy from higher volume. Supports goal-sensitive programming, not a mandatory exercise type. | Healthy adults; population averages do not establish individual readiness or exact starting volume. PubMed abstract and official summary reviewed; full-text access was blocked during this update. Keep numerical app defaults explicitly labeled heuristics pending full-text review. |
| Currier et al. (2023), *Resistance training prescription for muscle strength and hypertrophy in healthy adults: a systematic review and Bayesian network meta-analysis*, BJSM 57:1211–1220. [Publication](https://bjsm.bmj.com/content/57/18/1211) | Multiple prescriptions work; supports heavier-load emphasis for strength and multiple sets for hypertrophy, with flexible programming. | Rankings are not guarantees of superiority for every user; interventions and populations differ. Do not translate ranking into a single compulsory split. |
| Kassiano et al. (2022), *Does Varying Resistance Exercises Promote Superior Muscle Hypertrophy and Strength Gains? A Systematic Review*, JSCR 36:1753–1762. [DOI](https://doi.org/10.1519/JSC.0000000000004258) | Supports deliberate anatomical/biomechanical variation while retaining specificity. Informs stable A/B roles rather than random swaps. | Eight studies, 241 young men; evidence is limited for other populations and does not establish an ideal amount of variation. |
| Ramos-Campo et al. (2024), *Efficacy of Split Versus Full-Body Resistance Training on Strength and Muscle Growth: A Systematic Review With Meta-Analysis*, JSCR 38:1330–1340. [PubMed](https://pubmed.ncbi.nlm.nih.gov/38595233/), DOI 10.1519/JSC.0000000000004774 | Similar outcomes when volume is equated support choosing split structure for practical fit and distributing workload. | Fourteen studies, 392 subjects; no proof that the proposed five/six-session templates outperform simpler plans. Abstract-level review. |
| Baz-Valle et al. (2019), *The effects of exercise variation in muscle thickness, maximal strength and motivation in resistance trained men*, PLoS ONE 14:e0226989. [Publication](https://doi.org/10.1371/journal.pone.0226989), [PubMed](https://pubmed.ncbi.nlm.nih.gov/31881066/) | Primary trial: varied programming improved motivation with similar observed adaptations; supports considering engagement alongside consistent practice. | Small eight-week study of trained men; absence of detected differences is not proof of equivalence or a reason to randomize the app's routines. |
| Lincoln, Ill & Ibrahim (2023), *Progressive Strategies for Teaching Fundamental Resistance Training Movement Patterns*, NSCA Personal Training Quarterly 10(2). [Article](https://www.nsca.com/education/articles/ptq/teaching-resistance-training-movement-patterns/) | Professional education supports movement proficiency and skill-appropriate exercise progressions. | Coaching guidance, not a randomized comparison validating the app's exercise ranking or self-assessed skill. |

Supplementary sources reviewed individually:

- Menno Henselmans, *How to keep building muscle after the newbie gains*. [Article/transcript](https://mennohenselmans.com/how-to-keep-building-muscle-after-the-newbie-gains/). Useful discussion of exercise consistency and progressive overload. Cross-check its interpretation against Kassiano and Baz-Valle; do not adopt “muscle confusion” claims or unsupported certainty about harm from variation. Date not established from the accessed text; accessed 2026-10-18.
- Michael Matthews, *Ep. #616: How to Find the Best Workout Split for You*, Legion Athletics, updated August 24, 2020. [Article/transcript](https://legionathletics.com/best-workout-splits-podcast/). Useful terminology and practical split tradeoffs. Commercial fitness commentary; no supplement recommendations, marketing claims, or universal best split enter the rules.
- Retain the original ACSM summary, CDC guidance, and NSCA Bonder/Shim/Tangeman article in §11 with their existing boundaries. NSCA's older [Determination of Resistance Training Frequency](https://www.nsca.com/education/articles/kinetic-select/determination-of-resistance-training-frequency/) was also consulted for program-design context; do not adopt categorical claims that experienced users cannot improve on twice-weekly training in preference to newer syntheses.

During implementation, create a source-to-rule register in the evidence documentation: full citation, year, DOI/URL, study/review type, population, specific supported claim, uncertainty, access level/date, and app heuristic. Reflect it in the methodology UI and reviewed additive evidence-source records. Verify full texts before adding new quantitative scientific claims. No personalized medical programming or guaranteed outcomes.

### Focused implementation sequence after approval

1. **Compatibility contract and evidence:** lock `rules-2.0` inputs, legacy-profile confirmation behavior, ordered-workout semantics, template coverage/volume budgets, equipment assumptions, exact catalog additions, and the source-to-rule register. Prepare additive migration 004 and catalog/source migration 005 locally with upgrade tests and review notes; do not apply hosted changes.
2. **Design system and screen review:** inspect the reference visually, select licensed fonts/photography with provenance, define shared tokens/components and responsive navigation, and present representative dashboard/profile/workout-card layouts for review before propagating them. Reuse the current router, auth provider and Supabase repositories.
3. **Profile and recommendations:** implement the count questionnaire and compatibility adapter, automatic timezone behavior, metadata/rankings, stable A/B templates for feasible 2–6 counts, duplicate/coverage/volume checks, and explained limitations. Keep installed RPC semantics and saved-plan snapshots intact.
4. **Apply the interface across Stage 3:** integrate dashboard, profile, Discover, My routines, archived plans, planned-workout details, and editor; restyle public/auth/recovery screens with the same components. Preserve create/edit/reorder/archive, confirmation, error/retry and account-switch behavior. Do not display a working “Start workout” action until Stage 4 is authorized and implemented.
5. **Verification and hosted acceptance:** run appropriate rule/UI/upgrade/RLS tests, `npm run check`, and concurrency checks if save behavior changes. Review new migrations and reference rows with the user before their SQL Editor execution. Then verify hosted saves and isolation with actual accounts. Update stage documentation and handoff with observed results. Request separate Stage 4 approval only after the refinement and acceptance work is complete.

Acceptance gates:

- Cover every goal × experience × requested count (2–6), plus representative equipment sets, missing equipment, deprecated entries, limited-alternative cases, and catalog ordering. Deterministic inputs produce stable workouts without mutating profiles/catalogs; timeline affects only review timing.
- Reproduce the current upper/lower modulo bug and experienced-user bodyweight-squat regression in focused tests; verify purposeful A/B differences when appropriate alternatives exist, stable shared anchors, honest exceptions, no duplicate options, and audited per-week workload.
- Upgrade a populated local copy of schema 001–003: all old profile values, routine IDs, days, prescriptions, archived plans, and save receipts survive. Test legacy counts 1–7 including duplicates, NULL/confirmed new counts, new profiles, timezone fallback, and old-client writes. RLS and anonymous/two-user denials remain intact.
- Verify desktop/mobile layouts, keyboard and screen-reader flows, contrast, reduced motion, loading/empty/error states, auth callbacks, profile saves and routine create/customize/edit/reorder/archive/reload. Photography licenses/provenance must be recorded before release.
- Hosted acceptance remains explicitly pending until observed: save/create/edit/archive, failed-request retry without duplication, refresh and sign-out/in persistence, and two-account read/write isolation including RPC attempts. Local mocks and PostgreSQL identity emulation are not hosted verification. Use existing rollback-only SQL scripts with user-controlled test identities; never ask for passwords in chat.

Approval checkpoint: approve or amend this Stage 3 refinement plan before implementation. Approval of this plan alone does not authorize applying new hosted SQL, deployment, purchases, or Stage 4.
