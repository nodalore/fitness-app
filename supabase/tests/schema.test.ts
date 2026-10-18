// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, describe, expect, test } from 'vitest'
import { recommendRoutines } from '../../src/features/routines/recommendations'
import { validateRoutine } from '../../src/features/routines/routineValidation'
import { defaultProfile } from '../../src/features/profile/profile'
import type { Exercise } from '../../src/features/routines/types'

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
  for (const file of ['202610170001_schema.sql', '202610170002_reference_seed.sql', '202610170003_routine_save.sql']) {
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


const document = {
  name: 'Atomic test plan', goal: 'strength', origin_template_key: null, recommendation_version: null,
  assumptions: { origin: 'custom' }, days: [{ name: 'Training day', weekday: 1, exercises: [
    { exercise_id: exercise, target_sets: 2, rep_min: 8, rep_max: 12, rest_seconds: 120, notes: 'Test prescription' },
  ] }],
}
const freshId = 'd0000000-0000-4000-8000-000000000001'
const requestId = 'e0000000-0000-4000-8000-000000000001'
async function rpc(id = freshId, value: unknown = document, request = requestId, timestamp: string | null = null) {
  const { rows } = await db.query<{ id: string }>('select public.fitness_save_routine($1,$2::jsonb,$3,$4::timestamptz) as id', [id, JSON.stringify(value), request, timestamp])
  return rows[0].id
}

test('routine RPC is caller-privilege, fixed-search-path, and unavailable anonymously', async () => {
  const { rows } = await db.query<{ prosecdef: boolean; proconfig: string[] }>("select prosecdef,proconfig from pg_proc where proname='fitness_save_routine'")
  expect(rows[0].prosecdef).toBe(false)
  expect(rows[0].proconfig).toContain('search_path=""')
  await expect(asUser(null, () => rpc())).rejects.toThrow(/permission denied/)
})

test('routine create is atomic, retry-safe, and saves days plus exercise prescriptions', async () => {
  await asUser(A, async () => {
    expect(await rpc()).toBe(freshId)
    expect(await rpc()).toBe(freshId)
    expect((await db.query('select * from public.routines where id=$1', [freshId])).rows).toHaveLength(1)
    const { rows } = await db.query<{ rep_min: number; rest_seconds: number }>('select e.* from public.routine_exercises e join public.routine_days d on d.id=e.routine_day_id where d.routine_id=$1', [freshId])
    expect(rows).toHaveLength(1)
    expect(rows[0].rep_min).toBe(8)
    expect(rows[0].rest_seconds).toBe(120)
  })
})

test('failed routine creation rolls back its parent and child writes', async () => {
  await asUser(A, async () => {
    await db.exec('savepoint failed_save')
    await expect(rpc(freshId, { ...document, days: [...document.days, { name: 'Invalid', weekday: 3, exercises: [] }] })).rejects.toThrow(/1 to 20 exercises/)
    await db.exec('rollback to savepoint failed_save')
    expect((await db.query('select * from public.routines where id=$1', [freshId])).rows).toHaveLength(0)
    expect((await db.query('select * from public.routine_days where routine_id=$1', [freshId])).rows).toHaveLength(0)
  })
})

test('cross-account routine RPC edits cannot read or modify another owner’s plan', async () => {
  const stamp = (await db.query<{ updated_at: string }>('select updated_at::text from public.routines where id=$1', [B])).rows[0].updated_at
  await expect(asUser(A, () => rpc(B, document, requestId, stamp))).rejects.toThrow(/Routine unavailable/)
  expect((await db.query<{ name: string }>('select name from public.routines where id=$1', [B])).rows[0].name).toBe('Private routine')
})

test('stale routine edits are rejected', async () => {
  await expect(asUser(A, () => rpc(A, document, requestId, '2000-01-01T00:00:00Z'))).rejects.toThrow(/Routine changed/)
})

test('editing a historical routine creates a version while preserving its original days and sessions', async () => {
  const stamp = (await db.query<{ updated_at: string }>('select updated_at::text from public.routines where id=$1', [A])).rows[0].updated_at
  await asUser(A, async () => {
    const nextId = await rpc(A, document, requestId, stamp)
    expect(nextId).not.toBe(A)
    expect(await rpc(A, document, requestId, stamp)).toBe(nextId)
    expect((await db.query<{ archived_at: string }>('select archived_at from public.routines where id=$1', [A])).rows[0].archived_at).not.toBeNull()
    expect((await db.query('select * from public.routine_days where id=$1', [A])).rows).toHaveLength(1)
    expect((await db.query<{ routine_id: string }>('select routine_id from public.workout_sessions where id=$1', [A])).rows[0].routine_id).toBe(A)
  })
})

test('same retry token with a changed document is rejected', async () => {
  await asUser(A, async () => {
    await rpc()
    await expect(rpc(freshId, { ...document, name: 'Different payload' })).rejects.toThrow(/Retry token reused/)
  })
})

test('editing a routine without history replaces its structure; a failed edit preserves the original', async () => {
  await asUser(A, async () => {
    await rpc()
    const stamp = (await db.query<{ stamp: string }>('select updated_at::text as stamp from public.routines where id=$1', [freshId])).rows[0].stamp
    await db.exec('savepoint edit')
    await expect(rpc(freshId, { ...document, name: 'Invalid edit', days: [{ ...document.days[0], exercises: [{ ...document.days[0].exercises[0], rep_max: 0 }] }] }, C, stamp)).rejects.toThrow()
    await db.exec('rollback to savepoint edit')
    expect((await db.query<{ name: string }>('select name from public.routines where id=$1', [freshId])).rows[0].name).toBe(document.name)
    await rpc(freshId, { ...document, name: 'Edited name' }, C, stamp)
    expect((await db.query<{ name: string }>('select name from public.routines where id=$1', [freshId])).rows[0].name).toBe('Edited name')
    expect((await db.query('select * from public.routine_days where routine_id=$1', [freshId])).rows).toHaveLength(1)
  })
})

test('archive is owner-only and keeps routine children', async () => {
  await asUser(A, async () => {
    expect((await db.query('update public.routines set archived_at=now() where id=$1 returning *', [B])).rows).toHaveLength(0)
    await db.query('update public.routines set archived_at=now() where id=$1', [A])
    expect((await db.query('select * from public.routine_days where routine_id=$1', [A])).rows).toHaveLength(1)
  })
})


test('recommendations generated from the actual seed can all be saved atomically', async () => {
  const catalog = (await db.query<Exercise>('select * from public.exercises')).rows
  for (const goal of ['general_fitness', 'strength', 'muscle_growth']) {
    const result = recommendRoutines({ ...defaultProfile, goal, experience: 'intermediate', equipment: ['dumbbell', 'barbell', 'machine'], equipment_details: ['bench','stable_support','chest_press','seated_row','shoulder_press'], training_days_per_week: 3, available_weekdays: [1,2,4,5] }, catalog)
    expect(result.options).toHaveLength(2)
    for (const option of result.options) {
      expect(validateRoutine(option.document, catalog)).toBeNull()
      await asUser(A, async () => {
        expect(await rpc(freshId, option.document)).toBe(freshId)
        expect((await db.query('select * from public.routine_days where routine_id=$1', [freshId])).rows).toHaveLength(option.document.days.length)
      })
    }
  }
})

test('the hosted routine-RPC verification script runs with exact migration semantics', async () => {
  const sql = readFileSync(new URL('./live_routine_save.sql', import.meta.url), 'utf8').replaceAll('USER_A_UUID', A).replaceAll('USER_B_UUID', B)
  await db.exec(sql)
})

test('review regression: later edits retain earlier retry receipts without reverting the plan', async () => {
  await asUser(A, async () => {
    await rpc()
    const stamp = (await db.query<{ stamp: string }>('select updated_at::text as stamp from public.routines where id=$1', [freshId])).rows[0].stamp
    await rpc(freshId, { ...document, name: 'Later edit' }, C, stamp)
    expect(await rpc()).toBe(freshId)
    expect((await db.query<{ name: string }>('select name from public.routines where id=$1', [freshId])).rows[0].name).toBe('Later edit')
  })
})

test('review regression: routine version timestamps advance within the same transaction', async () => {
  await asUser(A, async () => {
    await rpc()
    const before = (await db.query<{ stamp: string }>('select updated_at::text as stamp from public.routines where id=$1', [freshId])).rows[0].stamp
    await rpc(freshId, { ...document, name: 'First edit' }, C, before)
    const after = (await db.query<{ stamp: string }>('select updated_at::text as stamp from public.routines where id=$1', [freshId])).rows[0].stamp
    expect(after).not.toBe(before)
    await expect(rpc(freshId, { ...document, name: 'Stale second editor' }, B, before)).rejects.toThrow(/Routine changed/)
  })
})

test('review regression: non-string names cannot be coerced into routine names', async () => {
  await expect(asUser(A, () => rpc(freshId, { ...document, name: { unexpected: 'object' } }))).rejects.toThrow()
})

test('review regression: numeric strings cannot masquerade as prescription numbers', async () => {
  const invalid = structuredClone(document)
  const item = { ...invalid.days[0].exercises[0], target_sets: '2' }
  await expect(asUser(A, () => rpc(freshId, { ...invalid, days: [{ ...invalid.days[0], exercises: [item] }] }))).rejects.toThrow()
})


test.each([
  ['missing name', { ...document, name: undefined }],
  ['null name', { ...document, name: null }],
  ['whitespace name', { ...document, name: '\t\n' }],
  ['bad goal', { ...document, goal: 'unknown' }],
  ['non-array days', { ...document, days: {} }],
  ['null day', { ...document, days: [null] }],
  ['non-string day name', { ...document, days: [{ ...document.days[0], name: 1 }] }],
  ['fractional weekday', { ...document, days: [{ ...document.days[0], weekday: 1.5 }] }],
  ['string weekday', { ...document, days: [{ ...document.days[0], weekday: '1' }] }],
  ['out-of-range weekday', { ...document, days: [{ ...document.days[0], weekday: 7 }] }],
  ['non-object assumptions', { ...document, assumptions: [] }],
  ['forged owner field', { ...document, user_id: B }],
  ['non-string template key', { ...document, origin_template_key: {} }],
  ['oversized version', { ...document, recommendation_version: 'v'.repeat(101) }],
])('strict RPC validation rejects %s', async (_name, input) => {
  // Runs against an isolated transaction, never the hosted database.
  await expect(asUser(C, () => rpc(freshId, input))).rejects.toMatchObject({ code: '22023' })
})

test.each([
  ['null prescription', null],
  ['invalid exercise UUID', { ...document.days[0].exercises[0], exercise_id: 'not-a-uuid' }],
  ['null sets', { ...document.days[0].exercises[0], target_sets: null }],
  ['fractional sets', { ...document.days[0].exercises[0], target_sets: 2.5 }],
  ['oversized sets', { ...document.days[0].exercises[0], target_sets: 11 }],
  ['negative min reps', { ...document.days[0].exercises[0], rep_min: -1 }],
  ['null max reps', { ...document.days[0].exercises[0], rep_max: null }],
  ['fractional rest', { ...document.days[0].exercises[0], rest_seconds: 120.5 }],
  ['oversized rest', { ...document.days[0].exercises[0], rest_seconds: 901 }],
  ['inverted reps', { ...document.days[0].exercises[0], rep_min: 15, rep_max: 8 }],
  ['non-string notes', { ...document.days[0].exercises[0], notes: {} }],
  ['oversized notes', { ...document.days[0].exercises[0], notes: 'x'.repeat(2001) }],
  ['unknown exercise fields', { ...document.days[0].exercises[0], user_id: B }],
])('strict RPC prescription validation rejects %s', async (_name, input) => {
  const value = { ...document, days: [{ ...document.days[0], exercises: [input] }] }
  await expect(asUser(C, () => rpc(freshId, value))).rejects.toMatchObject({ code: '22023' })
})

test('integral JSON numbers with decimal notation are valid, while unknown exercise IDs roll back', async () => {
  await asUser(C, async () => {
    const rawJson = JSON.stringify(document).replace('\"weekday\":1', '\"weekday\":1.0').replace('\"target_sets\":2', '\"target_sets\":2.0')
    const saved = await db.query<{ id: string }>('select public.fitness_save_routine($1,$2::jsonb,$3,null) as id', [freshId, rawJson, requestId])
    expect(saved.rows[0].id).toBe(freshId)
  })
  await expect(asUser(C, () => rpc(freshId, { ...document, days: [{ ...document.days[0], exercises: [{ ...document.days[0].exercises[0], exercise_id: C }] }] }))).rejects.toMatchObject({ code: '22023' })
})

test('null auth.uid is rejected even under the authenticated role', async () => {
  await db.exec('begin; set local role authenticated')
  try {
    await db.query("select set_config('request.jwt.claim.sub','',true)")
    await expect(rpc()).rejects.toMatchObject({ code: '42501' })
  } finally { await db.exec('rollback') }
})

test('request tokens are per-user and input cannot forge retry receipts', async () => {
  await asUser(C, async () => {
    const input = { ...document, assumptions: { _save_receipts: { forged: 'fake' }, _save_request_id: 'forged', origin: 'custom' } }
    await rpc(C, input)
    const { rows } = await db.query<{ assumptions: Record<string, unknown> }>('select assumptions from public.routines where id=$1', [C])
    expect(rows[0].assumptions._save_request_id).toBeUndefined()
    expect(rows[0].assumptions._save_receipts).not.toHaveProperty('forged')
    expect(rows[0].assumptions._save_receipts).toHaveProperty(requestId)
    expect(rows[0].assumptions.origin).toBe('custom')
  })
  await asUser(A, async () => {
    expect(await rpc()).toBe(freshId)
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [B])
    expect(await rpc(C)).toBe(C) // Same request UUID, independent owner's operation.
  })
})

