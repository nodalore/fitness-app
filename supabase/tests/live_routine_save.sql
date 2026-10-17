-- REVIEW after approving/applying 202610170003_routine_save.sql.
-- Replace the two placeholders with distinct verified test-user UUIDs.
-- No persistent schema changes. Every temporary test write is rolled back.
begin;
create temporary table fitness_routine_context (a uuid, b uuid, routine_id uuid, request_id uuid, document jsonb);
insert into fitness_routine_context values (
  'USER_A_UUID'::uuid, 'USER_B_UUID'::uuid, gen_random_uuid(), gen_random_uuid(),
  '{"name":"Temporary RPC security test","goal":"strength","assumptions":{},"days":[{"name":"Test day","weekday":1,"exercises":[{"exercise_id":"20000000-0000-4000-8000-000000000001","target_sets":2,"rep_min":8,"rep_max":12,"rest_seconds":120,"notes":""}]}]}'::jsonb
);
grant select on fitness_routine_context to anon, authenticated;
do $$
begin
  if (select a=b from fitness_routine_context) then raise exception 'Choose distinct users'; end if;
  if (select count(*) from auth.users where id in (select a from fitness_routine_context union select b from fitness_routine_context))<>2 then raise exception 'Both test accounts must exist'; end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',a::text,true),set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true) from fitness_routine_context;
do $$
declare context record; result uuid; repeated uuid; n integer;
begin
  select * into context from fitness_routine_context;
  result := public.fitness_save_routine(context.routine_id,context.document,context.request_id,null);
  repeated := public.fitness_save_routine(context.routine_id,context.document,context.request_id,null);
  if result<>context.routine_id or repeated<>result then raise exception 'Create/retry did not return the same routine'; end if;
  select count(*) into n from public.routine_exercises e join public.routine_days d on e.routine_day_id=d.id where d.routine_id=result;
  if n<>1 then raise exception 'Prescription was not saved'; end if;
end;
$$;
select set_config('request.jwt.claim.sub',b::text,true),set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true) from fitness_routine_context;
do $$
declare context record;
begin
  select * into context from fitness_routine_context;
  if exists(select 1 from public.routines where id=context.routine_id) then raise exception 'Cross-account read allowed'; end if;
  begin
    perform public.fitness_save_routine(context.routine_id,context.document,gen_random_uuid(),now());
    raise exception 'Cross-account RPC edit allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
set local role anon;
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
do $$
declare context record;
begin
  select * into context from fitness_routine_context;
  begin
    perform public.fitness_save_routine(context.routine_id,context.document,gen_random_uuid(),null);
    raise exception 'Anonymous RPC allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
rollback;
select 'PASS: routine save/retry and RPC isolation checks passed; test writes rolled back.' as result;
