// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, describe, expect, test } from 'vitest'

let db: PGlite
const A = 'a0000000-0000-4000-8000-000000000001'
const B = 'b0000000-0000-4000-8000-000000000001'
const C = 'c0000000-0000-4000-8000-000000000001'
const exercise = '20000000-0000-4000-8000-000000000001'
const tables = ['profiles', 'routines', 'routine_days', 'routine_exercises', 'workout_sessions', 'session_exercises', 'workout_sets']
const fixtures: Record<string, Record<string, unknown>> = {
  profiles: { user_id: A, display_name: 'Private A' },
  routines: { id: A, user_id: A, name: 'Private routine', goal: 'strength' },
  routine_days: { id: A, user_id: A, routine_id: A, name: 'Day', position: 0 },
  routine_exercises: { id: A, user_id: A, routine_day_id: A, exercise_id: exercise, position: 0, target_sets: 2, rep_min: 8, rep_max: 12, rest_seconds: 120 },
  workout_sessions: { id: A, user_id: A, routine_id: A, routine_day_id: A },
  session_exercises: { id: A, user_id: A, session_id: A, exercise_id: exercise, exercise_name_snapshot: 'Squat', loading_mode_snapshot: 'bodyweight', position: 0 },
  workout_sets: { id: A, user_id: A, session_exercise_id: A, set_number: 1, reps: 8 },
}
function fixture(table: string, owner: string) {
  return Object.fromEntries(Object.entries(fixtures[table]).map(([key, value]) => [key, value === A ? owner : value]))
}
async function insert(table: string, record: Record<string, unknown>) {
  const keys = Object.keys(record)
  return db.query(`insert into public.${table} (${keys.join(',')}) values (${keys.map((_, index) => `$${index + 1}`).join(',')}) returning *`, Object.values(record))
}
async function asUser<T>(user: string | null, action: () => Promise<T>): Promise<T> {
  await db.exec('begin')
  try {
    await db.exec(`set local role ${user ? 'authenticated' : 'anon'}`)
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user ?? ''])
    return await action()
  } finally { await db.exec('rollback') }
}
beforeAll(async () => {
  db = new PGlite()
  // Supabase supplies these roles and auth objects. Locally emulate just identity.
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;`)
  await db.query('insert into auth.users values ($1),($2),($3)', [A, B, C])
  for (const file of ['202610170001_schema.sql', '202610170002_reference_seed.sql']) {
    await db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  }
  for (const table of tables) for (const owner of [A, B]) await insert(table, fixture(table, owner))
}, 30000)
afterAll(async () => { await db?.close() })

test('every application table has RLS enabled and forced', async () => {
  const { rows } = await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>("select relrowsecurity,relforcerowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relkind='r'")
  expect(rows).toHaveLength(10)
  expect(rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true)
})

describe.each(tables)('%s ownership policies', table => {
  test('anonymous reads and writes are denied', async () => {
    await expect(asUser(null, () => db.query(`select * from public.${table}`))).rejects.toThrow(/permission denied/)
    await expect(asUser(null, () => insert(table, fixture(table, C)))).rejects.toThrow(/permission denied/)
  })
  test('users read only their own rows', async () => {
    for (const owner of [A, B]) {
      const { rows } = await asUser(owner, () => db.query<{ user_id: string }>(`select * from public.${table}`))
      expect(rows).toHaveLength(1)
      expect(rows[0].user_id).toBe(owner)
    }
  })
  test('users may create their own records', async () => {
    await asUser(C, async () => {
      // Parent chain is required even within a rolled-back test transaction.
      for (const parent of tables.slice(0, tables.indexOf(table))) await insert(parent, fixture(parent, C))
      expect((await insert(table, fixture(table, C))).rows).toHaveLength(1)
    })
  })
  test('forged ownership insert and ownership change are denied', async () => {
    await expect(asUser(A, () => insert(table, fixture(table, C)))).rejects.toThrow(/row-level security/)
    await expect(asUser(A, () => db.query(`update public.${table} set user_id=$1 where user_id=$2`, [C, A]))).rejects.toThrow(/row-level security/)
  })
  test('users cannot update or delete the other account’s rows', async () => {
    const update = await asUser(A, () => db.query(`update public.${table} set user_id=user_id where user_id=$1 returning *`, [B]))
    const deletion = await asUser(A, () => db.query(`delete from public.${table} where user_id=$1 returning *`, [B]))
    expect(update.rows).toHaveLength(0)
    expect(deletion.rows).toHaveLength(0)
  })
  test('users can update their own records', async () => {
    expect((await asUser(A, () => db.query(`update public.${table} set user_id=user_id where user_id=$1 returning *`, [A]))).rows).toHaveLength(1)
  })
})

test.each([
  ['routine_days', 'routine_id'], ['routine_exercises', 'routine_day_id'],
  ['workout_sessions', 'routine_id'], ['session_exercises', 'session_id'], ['workout_sets', 'session_exercise_id'],
])('%s cannot attach to another user’s parent', async (table, parent) => {
  await expect(asUser(A, () => db.query(`update public.${table} set ${parent}=$1${table === 'workout_sets' ? ', set_number=99' : table === 'workout_sessions' ? '' : ', position=99'} where user_id=$2`, [B, A]))).rejects.toThrow(/foreign key/)
})

test('a day from the wrong routine is rejected even for the same owner', async () => {
  await asUser(A, async () => {
    await insert('routines', { id: C, user_id: A, name: 'Other routine', goal: 'strength' })
    await expect(db.query('update public.workout_sessions set routine_id=$1 where user_id=$2', [C, A])).rejects.toThrow(/foreign key/)
  })
})

test('session-linked routines cannot be deleted, while profile deletion is allowed', async () => {
  await expect(asUser(A, () => db.query('delete from public.routines where user_id=$1', [A]))).rejects.toThrow(/foreign key/)
  expect((await asUser(A, () => db.query('delete from public.profiles where user_id=$1 returning *', [A]))).rows).toHaveLength(1)
})

test('deleting own session cascades to exercises and sets, preserving the other account', async () => {
  await asUser(A, async () => {
    await db.query('delete from public.workout_sessions where user_id=$1', [A])
    expect((await db.query('select * from public.session_exercises')).rows).toHaveLength(0)
    expect((await db.query('select * from public.workout_sets')).rows).toHaveLength(0)
  })
  expect((await asUser(B, () => db.query('select * from public.workout_sets'))).rows).toHaveLength(1)
})

test('account deletion cascades every owned table', async () => {
  await db.exec('begin')
  try {
    await db.query('delete from auth.users where id=$1', [A])
    for (const table of tables) {
      expect((await db.query(`select * from public.${table} where user_id=$1`, [A])).rows).toHaveLength(0)
      expect((await db.query(`select * from public.${table} where user_id=$1`, [B])).rows).toHaveLength(1)
    }
  } finally { await db.exec('rollback') }
})

test.each(['evidence_sources', 'exercises', 'exercise_alternatives'])('%s is readable but not writable by client roles', async table => {
  for (const role of [null, A]) {
    expect((await asUser(role, () => db.query(`select * from public.${table}`))).rows.length).toBeGreaterThan(0)
    await expect(asUser(role, () => db.query(`delete from public.${table}`))).rejects.toThrow(/permission denied/)
    await expect(asUser(role, () => db.query(`update public.${table} set ${table === 'exercise_alternatives' ? 'similarities' : table === 'exercises' ? 'name' : 'title'}='forged'`))).rejects.toThrow(/permission denied/)
  }
})

test('all 12 catalog exercises have at least one non-self alternative', async () => {
  expect((await db.query('select * from public.exercises')).rows).toHaveLength(12)
  expect((await db.query('select id from public.exercises e where not exists (select 1 from public.exercise_alternatives a where a.exercise_id=e.id and a.alternative_exercise_id<>e.id)')).rows).toHaveLength(0)
})

test.each([
  ['workout_sets', 'reps=0'], ['workout_sets', 'load_kg=-1'],
  ['routine_exercises', 'rep_max=1'], ['routine_exercises', 'rest_seconds=0'],
  ['workout_sessions', "status='completed'"], ['profiles', 'timeline_weeks=0'],
])('%s rejects invalid values: %s', async (table, update) => {
  await expect(asUser(A, () => db.query(`update public.${table} set ${update} where user_id=$1`, [A]))).rejects.toThrow(/check constraint/)
})


test('the SQL Editor verification script runs and rolls back without altering existing data', async () => {
  const sql = readFileSync(new URL('./live_rls.sql', import.meta.url), 'utf8').replaceAll('USER_A_UUID', A).replaceAll('USER_B_UUID', B)
  await db.exec(sql)
  expect((await db.query<{ display_name: string }>('select display_name from public.profiles where user_id=$1', [A])).rows[0].display_name).toBe('Private A')
  expect((await db.query('select * from public.routines')).rows).toHaveLength(2)
})