test('a retry with a different edit precondition is rejected', async () => {
  await asUser(C, async () => {
    await rpc()
    await expect(rpc(freshId, document, requestId, '2000-01-01T00:00:00Z')).rejects.toMatchObject({ code: '22023' })
  })
})

test('historical versioning preserves completed session snapshots, sets, and original prescriptions', async () => {
  const stamp = (await db.query<{ stamp: string }>('select updated_at::text as stamp from public.routines where id=$1', [A])).rows[0].stamp
  await asUser(A, async () => {
    await db.query("update public.workout_sessions set status='completed',completed_at=started_at,routine_name_snapshot='Original snapshot' where id=$1", [A])
    const originals = (await db.query<{ routine_day_id: string }>('select * from public.routine_exercises where user_id=$1', [A])).rows
    const sessions = (await db.query('select * from public.workout_sessions where user_id=$1', [A])).rows
    const sets = (await db.query('select * from public.workout_sets where user_id=$1', [A])).rows
    const newId = await rpc(A, { ...document, name: 'Updated version' }, C, stamp)
    expect(newId).not.toBe(A)
    expect((await db.query('select * from public.routine_exercises where routine_day_id=$1', [A])).rows).toEqual(originals.filter(row => row.routine_day_id === A))
    expect((await db.query('select * from public.workout_sessions where user_id=$1', [A])).rows).toEqual(sessions)
    expect((await db.query('select * from public.workout_sets where user_id=$1', [A])).rows).toEqual(sets)
    // Edit the new active version, then retry the original version-creation request.
    const nextStamp = (await db.query<{ stamp: string }>('select updated_at::text as stamp from public.routines where id=$1', [newId])).rows[0].stamp
    await rpc(newId, { ...document, name: 'Subsequent edit' }, B, nextStamp)
    expect(await rpc(A, { ...document, name: 'Updated version' }, C, stamp)).toBe(newId)
    expect((await db.query<{ name: string }>('select name from public.routines where id=$1', [newId])).rows[0].name).toBe('Subsequent edit')
  })
})

