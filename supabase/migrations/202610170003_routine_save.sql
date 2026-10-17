-- FINAL REVIEW REQUIRED. Apply only after approval, after migrations 001 and 002.
-- Adds the save RPC and replaces the existing timestamp helper (no table/policy changes).
-- No existing application rows are rewritten by applying this migration.
begin;

-- now() is transaction-start time, so it cannot serve as a reliable edit token.
-- Keep profile behavior unchanged; routine tokens strictly advance on every update.
create or replace function public.fitness_touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_schema = 'public' and tg_table_name = 'routines' then
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.fitness_touch_updated_at() from public, anon, authenticated;

create function public.fitness_save_routine(
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
      if item_json - array['exercise_id','target_sets','rep_min','rep_max','rest_seconds','notes'] <> '{}'::jsonb then
        raise exception 'Unknown prescription fields' using errcode='22023';
      end if;
      if jsonb_typeof(item_json->'exercise_id') is distinct from 'string' then
        raise exception 'Choose an available exercise' using errcode='22023';
      end if;
      begin
        perform (item_json->>'exercise_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'Choose an available exercise' using errcode='22023';
      end;
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
        raise exception 'Maximum reps must be at least minimum reps' using errcode='22023';
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
    'routine_id', p_id, 'document', clean_document,
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
      if not exists (select 1 from public.exercises where id=(item_json->>'exercise_id')::uuid and deprecated_at is null) then
        raise exception 'Choose an available exercise' using errcode='22023';
      end if;
      insert into public.routine_exercises(user_id,routine_day_id,exercise_id,position,target_sets,rep_min,rep_max,rest_seconds,notes)
      values (owner_id,new_day_id,(item_json->>'exercise_id')::uuid,item_position,((item_json->>'target_sets')::numeric)::integer,
        ((item_json->>'rep_min')::numeric)::integer,((item_json->>'rep_max')::numeric)::integer,((item_json->>'rest_seconds')::numeric)::integer,coalesce(item_json->>'notes',''));
      item_position := item_position + 1;
    end loop;
  end loop;
  return result_id;
end;
$$;
revoke all on function public.fitness_save_routine(uuid,jsonb,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.fitness_save_routine(uuid,jsonb,uuid,timestamptz) to authenticated;
commit;
