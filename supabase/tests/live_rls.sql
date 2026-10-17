-- REVIEW BEFORE RUNNING in the Supabase SQL Editor after both migrations.
-- Replace USER_A_UUID and USER_B_UUID with the IDs of TWO DISTINCT verified
-- test accounts you own (Authentication > Users). No passwords go in this file.
-- All test changes roll back. Existing data is never deleted or overwritten.
begin;
create temporary table fitness_test_context (a uuid not null, b uuid not null);
insert into fitness_test_context values ('USER_A_UUID'::uuid, 'USER_B_UUID'::uuid);
grant select on fitness_test_context to anon, authenticated;
do $$
begin
  if (select a=b from fitness_test_context) then raise exception 'Choose two distinct accounts'; end if;
  if (select count(*) from auth.users where id in (select a from fitness_test_context union select b from fitness_test_context)) <> 2 then
    raise exception 'Both test accounts must exist';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profiles','routines','routine_days','routine_exercises','workout_sessions','session_exercises','workout_sets','exercises','exercise_alternatives','evidence_sources') and (not c.relrowsecurity or not c.relforcerowsecurity)) then
    raise exception 'RLS must be enabled and forced';
  end if;
end;
$$;

-- Temporary fixtures use reserved IDs; a collision aborts instead of overwriting.
insert into public.routines(id,user_id,name,goal)
select 'f1700000-0000-4000-8000-000000000001'::uuid,a,'RLS temporary A','strength' from fitness_test_context
union all select 'f1700000-0000-4000-8000-000000000002'::uuid,b,'RLS temporary B','strength' from fitness_test_context;
insert into public.routine_days(id,user_id,routine_id,name,position)
select id,user_id,id,'Temporary day',0 from public.routines where id in ('f1700000-0000-4000-8000-000000000001','f1700000-0000-4000-8000-000000000002');
insert into public.routine_exercises(id,user_id,routine_day_id,exercise_id,position,target_sets,rep_min,rep_max,rest_seconds)
select id,user_id,id,'20000000-0000-4000-8000-000000000001',0,2,8,12,120 from public.routine_days where id in ('f1700000-0000-4000-8000-000000000001','f1700000-0000-4000-8000-000000000002');
insert into public.workout_sessions(id,user_id,routine_id,routine_day_id)
select id,user_id,id,id from public.routine_days where id in ('f1700000-0000-4000-8000-000000000001','f1700000-0000-4000-8000-000000000002');
insert into public.session_exercises(id,user_id,session_id,exercise_id,exercise_name_snapshot,loading_mode_snapshot,position)
select id,user_id,id,'20000000-0000-4000-8000-000000000001','Bodyweight squat','bodyweight',0 from public.workout_sessions where id in ('f1700000-0000-4000-8000-000000000001','f1700000-0000-4000-8000-000000000002');
insert into public.workout_sets(id,user_id,session_exercise_id,set_number,reps)
select id,user_id,id,1,8 from public.session_exercises where id in ('f1700000-0000-4000-8000-000000000001','f1700000-0000-4000-8000-000000000002');

-- Run with the API client's role, not the SQL Editor's administrator role.
set local role authenticated;
select set_config('request.jwt.claim.sub', a::text, true), set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true) from fitness_test_context;
do $$
declare t text; n integer; target uuid; own uuid;
begin
  select b,a into target,own from fitness_test_context;
  -- Saving a profile is tested inside this rolled-back transaction.
  insert into public.profiles(user_id,display_name) values (own,'Temporary RLS test')
    on conflict (user_id) do update set display_name=excluded.display_name;
  if not exists (select 1 from public.profiles where user_id=own and display_name='Temporary RLS test') then raise exception 'Own profile did not persist'; end if;
  foreach t in array array['profiles','routines','routine_days','routine_exercises','workout_sessions','session_exercises','workout_sets'] loop
    execute format('select count(*) from public.%I where user_id=$1',t) into n using target;
    if n<>0 then raise exception 'Cross-account read failed: %',t; end if;
    execute format('update public.%I set user_id=user_id where user_id=$1',t) using target;
    get diagnostics n = row_count;
    if n<>0 then raise exception 'Cross-account update failed: %',t; end if;
    execute format('delete from public.%I where user_id=$1',t) using target;
    get diagnostics n = row_count;
    if n<>0 then raise exception 'Cross-account delete failed: %',t; end if;
    begin
      execute format('update public.%I set user_id=$1 where user_id=$2',t) using target,own;
      raise exception 'Ownership change was allowed: %',t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    insert into public.routines(user_id,name,goal) values (target,'Forged owner','strength');
    raise exception 'Forged owner insert was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.routine_days(user_id,routine_id,name,position) values (own,'f1700000-0000-4000-8000-000000000002','Forged parent',999);
    raise exception 'Foreign parent was allowed';
  exception when foreign_key_violation then null;
  end;
  foreach t in array array['exercises','exercise_alternatives','evidence_sources'] loop
    execute format('select count(*) from public.%I',t) into n;
    if n=0 then raise exception 'Missing reference seed: %',t; end if;
    begin
      execute format('delete from public.%I where false',t);
      raise exception 'Reference write permission was allowed: %',t;
    exception when insufficient_privilege then null;
    end;
  end loop;
end;
$$;

-- Reverse the direction to prove account B cannot read A's data either.
select set_config('request.jwt.claim.sub', b::text, true), set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true) from fitness_test_context;
do $$
declare t text; n integer; target uuid;
begin
  select a into target from fitness_test_context;
  foreach t in array array['profiles','routines','routine_days','routine_exercises','workout_sessions','session_exercises','workout_sets'] loop
    execute format('select count(*) from public.%I where user_id=$1',t) into n using target;
    if n<>0 then raise exception 'Reverse cross-account read failed: %',t; end if;
  end loop;
end;
$$;

set local role anon;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
do $$
declare t text;
begin
  foreach t in array array['profiles','routines','routine_days','routine_exercises','workout_sessions','session_exercises','workout_sets'] loop
    begin
      execute format('select * from public.%I limit 1',t);
      raise exception 'Anonymous access was allowed: %',t;
    exception when insufficient_privilege then null;
    end;
  end loop;
end;
$$;
reset role;
rollback;
select 'PASS: live RLS checks passed; all fixture changes rolled back.' as result;