test('a failed history-preserving version save rolls back archival and new records', async () => {
  const stamp = (await db.query<{ stamp: string }>('select updated_at::text as stamp from public.routines where id=$1', [A])).rows[0].stamp
  await asUser(A, async () => {
    await db.exec('savepoint invalid_version')
    await expect(rpc(A, { ...document, days: [{ ...document.days[0], exercises: [{ ...document.days[0].exercises[0], exercise_id: C }] }] }, requestId, stamp)).rejects.toThrow(/available exercise/)
    await db.exec('rollback to savepoint invalid_version')
    expect((await db.query<{ archived_at: string | null }>('select archived_at from public.routines where id=$1', [A])).rows[0].archived_at).toBeNull()
    expect((await db.query('select * from public.routine_days where id=$1', [A])).rows).toHaveLength(1)
  })
})

test('archived routines reject new edits but acknowledge old successful requests without unarchiving', async () => {
  await asUser(C, async () => {
    await rpc(C)
    await db.query('update public.routines set archived_at=now() where id=$1', [C])
    expect(await rpc(C)).toBe(C)
    const stamp = (await db.query<{ stamp: string }>('select updated_at::text as stamp from public.routines where id=$1', [C])).rows[0].stamp
    await db.exec('savepoint archived_edit')
    await expect(rpc(C, document, B, stamp)).rejects.toThrow(/Archived routines/)
    await db.exec('rollback to savepoint archived_edit')
    expect((await db.query<{ archived_at: string }>('select archived_at from public.routines where id=$1', [C])).rows[0].archived_at).not.toBeNull()
  })
})

