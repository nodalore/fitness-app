// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, test, expect } from 'vitest'
import { blankExercise, type RoutineDocument } from '../../src/features/routines/types'
import { recommendRoutines } from '../../src/features/routines/recommendations'
import { defaultProfile } from '../../src/features/profile/profile'
import type { Exercise } from '../../src/features/routines/types'
let db: PGlite
const A = 'a0000000-0000-4000-8000-000000000001', B = 'b0000000-0000-4000-8000-000000000001'
const catalogId = '20000000-0000-4000-8000-000000000001'
const legacy: RoutineDocument = { name:'Legacy',goal:'strength',origin_template_key:null,recommendation_version:null,assumptions:{},days:[{name:'Monday',weekday:1,exercises:[{exercise_id:catalogId,target_sets:2,rep_min:8,rep_max:12,rest_seconds:120,notes:'Preserve range'}]}] }
const custom: RoutineDocument = { ...legacy,name:'Private plan',days:[{name:'Session A',weekday:null,exercises:[{...blankExercise('My private movement'),planned_sets:[{reps:8,load_kg:20,entered_unit:'kg' as const},{reps:6,load_kg:25,entered_unit:'lb' as const},{reps:null,load_kg:null,entered_unit:'kg' as const},{reps:10,load_kg:0,entered_unit:'kg' as const}]},blankExercise('',catalogId)]}] }
let oldId: string, oldRequest: string, oldStamp: string
let oldRows: unknown
async function asUser(owner: string | null, query: string, params: unknown[] = [], commit = false) {
  await db.exec('begin')
  try {
    await db.exec(`set local role ${owner ? 'authenticated' : 'anon'}`)
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[owner ?? ''])
    const result = await db.query<Record<string,unknown>>(query,params)
    await db.exec(commit ? 'commit' : 'rollback'); return result
  } catch (error) { await db.exec('rollback'); throw error }
}
async function save(document: unknown = custom, id: string = crypto.randomUUID(), request: string = crypto.randomUUID(), stamp: string | null = null, owner: string | null = A, version=2) {
  return (await asUser(owner,`select fitness_save_routine${version === 2 ? '_v2' : ''}($1,$2::jsonb,$3,$4::timestamptz) as id`,[id,JSON.stringify(document),request,stamp],true)).rows[0].id as string
}
async function stamp(id: string) { return (await db.query<{stamp:string}>('select updated_at::text as stamp from routines where id=$1',[id])).rows[0].stamp }
async function targets(id: string) { return (await db.query<Record<string,unknown>>('select e.custom_exercise_name,e.planning_mode,s.position,s.reps,s.load_kg,s.entered_unit from routine_days d join routine_exercises e on e.routine_day_id=d.id left join routine_planned_sets s on s.routine_exercise_id=e.id where d.routine_id=$1 order by e.position,s.position',[id])).rows }
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`)
  await db.query('insert into auth.users values ($1),($2)',[A,B])
  for (const name of ['202610170001_schema.sql','202610170002_reference_seed.sql','202610170003_routine_save.sql','202610180004_profile_frequency.sql','202610180005_catalog_expansion.sql','202610180006_profile_gender.sql']) await db.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'))
  oldId=crypto.randomUUID(); oldRequest=crypto.randomUUID()
  await save(legacy,oldId,oldRequest,null,A,1);oldStamp=await stamp(oldId)
  oldRows=(await db.query<Record<string,unknown>>('select * from routine_exercises')).rows
  await db.exec(readFileSync(new URL('../migrations/202610180007_custom_planning.sql',import.meta.url),'utf8'))
},30000)
afterAll(async () => { await db?.close() })
test('populated upgrade keeps IDs, legacy targets and v1 function/receipts unchanged', async () => {
  const rows=(await db.query<Record<string,unknown>>('select * from routine_exercises')).rows.map(({custom_exercise_name,planning_mode,...row}) => {expect(custom_exercise_name).toBeNull();expect(planning_mode).toBe('legacy');return row})
  expect(rows).toEqual(oldRows)
  expect(await save(legacy,oldId,oldRequest,null,A,1)).toBe(oldId)
  expect(await stamp(oldId)).toBe(oldStamp)
})
test('mixed catalog/custom targets round trip with different reps/loads, NULL and zero', async () => {
  const id=await save();const rows=await targets(id)
  expect(rows.slice(0,4).map(({reps,load_kg,entered_unit}) => ({reps,load_kg:load_kg == null ? null : Number(load_kg),entered_unit}))).toEqual(custom.days[0].exercises[0].planned_sets)
  expect(rows[0].custom_exercise_name).toBe('My private movement')
  expect(rows[4].position).toBeNull()
  expect((await asUser(B,'select * from routines where id=$1',[id])).rows).toHaveLength(0)
  expect((await asUser(B,'select * from routine_exercises where custom_exercise_name=$1',['My private movement'])).rows).toHaveLength(0)
  expect((await asUser(B,'select * from routine_planned_sets')).rows).toHaveLength(0)
})
test('retry receipts survive v2 edits and late v1 retries never undo newer data', async () => {
  const id=crypto.randomUUID(),request=crypto.randomUUID();await save(legacy,id,request,null,A,1)
  const v2request=crypto.randomUUID(),expected=await stamp(id)
  await save(custom,id,v2request,expected)
  expect(await save(custom,id,v2request,expected)).toBe(id)
  expect(await save(legacy,id,request,null,A,1)).toBe(id)
  expect((await targets(id))[0].custom_exercise_name).toBe('My private movement')
  await expect(save({...custom,name:'Conflicting retry'},id,v2request,expected)).rejects.toThrow(/Retry token/)
  await expect(save(custom,id,crypto.randomUUID(),expected)).rejects.toThrow(/changed/)
})
test('failed catalog validation rolls back all parent/child changes and receipts', async () => {
  const id=await save();const before=await targets(id);const expected=await stamp(id)
  const invalid=structuredClone(custom);invalid.days[0].exercises.push(blankExercise('',crypto.randomUUID()))
  await expect(save(invalid,id,crypto.randomUUID(),expected)).rejects.toThrow(/available exercise/)
  expect(await targets(id)).toEqual(before);expect(await stamp(id)).toBe(expected)
})
test('editing a routine referenced by history creates a version and preserves original rows', async () => {
  const id=await save();const day=(await db.query<{id:string}>('select id from routine_days where routine_id=$1',[id])).rows[0].id
  const before=await targets(id)
  await db.query('insert into workout_sessions(user_id,routine_id,routine_day_id) values ($1,$2,$3)',[A,id,day])
  const next=await save({...custom,name:'New version'},id,crypto.randomUUID(),await stamp(id))
  expect(next).not.toBe(id);expect(await targets(id)).toEqual(before)
  expect((await db.query<Record<string,unknown>>('select archived_at from routines where id=$1',[id])).rows[0].archived_at).not.toBeNull()
  expect((await db.query<Record<string,unknown>>('select routine_day_id from workout_sessions where routine_id=$1',[id])).rows[0].routine_day_id).toBe(day)
})
test('anonymous, forged owner, foreign parent and foreign RPC writes are denied', async () => {
  const id=await save();const exercise=(await db.query<{id:string}>('select e.id from routine_exercises e join routine_days d on d.id=e.routine_day_id where d.routine_id=$1',[id])).rows[0].id
  await expect(save(custom,crypto.randomUUID(),crypto.randomUUID(),null,null)).rejects.toThrow(/permission denied/)
  await expect(save(custom,id,crypto.randomUUID(),await stamp(id),B)).rejects.toThrow(/unavailable/)
  await expect(asUser(B,'insert into routine_planned_sets(user_id,routine_exercise_id,position,entered_unit) values ($1,$2,0,\'kg\')',[A,exercise])).rejects.toThrow()
  await expect(asUser(B,'insert into routine_planned_sets(user_id,routine_exercise_id,position,entered_unit) values ($1,$2,0,\'kg\')',[B,exercise])).rejects.toThrow()
  await expect(asUser(null,'select * from routine_planned_sets')).rejects.toThrow(/permission denied/)
  expect((await asUser(B,'update routine_planned_sets set reps=99 where user_id=$1 returning *',[A])).rows).toHaveLength(0)
})
test.each([
  {custom_exercise_name:'   '},{custom_exercise_name:'x'.repeat(101)}, {exercise_id:catalogId,custom_exercise_name:'both'},
  {planned_sets:[{reps:1.5,load_kg:2,entered_unit:'kg' as const}]}, {planned_sets:[{reps:0,load_kg:2,entered_unit:'kg' as const}]},
  {planned_sets:[{reps:8,load_kg:-1,entered_unit:'kg' as const}]}, {planned_sets:[{reps:'8',load_kg:2,entered_unit:'kg' as const}]},
  {planned_sets:[{reps:8,load_kg:10001,entered_unit:'kg' as const}]}, {planned_sets:[{reps:8,load_kg:2,entered_unit:'stone'}]},
  {planned_sets:Array.from({length:11},()=>({reps:8,load_kg:null,entered_unit:'kg' as const}))}, {target_sets:3}, {planning_mode:null},
])('strict v2 validation rejects malformed targets/sources: %j', async patch => {
  const document=structuredClone(custom);Object.assign(document.days[0].exercises[0],patch)
  await expect(save(document)).rejects.toThrow()
})
test('direct writes enforce legacy/per-set parent invariant and scalar bounds', async () => {
  const id=await save(legacy);const parent=(await db.query<{id:string}>('select e.id from routine_exercises e join routine_days d on d.id=e.routine_day_id where d.routine_id=$1',[id])).rows[0].id
  await expect(asUser(A,"insert into routine_planned_sets(routine_exercise_id,position,entered_unit) values ($1,0,'kg')",[parent])).rejects.toThrow(/Invalid planned-set parent/)
  const customId=await save();const child=(await db.query<{id:string}>('select e.id from routine_exercises e join routine_days d on d.id=e.routine_day_id where d.routine_id=$1 and e.exercise_id is null',[customId])).rows[0].id
  await expect(asUser(A,"update routine_exercises set planning_mode='legacy',exercise_id=$1,custom_exercise_name=null,target_sets=2,rep_min=8,rep_max=12,rest_seconds=120 where id=$2",[catalogId,child])).rejects.toThrow(/Remove planned targets/)
  await expect(asUser(A,"update routine_planned_sets set load_kg='NaN' where routine_exercise_id=$1",[child])).rejects.toThrow()
})
test('all 45 actual catalog recommendations save target-free through v2', async () => {
  const catalog=(await db.query<Exercise>('select * from exercises')).rows
  for (const goal of ['general_fitness','strength','muscle_growth']) for (const experience of ['beginner','intermediate','advanced']) for (const count of [2,3,4,5,6]) {
    const result=recommendRoutines({...defaultProfile,goal,experience,training_days_per_week:count},catalog)
    expect(result.options).toHaveLength(1)
    const id=await save(result.options[0].document)
    expect((await db.query('select s.* from routine_planned_sets s join routine_exercises e on e.id=s.routine_exercise_id join routine_days d on d.id=e.routine_day_id where d.routine_id=$1',[id])).rows).toHaveLength(0)
  }
})

test('v2 late retry after a v1 edit acknowledges success without restoring old per-set targets', async () => {
  const id=crypto.randomUUID(),request=crypto.randomUUID();await save(custom,id,request)
  await save(legacy,id,crypto.randomUUID(),await stamp(id),A,1)
  expect(await save(custom,id,request)).toBe(id)
  const {rows}=await db.query<Record<string,unknown>>('select e.* from routine_exercises e join routine_days d on d.id=e.routine_day_id where d.routine_id=$1',[id])
  expect(rows[0].planning_mode).toBe('legacy');expect(rows[0].rep_max).toBe(12)
})
test('planned-set owner cannot be reassigned and foreign users cannot update/delete/read children', async () => {
  const id=await save();const parent=(await db.query<{id:string}>('select e.id from routine_exercises e join routine_days d on d.id=e.routine_day_id where d.routine_id=$1 and e.exercise_id is null',[id])).rows[0].id
  await expect(asUser(A,'update routine_planned_sets set user_id=$1 where routine_exercise_id=$2',[B,parent])).rejects.toThrow()
  expect((await asUser(B,'delete from routine_planned_sets where routine_exercise_id=$1 returning *',[parent])).rows).toHaveLength(0)
  expect((await asUser(B,'select * from routine_planned_sets where routine_exercise_id=$1',[parent])).rows).toHaveLength(0)
  expect((await asUser(B,"update routine_exercises set custom_exercise_name='Stolen' where id=$1 returning *",[parent])).rows).toHaveLength(0)
})
test.each([
  null,[],{...custom,name:'\t\n'}, {...custom,unexpected:true}, {...custom,goal:'unknown'},
  {...custom,assumptions:[]}, {...custom,days:[]}, {...custom,days:[{...custom.days[0],weekday:1.5}]},
  {...custom,days:[{...custom.days[0],exercises:[]}]},
])('v2 rejects invalid document shapes before writes: %j', async value => {
  await expect(save(value)).rejects.toThrow()
})

test('owner can permanently delete only the intended unreferenced plan and its planning children', async () => {
  const id=await save(),other=await save({...custom,name:'Keep this plan'})
  const children=(await db.query<{id:string}>('select e.id from routine_exercises e join routine_days d on d.id=e.routine_day_id where d.routine_id=$1',[id])).rows.map(row=>row.id)
  const beforeOther=await targets(other)
  const result=await asUser(A,'delete from routines where user_id=$1 and id=$2 and updated_at=$3::timestamptz returning id',[A,id,await stamp(id)],true)
  expect(result.rows).toEqual([{id}])
  expect((await db.query('select * from routine_days where routine_id=$1',[id])).rows).toHaveLength(0)
  expect((await db.query('select * from routine_exercises where id=any($1::uuid[])',[children])).rows).toHaveLength(0)
  expect((await db.query('select * from routine_planned_sets where routine_exercise_id=any($1::uuid[])',[children])).rows).toHaveLength(0)
  expect(await targets(other)).toEqual(beforeOther)
})
test('permanent deletion is protected against anonymous and foreign-owner access', async () => {
  const id=await save(),expected=await stamp(id)
  expect((await asUser(B,'delete from routines where user_id=$1 and id=$2 and updated_at=$3::timestamptz returning id',[A,id,expected],true)).rows).toHaveLength(0)
  expect((await asUser(B,'delete from routines where id=$1 returning id',[id],true)).rows).toHaveLength(0)
  await expect(asUser(null,'delete from routines where id=$1 returning id',[id])).rejects.toThrow(/permission denied/)
  expect(await targets(id)).not.toHaveLength(0)
})
test('workout references block deletion and preserve every completed workout, snapshot, performed set and planned row', async () => {
  const id=await save(),before=await targets(id)
  const day=(await db.query<{id:string}>('select id from routine_days where routine_id=$1',[id])).rows[0].id
  const session=crypto.randomUUID(),sessionExercise=crypto.randomUUID()
  await db.query("insert into workout_sessions(id,user_id,routine_id,routine_day_id,routine_name_snapshot,day_name_snapshot,status,started_at,completed_at) values ($1,$2,$3,$4,'Historical routine','Historical day','completed','2026-01-01T10:00:00Z','2026-01-01T11:00:00Z')",[session,A,id,day])
  await db.query("insert into session_exercises(id,user_id,session_id,exercise_id,exercise_name_snapshot,loading_mode_snapshot,position,target_snapshot) values ($1,$2,$3,$4,'Recorded exercise','external',0,'{\"reps\":8}')",[sessionExercise,A,session,catalogId])
  await db.query("insert into workout_sets(user_id,session_exercise_id,set_number,reps,load_kg,completed) values ($1,$2,1,8,20,true)",[A,sessionExercise])
  const snapshot=async()=>({session:(await db.query('select * from workout_sessions where id=$1',[session])).rows,exercises:(await db.query('select * from session_exercises where session_id=$1',[session])).rows,sets:(await db.query('select * from workout_sets where session_exercise_id=$1',[sessionExercise])).rows})
  const history=await snapshot()
  await expect(asUser(A,'delete from routines where user_id=$1 and id=$2 returning id',[A,id],true)).rejects.toThrow(/foreign key constraint/)
  expect(await snapshot()).toEqual(history);expect(await targets(id)).toEqual(before)
  // Even a workout with no selected day still protects its routine.
  await db.query('update workout_sessions set routine_day_id=null where id=$1',[session])
  await expect(asUser(A,'delete from routines where id=$1',[id],true)).rejects.toThrow(/foreign key constraint/)
})
test('stale delete confirmation cannot delete a plan that was edited after confirmation opened', async () => {
  const id=await save(),oldStamp=await stamp(id)
  await save({...custom,name:'Updated after confirmation'},id,crypto.randomUUID(),oldStamp)
  const result=await asUser(A,'delete from routines where user_id=$1 and id=$2 and updated_at=$3::timestamptz returning id',[A,id,oldStamp],true)
  expect(result.rows).toHaveLength(0);expect(await targets(id)).not.toHaveLength(0)
})
test('Save Changes updates precisely one existing unreferenced routine, retaining other active and archived routines', async () => {
  const id=await save(),other=await save({...custom,name:'Other active'}),archived=await save({...custom,name:'Other archived'})
  await db.query('update routines set archived_at=clock_timestamp() where id=$1',[archived])
  const before=(await db.query('select * from routines where id=any($1::uuid[]) order by id',[[other,archived]])).rows
  const oldTargets=await targets(other),oldArchived=await targets(archived)
  const count=(await db.query('select count(*) from routines')).rows
  const changed=structuredClone(custom);changed.name='Intended edit';changed.days[0].exercises[0]={...blankExercise('Exactly my exercise'),planned_sets:[{reps:5,load_kg:31,entered_unit:'kg' as const}]}
  expect(await save(changed,id,crypto.randomUUID(),await stamp(id))).toBe(id)
  expect((await db.query('select count(*) from routines')).rows).toEqual(count)
  expect((await db.query('select * from routines where id=any($1::uuid[]) order by id',[[other,archived]])).rows).toEqual(before)
  expect(await targets(other)).toEqual(oldTargets);expect(await targets(archived)).toEqual(oldArchived)
  expect((await targets(id))[0]).toMatchObject({custom_exercise_name:'Exactly my exercise',reps:5})
})
