-- REVIEW REQUIRED. Forward upgrade for installed migrations 001–003.
-- Local preparation only. Do not execute on hosted Supabase without approval.
begin;
alter table public.profiles
  add column training_days_per_week integer
    check (training_days_per_week between 2 and 6),
  add column equipment_details text[]
    check (equipment_details <@ array['bench','rack','leg_press','lat_pulldown','leg_curl','cable_station','calf_machine']::text[]
      and cardinality(equipment_details) <= 7 and array_position(equipment_details, null) is null);
-- NULL means not yet confirmed. No backfill: availability is not preference.
-- Existing weekdays, profile values, RLS, grants, routines and RPC are unchanged.
commit;
