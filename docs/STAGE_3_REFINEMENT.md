# Stage 3 refinement — local upgrade review

The user confirms hosted migrations 001–003 are installed. Do not rerun them. No hosted changes have been made by the agent. Stage 4 remains unstarted.

## Migration 004: profile frequency and equipment confirmation

Review `supabase/migrations/202610180004_profile_frequency.sql`. It adds nullable `training_days_per_week` (2–6) and `equipment_details` (a checked array of specific machines/supports). It performs no backfill, deletes, policy/grant changes, or RPC replacement. Existing weekday arrays and all other profile/routine/history values remain intact. Old clients continue to work and cannot clear a confirmed frequency merely by updating old fields.

The frontend reads profiles with `select('*')` and normalizes known fields, so it can still read the old schema. Legacy frequencies are unconfirmed: users explicitly select their preference. Missing new columns produce an actionable save error; the form is retained. Deploy migration 004 only after approval, before using the new questionnaire. New routine workouts are unscheduled; optional old weekday values remain editable.

Local upgrade tests apply 004 to populated 001–003, preserve original row values, round-trip 2–6, reject invalid values, and recheck anonymous/two-user ownership. These checks do not establish hosted acceptance.

Additional catalog/rules review and final acceptance instructions will follow with the next tested milestone.
