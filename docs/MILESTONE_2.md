# Stage 3 Milestone 2 — local routine planning

Implemented October 18, 2026. **Hosted migration 007 has not been applied or probed. Stage 4 has not started.** Exercise photos have been removed by the latest user request. Isolated browser acceptance remains pending.

## User flows

One collapsed recommendation is selected from goal, experience and requested 2–6 sessions. Gender, legacy equipment, units, timeline, name and timezone do not affect selection. The selector uses actual catalog records, filters deprecated/skill-inappropriate entries and retains systematic A/B variation and strength anchors. Equipment ownership is unknown; requirements describe the exercise, never the user's inventory. New plans contain exercises with targets unset, not invented sets/reps/weights or volume totals.

Open shows an initially collapsed two-column desktop session grid, stacked on mobile. Only one session panel appears beneath the cards; switching replaces it, and the selected card or labelled X closes it. A session stays open through rerenders. Exercise names and equipment remain visible within the selected panel, with one short description open at a time. Use This Routine explicitly saves, retains the same routine/request IDs on retry, and confirms success only after an RPC response. Customize makes an independent copy with a new ID. Create My Own Routine works without a profile or catalog. The editor starts an empty new routine and shows routine name, Day 1/Day 2 selection, workout/session name, then one exercise input form. A separate input buffer is not a routine row. Add Exercise validates and appends one exercise to the compact added list, then clears the composer and targets. Existing rows use Done Editing Exercise without duplicating them. Add Day creates an empty session; day navigation preserves unfinished buffers. Save includes any valid last typed exercise without creating placeholders. Existing saved exercises, ordering and per-set targets load exactly. Save Routine creates; Save Changes keeps the selected routine ID and exact edit timestamp. Units sit beside weights, blank values remain NULL, and an explicit zero is preserved. Weight conversions retain canonical kg.

Cancel discards the entire local draft, validation/network errors, retry state and preview; it never sends a write or prompts for confirmation. Save and Cancel are disabled while a request is pending. Auth account changes remount and clear private drafts. Archived plans and history-preserving edits continue to work. Legacy ranges remain aggregate targets until the user explicitly switches to individual targets or changes the exercise; the interface explains the reset. Editing a source document never mutates it.

## Migration 007 review

File: `supabase/migrations/202610180007_custom_planning.sql`. This is one transactional forward upgrade, not a replacement for installed migrations. Files 001–006 were not modified during Milestone 2.

- `routine_exercises`: catalog ID XOR private nonblank custom name; `planning_mode` defaults to `legacy`. Original IDs, notes, aggregate ranges and foreign keys remain. Selected NOT NULLs are relaxed only for the new mode, with mode/source checks replacing them. The existing `(user_id,id)` unique key is reused; the draft's redundant duplicate key was removed.
- `routine_planned_sets`: separate owned, ordered planning rows, maximum 10 per exercise, nullable integer reps (1–100), nullable nonnegative load (0–10000 kg) and kg/lb entered unit. No performed-session table is altered. Zero rows means targets unset.
- A composite owner/parent FK and FORCE RLS owner policies protect the new table. No anonymous access; no existing RLS policies or reference-data grants are relaxed. Custom names live only on owned routine rows and never become public exercises.
- A child trigger locks its parent with `FOR UPDATE` before checking mode. This is required because FK key-share locks do not block non-key mode updates. The inverse trigger rejects conversion to legacy while children exist. Native tests exercise both blocking orders.
- `fitness_save_routine_v2` is SECURITY INVOKER with fixed empty search path, authenticated execution only, strict JSON/scalar/size bounds, atomic rollback, per-user advisory serialization, exact optimistic timestamps, versioned hashes and cumulative receipts. Edits referenced by workout history archive/version the plan instead of replacing its children. v1 remains installed and late retries across both RPC versions do not undo later changes.

The frontend uses v2 whenever any per-set/custom row exists. It never downgrades such a save to v1. Legacy-only edits retain the existing v1 path. Before 007, an absent planned-set relationship permits legacy reads only; if any per-set record is present but targets cannot be loaded, loading fails rather than presenting an empty target list.

## Separate hosted approval and once-only installation

Nothing in this document approves execution. After reviewing the complete 007 file and separately approving hosted installation:

1. Confirm the intended Supabase project and that migrations 001–006 are already installed; do not rerun them.
2. Review a backup/recovery option and the complete 007 transaction. Paste **only** `202610180007_custom_planning.sql` into a new SQL Editor query and execute once. Do not paste 001–006 or combine other drafts.
3. Confirm transaction success and schema-cache refresh before testing the new frontend. A failed transaction rolls back; diagnose before retrying. A successful installation must not be rerun.
4. With authorized test accounts, verify custom/per-set Use/create/edit/reload/sign-out/in, retries and two-owner read/write/RPC isolation. Never paste passwords or service credentials into chat. Hosted acceptance remains unverified until observed.

## Local verification

Latest UI correction run: 368 tests / 17 files passed, TypeScript and production build passed; 12 native PostgreSQL concurrency scenarios passed in the preceding database correction run (not rerun for this UI-only change). `git diff --check` passed. Browser and hosted acceptance remain unverified.

`npm run check` runs unit/UI/database tests, TypeScript and production build. `npm run test:db:concurrency` starts disposable PostgreSQL 18.4 with separate connections, sockets and temporary data inside ignored `.test-postgres/`. It does not load Supabase credentials or access hosted services.

Coverage includes all 45 goal/experience/frequency combinations using the installed catalog through local v2; populated upgrades; legacy IDs/values/receipt compatibility; custom/catalog mixes; varying reps/loads/units, NULL and zero; strict malformed payload rejection; cross-owner and anonymous denial; parent-mode constraints; stale edit conflicts; rollback; history-preserving versioning; UI open/cancel zero writes; acceptance errors/retries; customization immutability; profile-independent creation; and owner changes.

The exact isolated Playwright candidate is `scripts/milestone2-browser.js`. It needs script-specific approval under the NOTES.md contract before running with MCP. It creates a fresh browser context, blocks external HTTP and all WebSockets, intercepts auth/config/repository modules, uses synthetic session data and synthetic sessionStorage only, and saves screenshots inside this project. It covers 320/390/768/1440 widths, short viewports and CSS zoom, scrolling geometry, preview/disclosure/cancel, custom targets, failures/retries, mocked reload persistence hash/history navigation and explicit deletion confirmation. This does not verify hosted auth/persistence/RLS.

## Editor investigation and corrections

The previous editor represented a blank exercise as an item in the routine's exercise array, rendered a “New exercise” row, and filtered blank entries at save time. The new implementation separates per-day composers from added exercise records, validates before Add Exercise appends, and never fills from the catalog automatically. Editing selects the first saved row without replacing it; untouched composers are excluded from the payload. Valid unfinished composers are included once on explicit Save, including when another day is selected. Existing rows and added rows never share an append path.

The save button previously always read Save Routine. It now reads Save Changes for an existing ID/timestamp. The page passes the saved ID and version through unchanged. The existing RPC updates an unreferenced routine in place; history-linked edits intentionally create a protected version and archive the original. This is explained before save and reported on success. Other routines are never removed by saving the chosen plan.

## Delete separately from Archive

Delete is available for active and archived plans. Opening its inline confirmation does not write. Delete permanently submits one owner/ID/exact-timestamp-filtered DELETE, requires a returned row before reporting success, and disables actions in flight. Keep routine cancels without a write. Missing, denied or stale requests retain the UI record and show an error.

No SQL changes are required for deletion. Installed migration 001 already grants owner DELETE through RLS and cascades a routine's planning children. Its NO ACTION foreign keys from workouts block deletion of any referenced plan, including workouts whose routine-day ID is NULL. The frontend explains the refusal and directs the user to Archive. No workouts, recorded sets, snapshots, other routines or public exercises are detached or deleted. The local 007 draft is unchanged by these corrections.

Local regression tests cover exact saved updates without duplicate routines, other active/archived plans unchanged, owned planned-child deletion, anonymous/cross-owner denial, stale confirmation, and complete workout/snapshot/set preservation. Native PostgreSQL contention tests cover stale delete versus save and both ordering directions between delete and workout insertion.

## Text-only explanations

All exercise photographs, runtime/photo provenance mappings, image UI, image tests and the old photo-coverage gate are removed at the user's request. Brief original descriptions appear only on the recommended routine's exercise disclosures. Saved/custom plans display names and targets; the custom editor contains user input and notes, without automatic technique descriptions or media. Decorative public/dashboard gym-floor photography remains separate. No replacement exercise diagrams or image placeholders were added.

The earlier image coverage failure is historical and no longer an acceptance requirement. The remaining manual browser/hosted verification limits above still apply.
