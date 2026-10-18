-- Locally reviewed/tested forward migration after installed 001–006.
-- APPLY ONCE ONLY after separate explicit hosted approval; not applied by local tests.
-- Keeps the installed v1 RPC and all performed-workout tables unchanged.
begin;
alter table public.routine_exercises
  alter column exercise_id drop not null,
  alter column target_sets drop not null,
  alter column rep_min drop not null,
  alter column rep_max drop not null,
  alter column rest_seconds drop not null,
  add column custom_exercise_name text,
  add column planning_mode text not null default 'legacy',
  add constraint routine_exercise_source check (
    (exercise_id is not null and custom_exercise_name is null)
    or (exercise_id is null and custom_exercise_name is not null
      and char_length(trim(custom_exercise_name)) between 1 and 100
      and custom_exercise_name ~ '[^[:space:]]')),
  add constraint routine_exercise_mode check (
    (planning_mode='legacy' and exercise_id is not null and target_sets is not null
      and rep_min is not null and rep_max is not null and rest_seconds is not null)
    or (planning_mode='per_set' and target_sets is null and rep_min is null and rep_max is null and rest_seconds is null));
create table public.routine_planned_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_exercise_id uuid not null,
  position integer not null check(position between 0 and 9),
  reps integer check(reps between 1 and 100),
  load_kg numeric check(load_kg between 0 and 10000),
  entered_unit text not null check(entered_unit in ('kg','lb')),
  foreign key(user_id,routine_exercise_id) references public.routine_exercises(user_id,id) on delete cascade,
  unique(routine_exercise_id,position)
);
create index routine_planned_sets_owner on public.routine_planned_sets(user_id);
alter table public.routine_planned_sets enable row level security;
alter table public.routine_planned_sets force row level security;
revoke all on public.routine_planned_sets from public,anon,authenticated;
grant select,insert,update,delete on public.routine_planned_sets to authenticated;
create policy planned_sets_read on public.routine_planned_sets for select to authenticated using(auth.uid()=user_id);
create policy planned_sets_insert on public.routine_planned_sets for insert to authenticated with check(auth.uid()=user_id);
create policy planned_sets_update on public.routine_planned_sets for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy planned_sets_delete on public.routine_planned_sets for delete to authenticated using(auth.uid()=user_id);
-- Ensure direct writes cannot attach target rows to a legacy prescription.
create function public.fitness_check_planned_parent() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  -- Serialize with parent mode changes. A foreign key key-share lock alone
  -- does not conflict with a non-key planning_mode update.
  perform 1 from public.routine_exercises where user_id=auth.uid() and user_id=new.user_id
    and id=new.routine_exercise_id and planning_mode='per_set' for update;
  if not found then
    raise exception 'Invalid planned-set parent' using errcode='23514';
  end if;
  return new;
end; $$;
revoke all on function public.fitness_check_planned_parent() from public,anon,authenticated;
create trigger fitness_planned_parent before insert or update on public.routine_planned_sets
for each row execute function public.fitness_check_planned_parent();
create function public.fitness_check_planning_mode() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.planning_mode='legacy' and exists(select 1 from public.routine_planned_sets
    where user_id=new.user_id and routine_exercise_id=new.id) then
    raise exception 'Remove planned targets before changing planning mode' using errcode='23514';
  end if;
  return new;
