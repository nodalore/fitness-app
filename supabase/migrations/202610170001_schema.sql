-- REVIEW BEFORE RUNNING. New/empty Fitness App project only.
-- Atomic migration: any failure rolls back every change in this file.
begin;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  display_name text not null default '' check (char_length(display_name) <= 80),
  goal text not null default 'general_fitness' check (goal in ('general_fitness','strength','muscle_growth')),
  experience text not null default 'beginner' check (experience in ('beginner','intermediate','advanced')),
  available_weekdays integer[] not null default '{1,3}' check (available_weekdays <@ array[0,1,2,3,4,5,6] and cardinality(available_weekdays) between 1 and 7 and array_position(available_weekdays, null) is null),
  timeline_weeks integer not null default 8 check (timeline_weeks between 1 and 52),
  equipment text[] not null default '{bodyweight}' check (equipment <@ array['bodyweight','dumbbell','barbell','machine','band'] and cardinality(equipment) between 1 and 5 and array_position(equipment, null) is null),
  display_unit text not null default 'kg' check (display_unit in ('kg','lb')),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 100),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.evidence_sources (
  id uuid primary key default gen_random_uuid(),
  organization text not null,
  title text not null,
  publication_year integer not null,
  url text not null check (url like 'https://%'),
  accessed_on date not null,
  supported_guidance text not null,
  limitations text not null
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  movement_pattern text not null,
  primary_muscles text[] not null,
  secondary_muscles text[] not null default '{}',
  equipment text[] not null,
  loading_mode text not null check (loading_mode in ('external','per_implement','bodyweight')),
  technique_notes text not null default '',
  default_rest_min_seconds integer not null check (default_rest_min_seconds > 0),
  default_rest_max_seconds integer not null check (default_rest_max_seconds >= default_rest_min_seconds),
  evidence_source_ids uuid[] not null default '{}',
  deprecated_at timestamptz
);

create table public.exercise_alternatives (
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  alternative_exercise_id uuid not null references public.exercises(id) on delete restrict,
  similarities text not null,
  differences text not null,
  suitability_notes text not null,
  source_ids uuid[] not null default '{}',
  primary key (exercise_id, alternative_exercise_id),
  check (exercise_id <> alternative_exercise_id)
);

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  goal text not null check (goal in ('general_fitness','strength','muscle_growth')),
  origin_template_key text,
  recommendation_version text,
  assumptions jsonb not null default '{}' check (jsonb_typeof(assumptions) = 'object'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.routine_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 100),
  weekday integer check (weekday between 0 and 6),
  position integer not null check (position >= 0),
  foreign key (user_id, routine_id) references public.routines(user_id, id) on delete cascade,
  unique (user_id, id),
  unique (user_id, routine_id, id),
  unique (routine_id, position)
);

create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_day_id uuid not null,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position integer not null check (position >= 0),
  target_sets integer not null check (target_sets > 0),
  rep_min integer not null check (rep_min > 0),
  rep_max integer not null check (rep_max >= rep_min),
  rest_seconds integer not null check (rest_seconds > 0),
  notes text not null default '' check (char_length(notes) <= 2000),
  foreign key (user_id, routine_day_id) references public.routine_days(user_id, id) on delete cascade,
  unique (user_id, id),
  unique (routine_day_id, position)
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid,
  routine_day_id uuid,
  routine_name_snapshot text not null default '',
  day_name_snapshot text not null default '',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'draft' check (status in ('draft','completed')),
  notes text not null default '' check (char_length(notes) <= 4000),
  client_request_id uuid not null default gen_random_uuid(),
  foreign key (user_id, routine_id) references public.routines(user_id, id) on delete no action,
  foreign key (user_id, routine_id, routine_day_id) references public.routine_days(user_id, routine_id, id) on delete no action,
  check (routine_day_id is null or routine_id is not null),
  check ((status = 'completed' and completed_at is not null and completed_at >= started_at) or (status = 'draft' and completed_at is null)),
  unique (user_id, id),
  unique (user_id, client_request_id)
);

create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  exercise_name_snapshot text not null,
  loading_mode_snapshot text not null check (loading_mode_snapshot in ('external','per_implement','bodyweight')),
  position integer not null check (position >= 0),
  target_snapshot jsonb not null default '{}' check (jsonb_typeof(target_snapshot) = 'object'),
  notes text not null default '' check (char_length(notes) <= 2000),
  foreign key (user_id, session_id) references public.workout_sessions(user_id, id) on delete cascade,
  unique (user_id, id),
  unique (session_id, position)
);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_exercise_id uuid not null,
  set_number integer not null check (set_number > 0),
  reps integer not null check (reps > 0),
  load_kg numeric(10,4) check (load_kg >= 0),
  entered_unit text not null default 'kg' check (entered_unit in ('kg','lb')),
  set_type text not null default 'working' check (set_type in ('warmup','working')),
  completed boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 2000),
  foreign key (user_id, session_exercise_id) references public.session_exercises(user_id, id) on delete cascade,
  unique (user_id, id),
  unique (session_exercise_id, set_number)
);

-- Keep updated_at honest without privileged execution.
create function public.fitness_touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.fitness_touch_updated_at() from public, anon, authenticated;
create trigger profiles_updated before update on public.profiles for each row execute function public.fitness_touch_updated_at();
create trigger routines_updated before update on public.routines for each row execute function public.fitness_touch_updated_at();

-- Default-deny with explicit grants. Both row visibility and new ownership checked.
do $$
declare t text;
begin
  foreach t in array array['profiles','routines','routine_days','routine_exercises','workout_sessions','session_exercises','workout_sets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy owner_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
  foreach t in array array['evidence_sources','exercises','exercise_alternatives'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy catalog_read on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end;
$$;

grant usage on schema public to anon, authenticated;
create index routine_days_owner_parent on public.routine_days(user_id, routine_id);
create index routine_exercises_owner_parent on public.routine_exercises(user_id, routine_day_id);
create index routine_exercises_exercise on public.routine_exercises(exercise_id);
create index workout_sessions_history on public.workout_sessions(user_id, completed_at desc);
create index workout_sessions_day on public.workout_sessions(user_id, routine_id, routine_day_id);
create index session_exercises_owner_parent on public.session_exercises(user_id, session_id);
create index session_exercises_exercise on public.session_exercises(exercise_id);
create index workout_sets_owner_parent on public.workout_sets(user_id, session_exercise_id);
create index alternatives_reverse on public.exercise_alternatives(alternative_exercise_id);

-- No recommendation/workout RPCs yet: those belong to Stages 3 and 4.
-- Existing sessions prevent deleting their routine/day; archive instead.
commit;