test('document and day/exercise count limits are enforced', async () => {
  for (const value of [
    { ...document, assumptions: { large: 'x'.repeat(2097152) } },
    { ...document, days: Array.from({ length: 8 }, () => document.days[0]) },
    { ...document, days: [{ ...document.days[0], exercises: Array.from({ length: 21 }, () => document.days[0].exercises[0]) }] },
  ]) await expect(asUser(C, () => rpc(C, value))).rejects.toMatchObject({ code: '22023' })
})

test('successful retries remain valid after catalog deprecation', async () => {
  await db.exec('begin; set local role authenticated')
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [C])
    await rpc(C)
    await db.exec('reset role')
    await db.query('update public.exercises set deprecated_at=now() where id=$1', [exercise])
    await db.exec('set local role authenticated')
    expect(await rpc(C)).toBe(C)
    const expected = (await db.query<{ stamp: string }>('select updated_at::text as stamp from public.routines where id=$1', [C])).rows[0].stamp
    await expect(rpc(C, document, B, expected)).rejects.toThrow(/available exercise/)
  } finally { await db.exec('rollback') }
})

test('failed writes do not consume a retry token or erase existing receipts', async () => {
  await asUser(C, async () => {
    await rpc(C)
    const expected = (await db.query<{ stamp: string }>('select updated_at::text as stamp from public.routines where id=$1', [C])).rows[0].stamp
    const invalid = { ...document, days: [{ ...document.days[0], exercises: [{ ...document.days[0].exercises[0], exercise_id: C }] }] }
    await db.exec('savepoint failed_edit')
    await expect(rpc(C, invalid, B, expected)).rejects.toThrow(/available exercise/)
    await db.exec('rollback to savepoint failed_edit')
    expect(await rpc(C, { ...document, name: 'Fixed edit' }, B, expected)).toBe(C)
    expect(await rpc(C)).toBe(C)
  })
})

