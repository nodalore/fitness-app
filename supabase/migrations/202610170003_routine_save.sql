-- REVIEW ONLY until approved. Does not alter tables, RLS policies, or existing data.
-- Adds one authenticated, caller-privilege RPC for atomic three-table saves.
begin;
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
  day_position integer := 0;
  item_position integer;
  metadata jsonb;
  payload_hash text;
  found_existing boolean;
begin
  if owner_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_id is null or p_request_id is null or p_document is null or jsonb_typeof(p_document) <> 'object' then
    raise exception 'Invalid routine document' using errcode='22023';
  end if;
  if jsonb_typeof(p_document->'days') is distinct from 'array' or jsonb_array_length(p_document->'days') not between 1 and 7 then
    raise exception 'Include 1 to 7 days' using errcode='22023';
  end if;
  if coalesce(jsonb_typeof(p_document->'assumptions'), 'object') <> 'object' then
    raise exception 'Invalid assumptions' using errcode='22023';
  end if;
  -- Serialize saves for this account to make retry tokens reliable under concurrency.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  payload_hash := md5(p_document::text || p_id::text);
  select * into prior from public.routines where user_id=owner_id and assumptions->>'_save_request_id'=p_request_id::text limit 1;
  if found then
    if prior.assumptions->>'_save_payload_hash' is distinct from payload_hash then
      raise exception 'Retry token reused with a different document' using errcode='22023';
    end if;
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
      -- Retain referenced day IDs and snapshots by keeping the old version intact.
      update public.routines set archived_at=now() where id=p_id and user_id=owner_id;
      result_id := gen_random_uuid();
      found_existing := false;
    end if;
  elsif p_expected_updated_at is not null then
    raise exception 'Routine unavailable' using errcode='42501';
  end if;
  metadata := coalesce(p_document->'assumptions','{}'::jsonb) || jsonb_build_object('_save_request_id',p_request_id,'_save_payload_hash',payload_hash);
  if found_existing then
    update public.routines set name=trim(p_document->>'name'), goal=p_document->>'goal',
      origin_template_key=p_document->>'origin_template_key', recommendation_version=p_document->>'recommendation_version', assumptions=metadata
      where id=result_id and user_id=owner_id;
    delete from public.routine_days where routine_id=result_id and user_id=owner_id;
  else
    insert into public.routines(id,user_id,name,goal,origin_template_key,recommendation_version,assumptions)
    values (result_id,owner_id,trim(p_document->>'name'),p_document->>'goal',p_document->>'origin_template_key',p_document->>'recommendation_version',metadata);
  end if;
  for day_json in select value from jsonb_array_elements(p_document->'days') loop
    if jsonb_typeof(day_json) <> 'object' or jsonb_typeof(day_json->'exercises') is distinct from 'array'
      or jsonb_array_length(day_json->'exercises') not between 1 and 20 then
      raise exception 'Include 1 to 20 exercises per day' using errcode='22023';
    end if;
    new_day_id := gen_random_uuid();
    insert into public.routine_days(id,user_id,routine_id,name,weekday,position)
    values (new_day_id,owner_id,result_id,trim(day_json->>'name'),(day_json->>'weekday')::integer,day_position);
    day_position := day_position + 1;
    item_position := 0;
    for item_json in select value from jsonb_array_elements(day_json->'exercises') loop
      if not exists (select 1 from public.exercises where id=(item_json->>'exercise_id')::uuid and deprecated_at is null) then
        raise exception 'Choose an available exercise' using errcode='22023';
      end if;
      if (item_json->>'target_sets')::numeric not between 1 and 10
        or (item_json->>'target_sets')::numeric <> trunc((item_json->>'target_sets')::numeric)
        or (item_json->>'rep_min')::numeric not between 1 and 100
        or (item_json->>'rep_min')::numeric <> trunc((item_json->>'rep_min')::numeric)
        or (item_json->>'rep_max')::numeric not between 1 and 100
        or (item_json->>'rep_max')::numeric <> trunc((item_json->>'rep_max')::numeric)
        or (item_json->>'rest_seconds')::numeric not between 1 and 900
        or (item_json->>'rest_seconds')::numeric <> trunc((item_json->>'rest_seconds')::numeric) then
        raise exception 'Invalid sets, reps, or rest range' using errcode='22023';
      end if;
      insert into public.routine_exercises(user_id,routine_day_id,exercise_id,position,target_sets,rep_min,rep_max,rest_seconds,notes)
      values (owner_id,new_day_id,(item_json->>'exercise_id')::uuid,item_position,(item_json->>'target_sets')::integer,
        (item_json->>'rep_min')::integer,(item_json->>'rep_max')::integer,(item_json->>'rest_seconds')::integer,coalesce(item_json->>'notes',''));
      item_position := item_position + 1;
    end loop;
  end loop;
  return result_id;
end;
$$;
revoke all on function public.fitness_save_routine(uuid,jsonb,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.fitness_save_routine(uuid,jsonb,uuid,timestamptz) to authenticated;
commit;
