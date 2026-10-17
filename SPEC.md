# Fitness App — MVP specification

Status: architecture approved; Stage 1 completed; Stage 2 authorized, with work stopping at any missing credentials or authorization. Stage 3 and later require separate approval.
Prepared: 2026-10-17.

## 1. Project inspection

The project folder contains only an initialized `.git` directory. There are no application files, dependencies, existing commits, or project/ancestor AGENTS.md instructions. This specification is the first project document. No application has been implemented, Supabase provisioned, or website published.

## 2. Scope and user journey

Build a responsive public website for generally healthy adults who want resistance-training routines and a private workout history.

1. Visit a public introduction and evidence/methodology page.
2. Register, verify email, and sign in.
3. Supply goal (general fitness, strength, muscle growth), experience (beginner, intermediate, advanced), available weekdays, and desired review timeline (weeks). Also choose available equipment and kg/lb units so recommendations are usable.
4. See 2–3 compatible routine options, their schedules, sets/rep ranges, rest guidance, explanation, and assumptions.
5. Copy a recommendation into a personal routine or build one from the exercise library; edit days, exercises, order, sets, reps, and rest.
6. Start a session, record individual sets, resume a saved draft, and complete the workout.
7. Review history and compare the same exercise with previous completed sessions.
8. Inspect suggested exercise replacements, read similarities and differences, and replace an exercise in the routine or current draft.

MVP excludes paid AI, nutrition/calorie prescriptions, rehabilitation, medical personalization, coaching/social features, wearables, subscriptions, offline synchronization, and guaranteed body-composition outcomes. Advanced users can customize routines but are not promised specialist athletic programming. Cardio guidance is educational; cardio logging is outside this MVP.

## 3. Proposed architecture and stack

- **Frontend:** React + TypeScript + Vite, React Router, plain CSS, Supabase JavaScript client, Zod for input validation. A static app is sufficient for the authenticated dashboard and avoids an unnecessary custom server.
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
| `profiles` | `user_id` PK/FK → auth.users; goal, experience, available_weekdays, timeline_weeks, equipment, display_unit, timezone, onboarding_completed_at |
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

Rules are product heuristics informed by evidence, not a validated clinical algorithm. Each returned recommendation includes rule version, selected inputs, rationale, and links to relevant guidance.

- Filter by equipment and available days before ranking. Beginner default: manageable full-body sessions on two or three separated days when possible. Intermediate/advanced options can include a four-day upper/lower split when the schedule permits. Extra available days do not force extra training.
- Provide 2–3 genuinely distinct feasible options using equipment and exercise variants. If fewer are feasible, explain why rather than fabricating incompatible routines. One available day gets a one-day starter option and a clear explanation that it is below the general twice-weekly strengthening recommendation.
- Rank by schedule fit, experience, and goal with stable tie-breaking. A short timeline changes the review date only; it must not trigger extreme volume or accelerated-result claims.
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
- Trends: per-exercise load and rep history, per-session comparable volume-load, and completed sessions per week in the user's timezone. First session shows an empty comparison state; zero baseline has no percentage change; decreases are displayed honestly.
- A replacement exercise starts its own trend. No estimated 1RM, calorie estimates, or predicted physique outcomes in MVP.

## 8. Screens and accessibility

Public home and methodology; auth and recovery; onboarding; recommendation cards; routine editor; workout logger; history/session details; progress; exercise detail/substitutions; settings.

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

Sources checked 2026-10-17. Source mapping will be carried into the in-app methodology and reference seed records. Recheck the full paper before finalizing any numerical claim beyond its official summary; do not infer unsupported prescription details from an abstract.