test.each([null, [], true, 42, 'not an object'])('RPC rejects a non-object document: %j', async value => {
  await expect(asUser(C, () => rpc(C, value))).rejects.toMatchObject({ code: '22023' })
})

test('RPC rejects null IDs and nonfinite edit versions before writing', async () => {
  await expect(asUser(C, () => db.query('select public.fitness_save_routine(null,$1::jsonb,$2,null)', [JSON.stringify(document), requestId]))).rejects.toMatchObject({ code: '22023' })
  await expect(asUser(C, () => db.query('select public.fitness_save_routine($1,$2::jsonb,null,null)', [C, JSON.stringify(document)]))).rejects.toMatchObject({ code: '22023' })
  await expect(asUser(C, () => rpc(C, document, requestId, 'infinity'))).rejects.toMatchObject({ code: '22023' })
})

test('committed routine data survives identity changes and a fresh database read', async () => {
  // No live credentials: the local PostgreSQL roles emulate independent client requests.
  await db.exec('begin; set local role authenticated;')
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [A])
    await rpc()
    await db.exec('commit')
  } catch (error) { await db.exec('rollback'); throw error }
  expect((await asUser(B, () => db.query('select * from public.routines where id=$1', [freshId]))).rows).toHaveLength(0)
  expect((await asUser(A, () => db.query<{ name: string }>('select name from public.routines where id=$1', [freshId]))).rows[0].name).toBe(document.name)
})
