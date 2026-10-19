-- Draft workout cancellation. Apply only after separate hosted approval.
-- Installed migrations 001–008 and existing records remain unchanged.
begin;

-- Retain only cancellation identity, never exercise names or actual performance.
-- No session FK: the discarded workout must be physically deleted. Keeping this
-- marker prevents a delayed first save (expected revision NULL) recreating it.
create table public.workout_cancellations (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  cancelled_at timestamptz not null default clock_timestamp(),
  primary key(user_id,session_id)
);
alter table public.workout_cancellations enable row level security;
alter table public.workout_cancellations force row level security;
revoke all on public.workout_cancellations from public,anon,authenticated;
-- No client policies/grants: only the validated RPCs and trusted administrator
-- can read/write markers. Client-set GUCs never confer writer privileges.

-- Keep the installed save implementation intact behind a protected entry point.
-- Only the trusted migration owner can execute this renamed helper. The public
-- API, parameter names, receipt validation and return shape remain unchanged.
alter function public.fitness_save_workout(jsonb,bigint,uuid,uuid,boolean) rename to fitness_save_workout_v008;
revoke all on function public.fitness_save_workout_v008(jsonb,bigint,uuid,uuid,boolean) from public,anon,authenticated;
create function public.fitness_save_workout(
  p_document jsonb, p_expected_revision bigint, p_request_id uuid,
  p_expected_user_id uuid, p_finish boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); sid uuid;
begin
  if owner_id is null or owner_id is distinct from p_expected_user_id then
    raise exception 'Sign in to the correct account' using errcode='42501';
  end if;
  if p_document is null or jsonb_typeof(p_document) is distinct from 'object' or octet_length(p_document::text)>2097152 then
    raise exception 'Invalid workout document' using errcode='22023';
  end if;
  sid := (p_document->>'id')::uuid;
  if sid is null then raise exception 'Invalid workout' using errcode='22023'; end if;
  -- Same lock as save/routine versioning: cancellation and every retry serialize.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  if exists(select 1 from public.workout_cancellations where user_id=owner_id and session_id=sid) then
    raise exception 'This workout was canceled and cannot be saved again' using errcode='55000';
  end if;
  return public.fitness_save_workout_v008(p_document,p_expected_revision,p_request_id,p_expected_user_id,p_finish);
end; $$;
revoke all on function public.fitness_save_workout(jsonb,bigint,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.fitness_save_workout(jsonb,bigint,uuid,uuid,boolean) to authenticated;

-- Guard direct authenticated INSERTs too, including clients that bypass RPCs.
-- Take the account lock before checking the marker, even if no session exists.
create function public.fitness_reject_cancelled_workout() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
  if exists(select 1 from public.workout_cancellations where user_id=new.user_id and session_id=new.id) then
    raise exception 'This workout was canceled and cannot be saved again' using errcode='55000';
  end if;
  return new;
end; $$;
revoke all on function public.fitness_reject_cancelled_workout() from public,anon,authenticated;
create trigger workout_cancelled_insert_guard before insert on public.workout_sessions
for each row execute function public.fitness_reject_cancelled_workout();

create function public.fitness_cancel_workout(p_session_id uuid,p_expected_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); current_state text;
begin
  if owner_id is null or owner_id is distinct from p_expected_user_id then
    raise exception 'Sign in to the correct account' using errcode='42501';
  end if;
  if p_session_id is null then raise exception 'Invalid workout' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  select status into current_state from public.workout_sessions where user_id=owner_id and id=p_session_id for update;
  if found then
    -- Explicit check is required: SECURITY DEFINER must not rely on a trigger's
    -- current_user app-role test to protect completed root records.
    if current_state<>'draft' then raise exception 'Completed workouts cannot be canceled' using errcode='55000'; end if;
  elsif exists(select 1 from public.workout_sessions where id=p_session_id) then
    raise exception 'Workout unavailable' using errcode='42501';
  end if;
  -- Also allow a not-yet-autosaved draft. This reserves its ID before a delayed
  -- first save can arrive. Repeating cancellation after a lost response is safe.
  insert into public.workout_cancellations(user_id,session_id) values(owner_id,p_session_id)
    on conflict(user_id,session_id) do nothing;
  delete from public.workout_save_receipts where user_id=owner_id and session_id=p_session_id;
  delete from public.workout_sessions where user_id=owner_id and id=p_session_id and status='draft';
  -- Installed owned FKs cascade only this workout's exercises and actual sets.
  return jsonb_build_object('id',p_session_id,'status','canceled');
end; $$;
revoke all on function public.fitness_cancel_workout(uuid,uuid) from public,anon,authenticated;
grant execute on function public.fitness_cancel_workout(uuid,uuid) to authenticated;
commit;
