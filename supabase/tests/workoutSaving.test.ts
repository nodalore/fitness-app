// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, expect, test } from 'vitest'
let db: PGlite
const A='a0000000-0000-4000-8000-000000000001', B='b0000000-0000-4000-8000-000000000001'
let rid:string, did:string, version:string
async function as(owner:string|null,sql:string,params:unknown[]=[]) {
  await db.exec('begin')
  try { await db.exec(`set local role ${owner?'authenticated':'anon'}`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[owner??'']);const result=await db.query<Record<string,unknown>>(sql,params);await db.exec('commit');return result.rows }
  catch(error){await db.exec('rollback');throw error}
}
function doc(){return {id:crypto.randomUUID(),routineId:rid,routineDayId:did,routineVersion:version,routineName:'Ignored client name',sessionName:'Ignored client day',dayPosition:0,startedAt:'2026-01-01',exercises:[{id:crypto.randomUUID(),exerciseId:null,name:'My hip thrust',loadingMode:null,sourceName:'RDLs',target:{planned_sets:[{reps:10,load_kg:70}]},skipped:false,removed:false,sets:[{id:crypto.randomUUID(),reps:10,weight:180,unit:'lb'},{id:crypto.randomUUID(),reps:8,weight:60,unit:'kg'}]}]}}
async function save(d=doc(),revision:number|null=null,request=crypto.randomUUID(),finish=false,owner:string|null=A){return(await as(owner,'select fitness_save_workout($1::jsonb,$2,$3,$4,$5) as result',[JSON.stringify(d),revision,request,owner??A,finish]))[0].result as {revision:number;status:string}}
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`)
 await db.query('insert into auth.users values($1),($2)',[A,B])
 for(const file of ['202610170001_schema.sql','202610170002_reference_seed.sql','202610170003_routine_save.sql','202610180004_profile_frequency.sql','202610180005_catalog_expansion.sql','202610180006_profile_gender.sql','202610180007_custom_planning.sql'])await db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'))
 rid=crypto.randomUUID();did=crypto.randomUUID();await db.query("insert into routines(id,user_id,name,goal) values($1,$2,'Saved routine','strength')",[rid,A]);await db.query("insert into routine_days(id,user_id,routine_id,name,position) values($1,$2,$3,'Glutes and Hammies',0)",[did,A,rid]);version=(await db.query<{stamp:string}>('select updated_at::text as stamp from routines where id=$1',[rid])).rows[0].stamp
 const legacy=crypto.randomUUID();await db.query("insert into workout_sessions(id,user_id,routine_name_snapshot,status,started_at,completed_at) values($1,$2,'Historical','completed','2026-01-01','2026-01-02')",[legacy,A]);
 const oldExercise=crypto.randomUUID()
 await db.query("insert into session_exercises(id,user_id,session_id,exercise_id,exercise_name_snapshot,loading_mode_snapshot,position,target_snapshot,notes) values($1,$2,$3,'20000000-0000-4000-8000-000000000001','Historical squat','bodyweight',0,'{\"reps\":8}','Keep history')",[oldExercise,A,legacy])
 await db.query("insert into workout_sets(user_id,session_exercise_id,set_number,reps,load_kg,entered_unit,completed,notes) values($1,$2,1,8,0,'kg',true,'Actual zero load')",[A,oldExercise])
 await db.query("insert into profiles(user_id,display_name,gender,training_days_per_week) values($1,'Existing name','prefer_not_to_say',4)",[A])
 const tables=['profiles','routines','routine_days','routine_exercises','routine_planned_sets','exercises','workout_sessions','session_exercises','workout_sets']
 const snapshot=async()=>{const result:Record<string,unknown>={};for(const table of tables)result[table]=(await db.query<{row:Record<string,unknown>}>(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`)).rows.map(({row})=>{if(table==='workout_sessions')for(const key of ['revision','updated_at','source_routine_version','source_day_position'])delete row[key];if(table==='session_exercises')for(const key of ['source_name_snapshot','skipped','removed'])delete row[key];if(table==='workout_sets')delete row.entered_load;return row});return result}
 const before=await snapshot()
 await db.exec(readFileSync(new URL('../migrations/202610180008_workout_saving.sql',import.meta.url),'utf8'))
 expect(await snapshot()).toEqual(before)
},30000)
afterAll(async()=>{await db?.close()})
test('custom actuals roundtrip with exact entered lb/kg, stable IDs, source targets and authoritative names',async()=>{
 const d=doc(),result=await save(d);expect(result.status).toBe('draft')
 const rows=await as(A,'select s.*,e.exercise_name_snapshot,e.source_name_snapshot,e.target_snapshot from workout_sets s join session_exercises e on e.id=s.session_exercise_id where e.session_id=$1 order by s.set_number',[d.id])
 expect(rows.map(row=>row.id)).toEqual(d.exercises[0].sets.map(s=>s.id));expect(rows.map(row=>Number(row.entered_load))).toEqual([180,60]);expect(Number(rows[0].load_kg)).toBeCloseTo(81.6466,4)
 expect(rows[0]).toMatchObject({exercise_name_snapshot:'My hip thrust',source_name_snapshot:'RDLs',target_snapshot:d.exercises[0].target,completed:true})
 expect((await as(A,'select routine_name_snapshot,day_name_snapshot from workout_sessions where id=$1',[d.id]))[0]).toEqual({routine_name_snapshot:'Saved routine',day_name_snapshot:'Glutes and Hammies'})
})
test('autosave edits/removes sets and preserves skipped/removed/additional exercises without changing routines',async()=>{
 const before=(await db.query('select * from routines where id=$1',[rid])).rows
 const d=doc();let result=await save(d);d.exercises[0].sets.splice(0,1);d.exercises[0].sets[0].reps=5
 const added={...structuredClone(d.exercises[0]),id:crypto.randomUUID(),name:'Extra exercise',sourceName:null as string|null,sets:[] as typeof d.exercises[0]['sets']};d.exercises.push(added as typeof d.exercises[0]);d.exercises[0].skipped=true;added.removed=true
 result=await save(d,result.revision);expect(result.revision).toBeGreaterThan(0)
 expect((await as(A,'select * from session_exercises where session_id=$1 order by position',[d.id])).map(e=>({name:e.exercise_name_snapshot,skipped:e.skipped,removed:e.removed}))).toEqual([{name:'My hip thrust',skipped:true,removed:false},{name:'Extra exercise',skipped:false,removed:true}])
 expect((await db.query('select * from routines where id=$1',[rid])).rows).toEqual(before)
 expect((await as(A,'select reps from workout_sets where session_exercise_id=$1',[d.exercises[0].id])).map(s=>s.reps)).toEqual([5])
})
test('retry is idempotent, changed retries and stale saves fail without duplicate children',async()=>{
 const d=doc(),request=crypto.randomUUID(),first=await save(d,null,request)
 expect(await save(d,null,request)).toEqual(first)
 await expect(save({...d,sessionName:'Altered'},null,request)).rejects.toThrow(/Retry token/)
 const next=await save(d,first.revision);expect(next.revision).toBeGreaterThan(first.revision)
 await expect(save(d,first.revision)).rejects.toThrow(/changed/)
 expect(await save(d,null,request)).toMatchObject({revision:first.revision,status:'draft',currentRevision:next.revision})
 expect((await as(A,'select * from workout_sets where session_exercise_id=$1',[d.exercises[0].id]))).toHaveLength(2)
})
test('newly added blank sets persist in drafts but finishing requires reps; zero-set completion is rejected',async()=>{
 const d=doc();d.exercises[0].sets[0].reps=null as unknown as number;let result=await save(d)
 await expect(save(d,result.revision,crypto.randomUUID(),true)).rejects.toThrow(/Enter reps/)
 d.exercises[0].sets.shift();result=await save(d,result.revision,crypto.randomUUID(),true);expect(result.status).toBe('completed')
 const empty=doc();empty.exercises[0].sets=[];await expect(save(empty,null,crypto.randomUUID(),true)).rejects.toThrow(/at least one/)
})
test('finish exactly once, partial workouts allowed, completed children and session immutable for app roles',async()=>{
 const d=doc();d.exercises.push({...structuredClone(d.exercises[0]),id:crypto.randomUUID(),name:'Skipped',skipped:true,sets:[]});const first=await save(d),request=crypto.randomUUID();const finished=await save(d,first.revision,request,true)
 expect(await save(d,first.revision,request,true)).toEqual(finished)
 await expect(save(d,finished.revision)).rejects.toThrow(/read-only/)
 await expect(as(A,"update workout_sets set reps=99 where id=$1",[d.exercises[0].sets[0].id])).rejects.toThrow(/read-only/)
 await expect(as(A,'delete from session_exercises where session_id=$1',[d.id])).rejects.toThrow(/read-only/)
 await expect(as(A,"update workout_sessions set status='draft',completed_at=null where id=$1",[d.id])).rejects.toThrow(/read-only/)
 await expect(as(A,'delete from workout_sessions where id=$1',[d.id])).rejects.toThrow(/read-only/)
})
test('anonymous and cross-account access denied, foreign parents and identities cannot be reused',async()=>{
 const d=doc(),saved=await save(d)
 for(const table of ['workout_sessions','session_exercises','workout_sets','workout_save_receipts']) {
  expect(await as(B,`select * from ${table}`)).toHaveLength(0)
  await expect(as(null,`select * from ${table}`)).rejects.toThrow()
 }
 await expect(save(d,saved.revision,crypto.randomUUID(),false,B)).rejects.toThrow(/unavailable/)
 await expect(save(doc(),null,crypto.randomUUID(),false,B)).rejects.toThrow(/unavailable/)
 await expect(save(doc(),null,crypto.randomUUID(),false,null)).rejects.toThrow()
 expect(await as(B,'delete from workout_sessions where id=$1 returning id',[d.id])).toEqual([])
})
test('invalid writes roll back the entire snapshot and preserve revision, IDs and values',async()=>{
 const d=doc(),result=await save(d),before=await as(A,'select * from workout_sets where session_exercise_id=$1 order by id',[d.exercises[0].id]);d.exercises[0].sets[0].weight=-2
 await expect(save(d,result.revision)).rejects.toThrow(/Weight/)
 expect(await as(A,'select * from workout_sets where session_exercise_id=$1 order by id',[d.exercises[0].id])).toEqual(before)
 expect((await as(A,'select revision from workout_sessions where id=$1',[d.id]))[0].revision).toBe(result.revision)
})
test('direct draft child writes advance revision and unfinished history references protect routines',async()=>{
 const d=doc(),result=await save(d)
 await as(A,'update workout_sets set reps=9 where id=$1',[d.exercises[0].sets[0].id])
 await expect(save(d,result.revision)).rejects.toThrow(/changed/)
 await expect(as(A,'delete from routines where id=$1',[rid])).rejects.toThrow(/foreign key/)
})

