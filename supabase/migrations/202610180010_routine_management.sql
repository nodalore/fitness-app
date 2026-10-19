-- Routine management with independent completed history. LOCAL / UNAPPLIED.
-- Requires installed 001–009. Apply only after separate hosted approval.
-- No stored records are changed by installation; history is detached only when
-- its authenticated owner explicitly deletes the selected saved routine.
begin;

create table public.routine_deletions (
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid not null,
  deleted_version timestamptz not null,
  deleted_at timestamptz not null default clock_timestamp(),
  deletion_xid xid8 not null default pg_current_xact_id(),
  primary key(user_id,routine_id)
);
alter table public.routine_deletions enable row level security;
alter table public.routine_deletions force row level security;
revoke all on public.routine_deletions from public,anon,authenticated;
-- No client policies: markers are private, contain no routine content, and
-- survive deletion to reject arbitrarily late first-save retries of the same ID.

create function public.fitness_guard_routine_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
      raise exception 'Routine identity cannot change' using errcode='23514';
    end if;
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
  if exists(select 1 from public.routine_deletions where user_id=new.user_id and routine_id=new.id) then
    raise exception 'This routine was permanently deleted and cannot be saved again' using errcode='55000';
  end if;
  return new;
end; $$;
revoke all on function public.fitness_guard_routine_identity() from public,anon,authenticated;
create trigger routine_identity_guard before insert or update of id,user_id on public.routines
for each row execute function public.fitness_guard_routine_identity();

-- Force application deletion through the validated transaction below. Existing
-- save RPCs remain SECURITY INVOKER and retain their own INSERT/UPDATE and child
-- DELETE permissions. Their implementations/receipts need no rewrite.
revoke delete on public.routines from authenticated;

create or replace function public.fitness_guard_workout() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op<>'INSERT' and old.status='completed' then
    -- Do not grant history mutation merely because a role has a different name:
    -- inherited/custom app roles and unrelated SECURITY DEFINER writers must
    -- obey the same immutable-history boundary as authenticated/anon.
    if current_user in ('authenticated','anon') then
      raise exception 'Completed workouts are read-only' using errcode='55000';
    end if;
    if tg_op='UPDATE' and old.routine_id is not null
      and new.routine_id is null and new.routine_day_id is null
      and auth.uid()=old.user_id
      and (to_jsonb(new)-array['routine_id','routine_day_id']) = (to_jsonb(old)-array['routine_id','routine_day_id']) then
      -- Only the validated delete branch creates this private authorization,
      -- after ownership/version/draft checks. The full transaction ID cannot
      -- be reused after commit, even by a late retry. Client GUCs are irrelevant.
      if has_table_privilege(current_user,'public.routine_deletions','SELECT') then
        if exists(select 1 from public.routine_deletions d
          where d.user_id=old.user_id and d.routine_id=old.routine_id
            and d.deletion_xid=pg_current_xact_id()) then
          return new; -- Preserve timestamps/revision and all legacy actuals.
        end if;
      end if;
    end if;
    -- Only the table-owning maintenance role may perform auth-account cleanup.
    -- A custom role seeing zero auth rows through RLS is not account deletion.
    -- Ordinary DELETEs while the owning account exists cannot erase history.
    if tg_op='DELETE' and current_user=pg_catalog.pg_get_userbyid(
      (select c.relowner from pg_catalog.pg_class c where c.oid='public.workout_sessions'::regclass)) then
      if has_table_privilege(current_user,'auth.users','SELECT') then
        if not exists(select 1 from auth.users where id=old.user_id) then
          return old;
        end if;
      end if;
    end if;
    raise exception 'Completed workouts are read-only' using errcode='55000';
  end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' then
    if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
      raise exception 'Workout identity cannot change' using errcode='23514';
    end if;
    new.revision := old.revision+1;
    new.updated_at := greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
  end if;
  if new.status='completed' then
    if exists(select 1 from public.session_exercises e left join public.exercises c on c.id=e.exercise_id
      where e.user_id=new.user_id and e.session_id=new.id and not e.skipped and not e.removed
        and e.exercise_id is not null and e.loading_mode_snapshot is distinct from c.loading_mode) then
      raise exception 'Exercise loading convention must match the library' using errcode='23514';
    end if;
    if exists(select 1 from public.session_exercises e join public.workout_sets s on s.session_exercise_id=e.id
      where e.user_id=new.user_id and e.session_id=new.id and not e.skipped and not e.removed and (s.reps is null or s.reps not between 1 and 100 or not s.completed or (s.load_kg is not null and s.load_kg not between 0 and 10000)
        or (e.loading_mode_snapshot is distinct from 'bodyweight' and s.load_kg is null))) then
      raise exception 'Enter reps and applicable weight or remove incomplete sets before finishing' using errcode='22023';
    end if;
    if not exists(select 1 from public.session_exercises e join public.workout_sets s on s.session_exercise_id=e.id
      where e.user_id=new.user_id and e.session_id=new.id and not e.skipped and not e.removed and s.completed and s.reps is not null) then
      raise exception 'Log at least one performed set before finishing' using errcode='22023';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.fitness_guard_workout() from public,anon,authenticated;