1. **ACSM 2026 position stand:** Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. [Publication record](https://pubmed.ncbi.nlm.nih.gov/41843416/), [official position-stand index](https://acsm.org/education-resources/pronouncements-scientific-communications/position-stands/), [official summary](https://acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf). Supports regular progressive resistance training, goal-specific loading/volume, and simple adaptable programs; the official summary emphasizes major muscle groups at least twice weekly. It describes heavier loading for strength and approximately ten weekly sets per muscle group for hypertrophy. These do not establish guaranteed individual outcomes or mandatory novice starting volumes.
2. **CDC, Adult Activity: An Overview:** [Guidelines](https://www.cdc.gov/physical-activity-basics/guidelines/adults.html). Adults should combine at least 150 minutes moderate or 75 minutes vigorous aerobic activity (or equivalent) with strengthening all major muscle groups on at least two days weekly. Resistance logging alone does not demonstrate meeting the aerobic guideline.
3. **NSCA, Bonder, Shim, and Tangeman, November 2022:** [Time-Efficient Training Approach as a Solution to Sedentary Occupational Health Risks](https://www.nsca.com/education/articles/ptq/time-efficient-training/). Supports considering movement selection, experience, available time, and rest in program design. This educational article discusses different rest needs; its time-efficient examples are not universal prescriptions. App defaults do not adopt its advanced failure-based methods for novices.
4. **Supabase:** [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) and [password-based authentication](https://supabase.com/docs/guides/auth/passwords). Technical basis for authenticated access and database-enforced isolation.

## 12. Approval and external setup dependencies

Approval of this plan is required before scaffolding, installing dependencies, applying migrations, or provisioning/publishing services. The architecture and Stages 1–2 were approved. Stop Stage 2 if credentials or authorization are needed. Stage 3 and later require explicit approval.

A real deployment requires access to a user-owned Supabase project (project URL, publishable key, and an approved secure path for migrations), production email configuration, and Sites hosting permissions. No connected Supabase provisioning tool is currently exposed. Verify the available CLI/dashboard authentication after approval; if unavailable, prepare migrations and exact setup steps and request the minimum required connection. Never ask for secret keys in chat. Service costs and plan limits must be checked before any paid provisioning; no paid resource purchase is included in plan approval. Public hosting exposes the app's entry pages, while individual workout records remain private.

## 13. Approved implementation priorities

Stage 1 is complete. Stage 2 (database setup, authentication, and security) is now authorized; stop if credentials or authorization are needed. Stage 3 is not authorized. All project file operations stay inside `~/fitness-app`, including npm cache and build artifacts. Secure authentication, Supabase persistence, logging, basic recommendations/comparisons, exercise substitutions, and public deployment remain core. Start with a small curated exercise library. Postpone advanced charts, countdown timers, and extensive filtering. Stage 1 delivers only the runnable frontend shell and verification setup; it does not provision services, implement authentication, or publish a site.

## 14. Persistent frontend design requirements

These requirements apply to future frontend work, including authentication screens. They do not authorize an unrelated redesign or expand a development stage.

- Create a distinctive, context-specific fitness experience rather than a generic dashboard or interchangeable card template. The working direction is a training journal, with expressive typography and purposeful visual hierarchy; this direction can evolve within the requirements below.
- Typography: choose beautiful, distinctive, readable typefaces. Avoid Inter, Arial, Roboto, generic system-font-led designs, and defaulting to Space Grotesk. Choose fonts intentionally for this project; retain practical fallback fonts. The Stage 1 shell's Inter/system stack is existing work to revisit during an authorized frontend design pass.
- Color: commit to a cohesive palette with dominant colors and sharp accents. Define reusable CSS variables. IDE themes and cultural aesthetics may inform the palette. Avoid clichéd purple gradients on white and timid, evenly distributed color schemes.
- Layout: use proportions, spacing, and composition that reflect training and personal recordkeeping. Avoid predictable, repeated component patterns and cookie-cutter layouts. Keep workout entry clear and efficient on mobile.
- Backgrounds: build atmosphere and depth through layered gradients, geometric patterns, or contextual treatments instead of relying on flat fills everywhere. Preserve text contrast and readability.
- Motion: favor a small number of deliberate moments, such as a coordinated page-load reveal with staggered delays. Prefer CSS animations for simple effects; use a React motion library only when available and justified. Respect `prefers-reduced-motion`, and keep essential content visible when animation is disabled.
- Accessibility and function remain acceptance requirements: readable text, contrast, keyboard focus, responsive layout, and reliable forms take priority over decorative effects.
- Do not treat visual polish as permission to implement postponed charts, countdown timers, extensive filtering, or a large exercise library.

## 15. Stage 2 access checkpoint

Initial inspection found no exposed Supabase connector, installed Supabase CLI, or configured Supabase access token. Stage 2 cannot yet apply migrations or verify real authentication and database isolation. Stop at this account-access checkpoint per the user's instruction; do not claim Stage 2 complete. Follow `docs/SUPABASE_SETUP.md` to supply project configuration and select an authorized migration workflow. Never print credential values or commit local environment files. Stage 3 remains unapproved.