test('explicit independent recovery stores captured names and actuals without inventing a routine FK',async()=>{
 const d={...doc(),routineId:null,routineDayId:null,routineVersion:null}
 const result=await save(d as unknown as ReturnType<typeof doc>);expect(result.status).toBe('draft')
 expect((await as(A,'select routine_id,routine_day_id,routine_name_snapshot,day_name_snapshot from workout_sessions where id=$1',[d.id]))[0]).toEqual({routine_id:null,routine_day_id:null,routine_name_snapshot:d.routineName,day_name_snapshot:d.sessionName})
})
test.each([
 (d:ReturnType<typeof doc>)=>{d.exercises[0].sets[0].reps=1.5},
 (d:ReturnType<typeof doc>)=>{d.exercises[0].sets[0].weight=-1},
 (d:ReturnType<typeof doc>)=>{d.exercises[0].sets[0].weight=30000},
 (d:ReturnType<typeof doc>)=>{d.exercises[0].sets[0].unit='stone'},
 (d:ReturnType<typeof doc>)=>{d.exercises[0].name='  '},
 (d:ReturnType<typeof doc>)=>{d.exercises[0].sets.push({...d.exercises[0].sets[0]})},
 (d:ReturnType<typeof doc>)=>{d.exercises[0].exerciseId=crypto.randomUUID() as unknown as null},
])('malformed actual snapshots roll back without creating a workout',async change=>{
 const d=doc();change(d);await expect(save(d)).rejects.toThrow();expect(await as(A,'select id from workout_sessions where id=$1',[d.id])).toEqual([])
})
test('direct draft constraints reject anonymous/foreign child writes, blank custom names and NaN loads',async()=>{
 const d=doc();await save(d)
 await expect(as(B,"insert into workout_sets(user_id,session_exercise_id,set_number,reps) values($1,$2,3,8)",[B,d.exercises[0].id])).rejects.toThrow()
 await expect(as(A,"update workout_sets set entered_load=null,load_kg='NaN' where id=$1",[d.exercises[0].sets[0].id])).rejects.toThrow()
 await expect(as(A,"update session_exercises set exercise_name_snapshot=' ' where id=$1",[d.exercises[0].id])).rejects.toThrow()
})

test('a stale account-bound request cannot create an independent workout after signing into another account', async()=>{
 const d={...doc(),routineId:null,routineDayId:null,routineVersion:null}
 await expect(as(B,'select fitness_save_workout($1::jsonb,null,$2,$3,false)',[JSON.stringify(d),crypto.randomUUID(),A])).rejects.toThrow(/correct account/)
 expect((await db.query('select * from workout_sessions where id=$1',[d.id])).rows).toHaveLength(0)
})
