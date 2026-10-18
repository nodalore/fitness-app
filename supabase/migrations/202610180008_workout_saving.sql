-- LOCAL DRAFT ONLY. Apply once after explicit hosted approval, after 001–007.
-- No existing records are updated. Planned routines and RPCs remain unchanged.
begin;
alter table public.workout_sessions
  add column revision bigint not null default 0 check (revision >= 0),
  add column updated_at timestamptz not null default now(),
  add column source_routine_version timestamptz,
  add column source_day_position integer check (source_day_position between 0 and 6);
alter table public.session_exercises
  alter column exercise_id drop not null,
  alter column loading_mode_snapshot drop not null,
  add column source_name_snapshot text,
  add column skipped boolean not null default false,
  add column removed boolean not null default false,
  add constraint workout_custom_name check(exercise_id is not null or (char_length(trim(exercise_name_snapshot)) between 1 and 100 and exercise_name_snapshot ~ '[^[:space:]]')) not valid;
alter table public.workout_sets
  alter column reps drop not null,
  add column entered_load numeric check (entered_load >= 0 and entered_load <= 22046.2262185),
  add constraint workout_actual_load_bounds check(load_kg between 0 and 10000) not valid;

create table public.workout_save_receipts (
  user_id uuid not null default auth.uid(),
  request_id uuid not null,
  session_id uuid not null,
  payload_hash text not null,
  result_revision bigint not null,
  result_status text not null check(result_status in ('draft','completed')),
  primary key(user_id,request_id),
  foreign key(user_id,session_id) references public.workout_sessions(user_id,id) on delete cascade
);
create index workout_receipts_session on public.workout_save_receipts(user_id,session_id);
create index workout_drafts_owner on public.workout_sessions(user_id,started_at desc) where status='draft';
alter table public.workout_save_receipts enable row level security;
alter table public.workout_save_receipts force row level security;
revoke all on public.workout_save_receipts from public,anon,authenticated;
grant select,insert on public.workout_save_receipts to authenticated;
create policy workout_receipts_read on public.workout_save_receipts for select to authenticated using(auth.uid()=user_id);
create policy workout_receipts_insert on public.workout_save_receipts for insert to authenticated with check(auth.uid()=user_id);

-- All child writes lock their workout first. This serializes finishing against
-- direct table edits too, and advances the revision used by autosave clients.
create function public.fitness_guard_workout_child() returns trigger
language plpgsql security invoker set search_path='' as $$
declare parent_id uuid; parent_state text; owner_id uuid; actual_load numeric;
begin
  owner_id := case when tg_op='DELETE' then old.user_id else new.user_id end;
  if tg_op='UPDATE' and (new.user_id is distinct from old.user_id or
    (tg_table_name='session_exercises' and to_jsonb(new)->>'session_id' is distinct from to_jsonb(old)->>'session_id') or
    (tg_table_name='workout_sets' and to_jsonb(new)->>'session_exercise_id' is distinct from to_jsonb(old)->>'session_exercise_id')) then
    raise exception 'Workout parent cannot change' using errcode='23514';
  end if;
  if tg_table_name='workout_sets' and tg_op<>'DELETE' then
   if new.entered_load is not null then
    actual_load := new.entered_load / case when new.entered_unit='lb' then 2.20462262185 else 1 end;
    if actual_load not between 0 and 10000 then raise exception 'Weight out of range' using errcode='23514'; end if;
    new.load_kg := actual_load;
   end if;
  end if;
  if tg_table_name='session_exercises' then
    parent_id := (case when tg_op='DELETE' then to_jsonb(old)->>'session_id' else to_jsonb(new)->>'session_id' end)::uuid;
  else
    select session_id into parent_id from public.session_exercises where user_id=owner_id
      and id=(case when tg_op='DELETE' then to_jsonb(old)->>'session_exercise_id' else to_jsonb(new)->>'session_exercise_id' end)::uuid;
  end if;
  select status into parent_state from public.workout_sessions where user_id=owner_id and id=parent_id for update;
  if not found then
    if tg_op='DELETE' then return old; end if; -- parent-owned cascade, checked by its own guard
    raise exception 'Workout unavailable' using errcode='42501';
  end if;
  if parent_state='completed' then raise exception 'Completed workouts are read-only' using errcode='55000'; end if;
  update public.workout_sessions set revision=revision+1 where user_id=owner_id and id=parent_id;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public.fitness_guard_workout_child() from public,anon,authenticated;
create trigger workout_exercise_guard before insert or update or delete on public.session_exercises for each row execute function public.fitness_guard_workout_child();
create trigger workout_set_guard before insert or update or delete on public.workout_sets for each row execute function public.fitness_guard_workout_child();

