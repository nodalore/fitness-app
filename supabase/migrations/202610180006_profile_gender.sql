-- Local reviewed migration: apply once only after separate hosted approval.
-- Upgrade for installed migrations 001–005. No backfill, defaults, grants or policy changes.
-- NULL preserves untouched legacy profiles; the new form requires an explicit choice.
begin;
alter table public.profiles add column gender text
  constraint profiles_gender_check check (gender in ('woman','man','non_binary','prefer_not_to_say'));
commit;