end; $$;
revoke all on function public.fitness_check_planning_mode() from public,anon,authenticated;
create trigger fitness_planning_mode before update on public.routine_exercises
for each row execute function public.fitness_check_planning_mode();
create function public.fitness_save_routine_v2(
  p_id uuid,
  p_document jsonb,
  p_request_id uuid,
  p_expected_updated_at timestamptz default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  existing public.routines%rowtype;
  prior public.routines%rowtype;
  result_id uuid := p_id;
  new_day_id uuid;
  day_json jsonb;
  item_json jsonb;
  set_json jsonb;
  new_exercise_id uuid;
  set_position integer;
  mode text;
  field_name text;
  field_value numeric;
  day_position integer := 0;
  item_position integer;
  clean_document jsonb;
  metadata jsonb;
  receipts jsonb := '{}'::jsonb;
  payload_hash text;
  found_existing boolean;
begin
  if owner_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_id is null or p_request_id is null or p_document is null
     or jsonb_typeof(p_document) is distinct from 'object' then
    raise exception 'Invalid routine document' using errcode='22023';
  end if;
  if octet_length(p_document::text) > 2097152 then
    raise exception 'Routine document exceeds 2 MiB' using errcode='22023';
  end if;
  if p_expected_updated_at is not null and not isfinite(p_expected_updated_at) then
    raise exception 'Invalid edit timestamp' using errcode='22023';
  end if;
  if jsonb_typeof(p_document->'assumptions') is distinct from 'object' and p_document ? 'assumptions' then
    raise exception 'Invalid assumptions' using errcode='22023';
  end if;
  -- Never trust retry bookkeeping echoed or invented by a browser.
  clean_document := jsonb_set(p_document, '{assumptions}',
    coalesce(p_document->'assumptions', '{}'::jsonb) - array['_save_request_id','_save_payload_hash','_save_receipts']);
  if clean_document - array['name','goal','origin_template_key','recommendation_version','assumptions','days'] <> '{}'::jsonb then
    raise exception 'Unknown routine fields' using errcode='22023';
  end if;
  if jsonb_typeof(clean_document->'name') is distinct from 'string'
     or char_length(trim(clean_document->>'name')) not between 1 and 100
     or not (clean_document->>'name' ~ '[^[:space:]]') then
    raise exception 'Routine name must be text of 1 to 100 characters' using errcode='22023';
  end if;
  if jsonb_typeof(clean_document->'goal') is distinct from 'string'
     or clean_document->>'goal' not in ('general_fitness','strength','muscle_growth') then
    raise exception 'Invalid routine goal' using errcode='22023';
  end if;
  foreach field_name in array array['origin_template_key','recommendation_version'] loop
    if clean_document ? field_name and jsonb_typeof(clean_document->field_name) <> 'null' then
      if jsonb_typeof(clean_document->field_name) is distinct from 'string'
         or char_length(clean_document->>field_name) > 100 then
        raise exception 'Invalid routine metadata' using errcode='22023';
      end if;
    end if;
  end loop;
  if jsonb_typeof(clean_document->'days') is distinct from 'array' then
    raise exception 'Days must be an array' using errcode='22023';
  end if;
  if jsonb_array_length(clean_document->'days') not between 1 and 7 then
    raise exception 'Include 1 to 7 days' using errcode='22023';
  end if;

  -- Validate shape and scalar types before acquiring locks or changing records.
  -- Catalog availability is checked after retry lookup: an old successful request
  -- must still be acknowledged if an exercise was subsequently deprecated.
  for day_json in select value from jsonb_array_elements(clean_document->'days') loop
    if jsonb_typeof(day_json) is distinct from 'object' then
      raise exception 'Invalid workout day' using errcode='22023';
    end if;
    if day_json - array['name','weekday','exercises'] <> '{}'::jsonb then
      raise exception 'Unknown workout day fields' using errcode='22023';
    end if;
    if jsonb_typeof(day_json->'name') is distinct from 'string'
       or char_length(trim(day_json->>'name')) not between 1 and 100
       or not (day_json->>'name' ~ '[^[:space:]]') then
      raise exception 'Workout name must be text of 1 to 100 characters' using errcode='22023';
    end if;
    if day_json ? 'weekday' and jsonb_typeof(day_json->'weekday') <> 'null' then
      if jsonb_typeof(day_json->'weekday') is distinct from 'number' then
        raise exception 'Weekday must be an integer from 0 to 6 or null' using errcode='22023';
      end if;
      field_value := (day_json->>'weekday')::numeric;
      if field_value <> trunc(field_value) or field_value not between 0 and 6 then
        raise exception 'Weekday must be an integer from 0 to 6 or null' using errcode='22023';
      end if;
    end if;
    if jsonb_typeof(day_json->'exercises') is distinct from 'array' then
      raise exception 'Exercises must be an array' using errcode='22023';
    end if;
    if jsonb_array_length(day_json->'exercises') not between 1 and 20 then
      raise exception 'Include 1 to 20 exercises per day' using errcode='22023';
    end if;
    for item_json in select value from jsonb_array_elements(day_json->'exercises') loop
      if jsonb_typeof(item_json) is distinct from 'object' then
        raise exception 'Invalid exercise prescription' using errcode='22023';
      end if;
      if item_json - array['exercise_id','custom_exercise_name','planning_mode','planned_sets','target_sets','rep_min','rep_max','rest_seconds','notes'] <> '{}'::jsonb then
        raise exception 'Unknown prescription fields' using errcode='22023';
      end if;
      mode := coalesce(item_json->>'planning_mode','legacy');
      if mode not in ('legacy','per_set') or (item_json ? 'planning_mode' and jsonb_typeof(item_json->'planning_mode') <> 'string') then
        raise exception 'Invalid planning mode' using errcode='22023';
      end if;
      if jsonb_typeof(item_json->'exercise_id') = 'string' then
        begin
          perform (item_json->>'exercise_id')::uuid;
        exception when invalid_text_representation then
          raise exception 'Invalid exercise ID' using errcode='22023';
        end;
        if item_json ? 'custom_exercise_name' and item_json->'custom_exercise_name' <> 'null'::jsonb then
          raise exception 'Choose one exercise source' using errcode='22023';
        end if;
      elsif mode = 'per_set' and (not (item_json ? 'exercise_id') or item_json->'exercise_id' = 'null'::jsonb) then
        if jsonb_typeof(item_json->'custom_exercise_name') is distinct from 'string'
           or char_length(trim(item_json->>'custom_exercise_name')) not between 1 and 100
           or not (item_json->>'custom_exercise_name' ~ '[^[:space:]]') then
          raise exception 'Enter an exercise name of 1 to 100 characters' using errcode='22023';
        end if;
      else
        raise exception 'Choose an exercise source' using errcode='22023';
      end if;
      if mode = 'legacy' then
        if item_json ? 'planned_sets' and item_json->'planned_sets' <> '[]'::jsonb then
          raise exception 'Legacy plans cannot contain per-set targets' using errcode='22023';
        end if;
        foreach field_name in array array['target_sets','rep_min','rep_max','rest_seconds'] loop
          if jsonb_typeof(item_json->field_name) is distinct from 'number' then
            raise exception 'Sets, reps, and rest must be JSON integers' using errcode='22023';
          end if;
          field_value := (item_json->>field_name)::numeric;
          if field_value <> trunc(field_value) or field_value < 1
             or field_value > (case field_name when 'target_sets' then 10 when 'rest_seconds' then 900 else 100 end) then
            raise exception 'Invalid sets, reps, or rest range' using errcode='22023';
          end if;
        end loop;
        if (item_json->>'rep_max')::numeric < (item_json->>'rep_min')::numeric then
          raise exception 'Invalid rep range' using errcode='22023';
        end if;
      else
        foreach field_name in array array['target_sets','rep_min','rep_max','rest_seconds'] loop
          if item_json ? field_name and item_json->field_name <> 'null'::jsonb then
            raise exception 'Per-set plans must not contain legacy targets' using errcode='22023';
          end if;
        end loop;
        if jsonb_typeof(item_json->'planned_sets') is distinct from 'array' then
          raise exception 'Planned sets must be an array' using errcode='22023';
        end if;
        if jsonb_array_length(item_json->'planned_sets') > 10 then
          raise exception 'Use at most 10 planned sets' using errcode='22023';
        end if;
        for set_json in select value from jsonb_array_elements(item_json->'planned_sets') loop
          if jsonb_typeof(set_json) is distinct from 'object'
             or set_json - array['reps','load_kg','entered_unit'] <> '{}'::jsonb then
            raise exception 'Invalid planned set fields' using errcode='22023';
          end if;
          if not (set_json ?& array['reps','load_kg','entered_unit']) then
            raise exception 'Planned set fields are required (null means unset)' using errcode='22023';
          end if;
          if set_json->'reps' <> 'null'::jsonb then
            if jsonb_typeof(set_json->'reps') is distinct from 'number' then
              raise exception 'Target reps must be an integer or null' using errcode='22023';
            end if;
            field_value := (set_json->>'reps')::numeric;
            if field_value <> trunc(field_value) or field_value not between 1 and 100 then
              raise exception 'Target reps out of range' using errcode='22023';
            end if;
          end if;
          if set_json->'load_kg' <> 'null'::jsonb then
            if jsonb_typeof(set_json->'load_kg') is distinct from 'number'
               or (set_json->>'load_kg')::numeric not between 0 and 10000 then
              raise exception 'Planned load must be 0 to 10000 kg or null' using errcode='22023';
            end if;
          end if;
          if jsonb_typeof(set_json->'entered_unit') is distinct from 'string'
             or set_json->>'entered_unit' not in ('kg','lb') then
            raise exception 'Choose kg or lb' using errcode='22023';
          end if;
        end loop;
      end if;
      if item_json ? 'notes' then
        if jsonb_typeof(item_json->'notes') is distinct from 'string' or char_length(item_json->>'notes') > 2000 then
          raise exception 'Notes must be text of at most 2000 characters' using errcode='22023';
        end if;
      end if;
    end loop;
  end loop;

  -- READ COMMITTED (PostgREST default): statements after this lock see the previous
  -- holder's committed changes. Stronger isolation must retry serialization errors.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  payload_hash := encode(sha256(convert_to(jsonb_build_object(
    'api_version', 2, 'routine_id', p_id, 'document', clean_document,
    'expected_updated_at_epoch', extract(epoch from p_expected_updated_at)
  )::text, 'UTF8')), 'hex');
  select * into prior from public.routines where user_id=owner_id
    and jsonb_typeof(assumptions->'_save_receipts')='object'
    and assumptions->'_save_receipts' ? p_request_id::text limit 1;
  if found then
    if prior.assumptions->'_save_receipts'->>p_request_id::text is distinct from payload_hash then
      raise exception 'Retry token reused with a different document or edit version' using errcode='22023';
    end if;
    -- Acknowledges the original success; never overwrites later edits or unarchives.
    return prior.id;
  end if;

  select * into existing from public.routines where id=p_id and user_id=owner_id for update;
  found_existing := found;
  if found_existing then
    if existing.archived_at is not null then raise exception 'Archived routines cannot be edited' using errcode='22023'; end if;
    if p_expected_updated_at is null or existing.updated_at <> p_expected_updated_at then
      raise exception 'Routine changed; reload before saving' using errcode='40001';
    end if;
    if exists (select 1 from public.workout_sessions where user_id=owner_id and routine_id=p_id) then
      -- Keep every referenced day, exercise prescription, and snapshot intact.
      update public.routines set archived_at=clock_timestamp() where id=p_id and user_id=owner_id;
      result_id := gen_random_uuid();
      found_existing := false;
    elsif jsonb_typeof(existing.assumptions->'_save_receipts')='object' then
      receipts := existing.assumptions->'_save_receipts';
    end if;
  elsif p_expected_updated_at is not null then
    raise exception 'Routine unavailable' using errcode='42501';
  end if;
  receipts := receipts || jsonb_build_object(p_request_id::text, payload_hash);
  metadata := clean_document->'assumptions' || jsonb_build_object('_save_receipts', receipts);
  if found_existing then
    update public.routines set name=trim(clean_document->>'name'), goal=clean_document->>'goal',
      origin_template_key=clean_document->>'origin_template_key', recommendation_version=clean_document->>'recommendation_version', assumptions=metadata
      where id=result_id and user_id=owner_id;
    delete from public.routine_days where routine_id=result_id and user_id=owner_id;
  else
    insert into public.routines(id,user_id,name,goal,origin_template_key,recommendation_version,assumptions)
    values (result_id,owner_id,trim(clean_document->>'name'),clean_document->>'goal',clean_document->>'origin_template_key',clean_document->>'recommendation_version',metadata);
  end if;
  for day_json in select value from jsonb_array_elements(clean_document->'days') loop
    new_day_id := gen_random_uuid();
    insert into public.routine_days(id,user_id,routine_id,name,weekday,position)
    values (new_day_id,owner_id,result_id,trim(day_json->>'name'),((day_json->>'weekday')::numeric)::integer,day_position);
    day_position := day_position + 1;
    item_position := 0;
    for item_json in select value from jsonb_array_elements(day_json->'exercises') loop
      -- Check current availability for new writes after waiting for the lock.
      if item_json->>'exercise_id' is not null and not exists (select 1 from public.exercises where id=(item_json->>'exercise_id')::uuid and deprecated_at is null) then
        raise exception 'Choose an available exercise' using errcode='22023';
      end if;
      new_exercise_id := gen_random_uuid();
      insert into public.routine_exercises(id,user_id,routine_day_id,exercise_id,custom_exercise_name,planning_mode,position,target_sets,rep_min,rep_max,rest_seconds,notes)
      values (new_exercise_id,owner_id,new_day_id,(item_json->>'exercise_id')::uuid,
        trim(item_json->>'custom_exercise_name'),coalesce(item_json->>'planning_mode','legacy'),item_position,
        ((item_json->>'target_sets')::numeric)::integer,((item_json->>'rep_min')::numeric)::integer,
        ((item_json->>'rep_max')::numeric)::integer,((item_json->>'rest_seconds')::numeric)::integer,coalesce(item_json->>'notes',''));
      set_position := 0;
      for set_json in select value from jsonb_array_elements(coalesce(item_json->'planned_sets','[]'::jsonb)) loop
        insert into public.routine_planned_sets(user_id,routine_exercise_id,position,reps,load_kg,entered_unit)
        values(owner_id,new_exercise_id,set_position,((set_json->>'reps')::numeric)::integer,(set_json->>'load_kg')::numeric,set_json->>'entered_unit');
        set_position := set_position + 1;
      end loop;
      item_position := item_position + 1;
    end loop;
  end loop;
  return result_id;
end;
$$;
revoke all on function public.fitness_save_routine_v2(uuid,jsonb,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.fitness_save_routine_v2(uuid,jsonb,uuid,timestamptz) to authenticated;
commit;