create function public.fitness_manage_routine(
 p_id uuid, p_action text, p_expected_updated_at timestamptz, p_expected_user_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); current_routine public.routines%rowtype; deleted_version timestamptz;
begin
 if owner_id is null or owner_id is distinct from p_expected_user_id then
   raise exception 'Sign in to the correct account' using errcode='42501';
 end if;
 if p_id is null or p_action is null or p_action not in ('archive','restore','delete')
   or p_expected_updated_at is null or not isfinite(p_expected_updated_at) then
   raise exception 'Invalid routine action' using errcode='22023';
 end if;
 -- Same lock as routine saves, workout starts/saves and workout cancellation.
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
 select * into current_routine from public.routines where user_id=owner_id and id=p_id for update;
 if not found then
   select d.deleted_version into deleted_version from public.routine_deletions d where d.user_id=owner_id and d.routine_id=p_id;
   if found and p_action='delete' then
     if deleted_version is distinct from p_expected_updated_at then
       raise exception 'Routine changed; reload before deleting' using errcode='40001';
     end if;
     return jsonb_build_object('id',p_id,'status','deleted');
   end if;
   raise exception 'Routine unavailable' using errcode='42501';
 end if;
 -- A repeated archive/restore of an already matching state is a no-op. It must
 -- not touch timestamps or reapply an old request over a later opposite action.
 if (p_action='archive' and current_routine.archived_at is not null) or
    (p_action='restore' and current_routine.archived_at is null) then
   return jsonb_build_object('id',p_id,'status',case when current_routine.archived_at is null then 'active' else 'archived' end);
 end if;
 if current_routine.updated_at is distinct from p_expected_updated_at then
   raise exception 'Routine changed; reload before continuing' using errcode='40001';
 end if;
 if p_action in ('archive','restore') then
   update public.routines set archived_at=case when p_action='archive' then clock_timestamp() else null end
     where user_id=owner_id and id=p_id;
   return jsonb_build_object('id',p_id,'status',case when p_action='archive' then 'archived' else 'active' end);
 end if;
 -- Lock linked sessions before inspecting state, including direct authenticated
 -- writers. Keep NO ACTION owner/source FKs: a new reference cannot slip through.
 perform 1 from public.workout_sessions where user_id=owner_id and routine_id=p_id order by id for update;
 if exists(select 1 from public.workout_sessions where user_id=owner_id and routine_id=p_id and status='draft') then
   raise exception 'Finish or cancel unfinished workouts before deleting this routine' using errcode='55000';
 end if;
 -- Create the private, owner/routine/transaction-bound authorization only
 -- after every deletion precondition passed. The guard consumes its presence
 -- for exact FK-only detachment; failures roll it back with the deletion.
 insert into public.routine_deletions(user_id,routine_id,deleted_version) values(owner_id,p_id,current_routine.updated_at);
 update public.workout_sessions set routine_id=null,routine_day_id=null
   where user_id=owner_id and routine_id=p_id and status='completed';
 delete from public.routines where user_id=owner_id and id=p_id;
 -- Only planned children cascade. Workouts, names, actuals and receipts survive.
 return jsonb_build_object('id',p_id,'status','deleted');
end; $$;
revoke all on function public.fitness_manage_routine(uuid,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.fitness_manage_routine(uuid,text,timestamptz,uuid) to authenticated;
commit;