create function public.fitness_guard_workout() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  -- Account/service maintenance remains possible; app roles cannot rewrite history.
  if tg_op<>'INSERT' and old.status='completed' and current_user in ('authenticated','anon') then
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
    if exists(select 1 from public.session_exercises e join public.workout_sets s on s.session_exercise_id=e.id
      where e.user_id=new.user_id and e.session_id=new.id and not e.skipped and not e.removed and s.reps is null) then
      raise exception 'Enter reps or remove incomplete sets before finishing' using errcode='22023';
    end if;
    if not exists(select 1 from public.session_exercises e join public.workout_sets s on s.session_exercise_id=e.id
      where e.user_id=new.user_id and e.session_id=new.id and not e.skipped and not e.removed and s.reps is not null) then
      raise exception 'Log at least one performed set before finishing' using errcode='22023';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.fitness_guard_workout() from public,anon,authenticated;
create trigger workout_session_guard before insert or update or delete on public.workout_sessions for each row execute function public.fitness_guard_workout();

create function public.fitness_save_workout(
 p_document jsonb, p_expected_revision bigint, p_request_id uuid, p_expected_user_id uuid, p_finish boolean default false
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 owner_id uuid := auth.uid(); sid uuid; existing public.workout_sessions%rowtype;
 prior public.workout_save_receipts%rowtype; source_routine public.routines%rowtype;
 selected_day public.routine_days%rowtype; e jsonb; s jsonb; n numeric; eid uuid;
 ep integer := 0; sp integer; h text; result jsonb; finish_state text;
begin
 if owner_id is null or owner_id is distinct from p_expected_user_id then raise exception 'Sign in to the correct account' using errcode='42501'; end if;
 if p_request_id is null or p_finish is null or p_document is null or jsonb_typeof(p_document) is distinct from 'object'
   or octet_length(p_document::text)>2097152 then raise exception 'Invalid workout document' using errcode='22023'; end if;
 if p_document - array['id','routineId','routineDayId','routineVersion','routineName','sessionName','dayPosition','startedAt','exercises'] <> '{}'::jsonb then
   raise exception 'Unknown workout fields' using errcode='22023'; end if;
 sid := (p_document->>'id')::uuid;
 if sid is null or jsonb_typeof(p_document->'exercises') is distinct from 'array' then raise exception 'Invalid workout' using errcode='22023'; end if;
 if jsonb_array_length(p_document->'exercises')>20 then raise exception 'Use at most 20 exercises' using errcode='22023'; end if;
 -- Share the routine-save account lock; start cannot race with routine replacement.
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
 h := encode(sha256(convert_to(jsonb_build_object('document',p_document,'revision',p_expected_revision,'finish',p_finish)::text,'UTF8')),'hex');
 select * into prior from public.workout_save_receipts where user_id=owner_id and request_id=p_request_id;
 if found then
   if prior.payload_hash<>h or prior.session_id<>sid then raise exception 'Retry token reused' using errcode='22023'; end if;
   select * into existing from public.workout_sessions where user_id=owner_id and id=sid;
   return jsonb_build_object('revision',prior.result_revision,'status',prior.result_status,'currentRevision',existing.revision,'currentStatus',existing.status);
 end if;
 select * into existing from public.workout_sessions where user_id=owner_id and id=sid for update;
 if found then
   if existing.status='completed' then raise exception 'Completed workouts are read-only' using errcode='55000'; end if;
   if p_expected_revision is null or existing.revision<>p_expected_revision then raise exception 'Workout changed; reload before saving' using errcode='40001'; end if;
   if (p_document->>'routineId')::uuid is distinct from existing.routine_id or
      (p_document->>'routineDayId')::uuid is distinct from existing.routine_day_id then
     raise exception 'Workout source cannot change' using errcode='22023'; end if;
 else
   if p_expected_revision is not null then raise exception 'Workout unavailable' using errcode='42501'; end if;
   if p_document->>'routineId' is null then
     -- Explicit recovery as an independent snapshot, never a guessed FK link.
     if p_document->>'routineDayId' is not null then raise exception 'Invalid independent workout source' using errcode='22023'; end if;
     if jsonb_typeof(p_document->'routineName') is distinct from 'string' or char_length(trim(p_document->>'routineName')) not between 1 and 100
       or jsonb_typeof(p_document->'sessionName') is distinct from 'string' or char_length(trim(p_document->>'sessionName')) not between 1 and 100 then
       raise exception 'Invalid workout names' using errcode='22023'; end if;
     source_routine.name:=p_document->>'routineName'; selected_day.name:=p_document->>'sessionName'; selected_day.position:=(p_document->>'dayPosition')::integer;
   else
   select * into source_routine from public.routines where user_id=owner_id and id=(p_document->>'routineId')::uuid for update;
   if not found then raise exception 'Routine unavailable' using errcode='42501'; end if;
   if source_routine.archived_at is not null or source_routine.updated_at is distinct from (p_document->>'routineVersion')::timestamptz then
     raise exception 'Routine changed; reload before starting' using errcode='40001'; end if;
   select * into selected_day from public.routine_days where user_id=owner_id and routine_id=source_routine.id and id=(p_document->>'routineDayId')::uuid;
   if not found or selected_day.position is distinct from (p_document->>'dayPosition')::integer then
     raise exception 'Session unavailable' using errcode='42501'; end if;
   end if;
   if jsonb_typeof(p_document->'startedAt') is distinct from 'string' or not isfinite((p_document->>'startedAt')::timestamptz) then raise exception 'Invalid workout start time' using errcode='22023'; end if;
   insert into public.workout_sessions(id,user_id,routine_id,routine_day_id,routine_name_snapshot,day_name_snapshot,source_routine_version,source_day_position,client_request_id,started_at)
   values(sid,owner_id,source_routine.id,selected_day.id,source_routine.name,selected_day.name,source_routine.updated_at,selected_day.position,sid,(p_document->>'startedAt')::timestamptz);
 end if;
 -- Transactional replacement retains the stable IDs. A foreign/colliding ID fails
 -- its unique constraint; never UPSERT a row belonging to another workout.
 delete from public.session_exercises where user_id=owner_id and session_id=sid;
 for e in select value from jsonb_array_elements(p_document->'exercises') loop
   if jsonb_typeof(e) is distinct from 'object' or e - array['id','exerciseId','name','loadingMode','sourceName','target','skipped','removed','sets'] <> '{}'::jsonb then raise exception 'Invalid exercise fields' using errcode='22023'; end if;
   if jsonb_typeof(e->'name') is distinct from 'string' or char_length(trim(e->>'name')) not between 1 and 100 or not(e->>'name' ~ '[^[:space:]]') then raise exception 'Enter an exercise name' using errcode='22023'; end if;
   if jsonb_typeof(e->'skipped') is distinct from 'boolean' or jsonb_typeof(e->'removed') is distinct from 'boolean' or jsonb_typeof(e->'target') is distinct from 'object' then raise exception 'Invalid exercise metadata' using errcode='22023'; end if;
   if e->>'sourceName' is not null and (jsonb_typeof(e->'sourceName')<>'string' or char_length(e->>'sourceName')>100) then raise exception 'Invalid source name' using errcode='22023'; end if;
   eid := (e->>'id')::uuid;
   insert into public.session_exercises(id,user_id,session_id,exercise_id,exercise_name_snapshot,loading_mode_snapshot,source_name_snapshot,target_snapshot,position,skipped,removed)
   values(eid,owner_id,sid,(e->>'exerciseId')::uuid,trim(e->>'name'),e->>'loadingMode',e->>'sourceName',e->'target',ep,(e->>'skipped')::boolean,(e->>'removed')::boolean);
   ep:=ep+1; sp:=0;
   if jsonb_typeof(e->'sets') is distinct from 'array' then raise exception 'Invalid sets' using errcode='22023'; end if;
   if jsonb_array_length(e->'sets')>10 then raise exception 'Use at most 10 sets' using errcode='22023'; end if;
   for s in select value from jsonb_array_elements(e->'sets') loop
     if jsonb_typeof(s) is distinct from 'object' or s - array['id','reps','weight','unit'] <> '{}'::jsonb or not(s ?& array['id','reps','weight','unit']) then raise exception 'Invalid set fields' using errcode='22023'; end if;
     if s->>'reps' is not null then
       if jsonb_typeof(s->'reps')<>'number' then raise exception 'Reps must be whole numbers' using errcode='22023'; end if;
       n:=(s->>'reps')::numeric;
       if n<>trunc(n) or n not between 1 and 100 then raise exception 'Use 1–100 reps' using errcode='22023'; end if;
     end if;
     if s->>'unit' is null or s->>'unit' not in ('kg','lb') or jsonb_typeof(s->'unit')<>'string' then raise exception 'Choose kg or lb' using errcode='22023'; end if;
     n:=null;
     if s->>'weight' is not null then
       if jsonb_typeof(s->'weight')<>'number' then raise exception 'Weight must be numeric' using errcode='22023'; end if;
       n:=(s->>'weight')::numeric / case when s->>'unit'='lb' then 2.20462262185 else 1 end;
       if n not between 0 and 10000 then raise exception 'Weight out of range' using errcode='22023'; end if;
     end if;
     sp:=sp+1;
     insert into public.workout_sets(id,user_id,session_exercise_id,set_number,reps,load_kg,entered_unit,entered_load,completed)
     values((s->>'id')::uuid,owner_id,eid,sp,((s->>'reps')::numeric)::integer,n,s->>'unit',(s->>'weight')::numeric,true);
   end loop;
 end loop;
 finish_state:=case when p_finish then 'completed' else 'draft' end;
 update public.workout_sessions set status=finish_state,completed_at=case when p_finish then greatest(clock_timestamp(),started_at) else null end where id=sid and user_id=owner_id returning * into existing;
 result:=jsonb_build_object('revision',existing.revision,'status',existing.status,'currentRevision',existing.revision,'currentStatus',existing.status);
 insert into public.workout_save_receipts(user_id,request_id,session_id,payload_hash,result_revision,result_status)
 values(owner_id,p_request_id,sid,h,existing.revision,existing.status);
 return result;
end; $$;
revoke all on function public.fitness_save_workout(jsonb,bigint,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.fitness_save_workout(jsonb,bigint,uuid,uuid,boolean) to authenticated;
commit;
