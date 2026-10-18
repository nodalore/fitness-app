// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { recommendRoutines } from '../../src/features/routines/recommendations'
import { defaultProfile, equipmentDetails } from '../../src/features/profile/profile'
import type { Exercise } from '../../src/features/routines/types'
import expansion from '../../src/data/catalog-expansion.json'
import { beforeAll, afterAll, test, expect } from 'vitest'

let db: PGlite
const A = 'a0000000-0000-4000-8000-000000000001'
const B = 'b0000000-0000-4000-8000-000000000001'
async function migration(file: string) { await db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8')) }
async function asUser(owner: string | null, query: string, params: unknown[] = []) {
  await db.exec('begin')
  try {
    await db.exec(`set local role ${owner ? 'authenticated' : 'anon'}`)
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [owner ?? ''])
    return await db.query<Record<string, unknown>>(query, params)
  } finally { await db.exec('rollback') }
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`)
  await db.query('insert into auth.users values ($1),($2)', [A, B])
  for (const file of ['202610170001_schema.sql', '202610170002_reference_seed.sql', '202610170003_routine_save.sql']) await migration(file)
  await db.query("insert into profiles(user_id,display_name,available_weekdays) values ($1,'Legacy name',array[1,3,5])", [A])
  await db.query("insert into routines(id,user_id,name,goal,assumptions) values ($1,$1,'Saved plan','strength','{\"_save_receipts\":{\"old\":\"hash\"}}')", [A])
  await db.query("insert into routine_days(id,user_id,routine_id,name,weekday,position) values ($1,$1,$1,'Existing Monday',1,0)", [A])
  const old = (await db.query<{ value: Record<string, unknown> }>('select to_jsonb(p) as value from profiles p')).rows[0].value
  await migration('202610180004_profile_frequency.sql')
  const after = (await db.query<{ value: Record<string, unknown> }>('select to_jsonb(p) as value from profiles p')).rows[0].value as Record<string, unknown>
  const { training_days_per_week, equipment_details, ...rest } = after
  expect(rest).toEqual(old)
  expect(training_days_per_week).toBeNull(); expect(equipment_details).toBeNull()
  const oldCatalog = (await db.query('select * from exercises order by id')).rows
  await migration('202610180005_catalog_expansion.sql')
  expect((await db.query("select * from exercises where id < '20000000-0000-4000-8000-000000000013' order by id")).rows).toEqual(oldCatalog)
}, 30000)
afterAll(async () => { await db?.close() })

test('additive profile upgrade preserves routines, schedule and retry metadata', async () => {
  const { rows } = await db.query<{ name: string; weekday: number; assumptions: object }>('select r.name,d.weekday,r.assumptions from routines r join routine_days d on d.routine_id=r.id')
  expect(rows[0]).toEqual({ name: 'Saved plan', weekday: 1, assumptions: { _save_receipts: { old: 'hash' } } })
})
test.each([1,7,2.5])('database rejects unsupported frequency %s', async value => {
  await expect(asUser(A, 'update profiles set training_days_per_week=$1 where user_id=$2', [value,A])).rejects.toThrow()
})
test.each([2,3,4,5,6])('frequency %s round trips without rewriting old weekdays', async value => {
  const { rows } = await asUser(A, 'update profiles set training_days_per_week=$1,equipment_details=$2 where user_id=$3 returning available_weekdays,training_days_per_week', [value,['bench','rack'],A])
  expect(rows[0]).toEqual({ available_weekdays: [1,3,5], training_days_per_week: value })
})
test('new fields remain protected by existing RLS', async () => {
  expect((await asUser(B, 'select * from profiles where user_id=$1',[A])).rows).toHaveLength(0)
  expect((await asUser(B, 'update profiles set training_days_per_week=6 where user_id=$1 returning *',[A])).rows).toHaveLength(0)
  await expect(asUser(null,'select training_days_per_week from profiles')).rejects.toThrow(/permission denied/)
})
test('old-client writes retain confirmed frequency and invalid details fail', async () => {
  await db.query('update profiles set training_days_per_week=4 where user_id=$1',[A])
  const { rows } = await asUser(A, "update profiles set available_weekdays=array[2,4],display_name='Old client' where user_id=$1 returning training_days_per_week", [A])
  expect(rows[0].training_days_per_week).toBe(4)
  await expect(asUser(A,'update profiles set equipment_details=$1 where user_id=$2',[['imaginary_machine'],A])).rejects.toThrow()
  await expect(asUser(A,'update profiles set equipment_details=$1 where user_id=$2',[[null],A])).rejects.toThrow()
})


test('catalog upgrade adds 18 complete entries with sources and honest alternatives', async () => {
  expect((await db.query('select * from exercises')).rows).toHaveLength(30)
  expect((await db.query('select * from evidence_sources')).rows).toHaveLength(10)
  expect((await db.query('select e.id from exercises e left join exercise_alternatives a on a.exercise_id=e.id where a.exercise_id is null')).rows).toHaveLength(0)
  expect((await db.query('select e.id from exercises e, unnest(e.evidence_source_ids) source left join evidence_sources s on s.id=source where s.id is null')).rows).toHaveLength(0)
  expect((await db.query('select * from exercises where char_length(technique_notes)<20')).rows).toHaveLength(0)
  expect(expansion.exercises).toHaveLength(18)
})
test('expanded reference data remains read-only to browser roles', async () => {
  for (const role of [null,A]) {
    expect((await asUser(role,'select * from exercises')).rows).toHaveLength(30)
    await expect(asUser(role,"update exercises set name='Forged'")).rejects.toThrow(/permission denied/)
    await expect(asUser(role,"delete from evidence_sources")).rejects.toThrow(/permission denied/)
  }
})
test('all goal/experience/frequency plans from actual upgraded SQL save through installed RPC', async () => {
  const catalog = (await db.query<Exercise>('select * from exercises')).rows
  for (const goal of ['general_fitness','strength','muscle_growth']) for (const experience of ['beginner','intermediate','advanced']) for (const count of [2,3,4,5,6]) {
    const result = recommendRoutines({ ...defaultProfile, goal, experience, training_days_per_week:count, equipment:['dumbbell','barbell','machine','band'], equipment_details:Object.keys(equipmentDetails) },catalog)
    expect(result.options).toHaveLength(3)
    for (const option of result.options) {
      const id = crypto.randomUUID()
      await asUser(A,'select fitness_save_routine($1,$2::jsonb,$3,null)',[id,JSON.stringify(option.document),crypto.randomUUID()])
    }
  }
})
