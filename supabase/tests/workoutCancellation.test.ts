// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, expect, test } from 'vitest'
let db: PGlite
const A='a0000000-0000-4000-8000-000000000001',B='b0000000-0000-4000-8000-000000000001'
let routineId:string, dayId:string, version:string
async function as(owner:string|null,sql:string,params:unknown[]=[]) {
 await db.exec('begin')
 try {await db.exec(`set local role ${owner?'authenticated':'anon'}`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[owner??'']);const result=await db.query<Record<string,unknown>>(sql,params);await db.exec('commit');return result.rows}
 catch(error){await db.exec('rollback');throw error}
}
function doc(){return {id:crypto.randomUUID(),routineId,routineDayId:dayId,routineVersion:version,routineName:'Snapshot',sessionName:'Snapshot',dayPosition:0,startedAt:'2026-10-18',exercises:[{id:crypto.randomUUID(),exerciseId:null,name:'Custom replacement',loadingMode:'external',sourceName:'Original exercise',target:{reps:8},skipped:false,removed:false,sets:[{id:crypto.randomUUID(),reps:10,weight:180,unit:'lb'}]}]}}
async function save(d=doc(),revision:number|null=null,request=crypto.randomUUID(),finish=false){return(await as(A,'select fitness_save_workout($1::jsonb,$2,$3,$4,$5) as result',[JSON.stringify(d),revision,request,A,finish]))[0].result as {revision:number;status:string}}
async function cancel(id:string,owner:string|null=A,expected=owner??A){return(await as(owner,'select fitness_cancel_workout($1,$2) as result',[id,expected]))[0].result}
async function snapshot(){const result:Record<string,unknown>={};for(const table of ['routines','routine_days','routine_exercises','routine_planned_sets','workout_sessions','session_exercises','workout_sets','workout_save_receipts'])result[table]=(await db.query(`select to_jsonb(t) from ${table} t order by to_jsonb(t)::text`)).rows;return result}
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`)
 await db.query('insert into auth.users values($1),($2)',[A,B])
 for(const file of ['202610170001_schema.sql','202610170002_reference_seed.sql','202610170003_routine_save.sql','202610180004_profile_frequency.sql','202610180005_catalog_expansion.sql','202610180006_profile_gender.sql','202610180007_custom_planning.sql','202610180008_workout_saving.sql'])await db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'))
 routineId=crypto.randomUUID();dayId=crypto.randomUUID();await db.query("insert into routines(id,user_id,name,goal) values($1,$2,'Keep this routine','strength')",[routineId,A]);await db.query("insert into routine_days(id,user_id,routine_id,name,position) values($1,$2,$3,'Keep this day',0)",[dayId,A,routineId]);version=(await db.query<{stamp:string}>('select updated_at::text as stamp from routines where id=$1',[routineId])).rows[0].stamp
 await save();await save(doc(),null,crypto.randomUUID(),true)
 const before=await snapshot()
 await db.exec(readFileSync(new URL('../migrations/202610180009_cancel_workout.sql',import.meta.url),'utf8'))
 expect(await snapshot()).toEqual(before)
},30000)
afterAll(async()=>{await db?.close()})
test('cancel removes exactly one autosaved draft, its sets/exercises/receipts, preserves plans and other workouts',async()=>{
 const d=doc(),other=doc();await save(d);await save(other)
 const plans=(await db.query('select to_jsonb(r) from routines r')).rows
 const days=(await db.query('select to_jsonb(d) from routine_days d')).rows
 expect(await cancel(d.id)).toEqual({id:d.id,status:'canceled'})
 for(const [table,column,id] of [['workout_sessions','id',d.id],['session_exercises','session_id',d.id],['workout_sets','session_exercise_id',d.exercises[0].id],['workout_save_receipts','session_id',d.id]])expect((await db.query(`select * from ${table} where ${column}=$1`,[id])).rows).toHaveLength(0)
 expect((await db.query('select * from workout_sessions where id=$1',[other.id])).rows).toHaveLength(1)
 expect((await db.query('select to_jsonb(r) from routines r')).rows).toEqual(plans)
 expect((await db.query('select to_jsonb(d) from routine_days d')).rows).toEqual(days)
 expect((await as(A,"select id from workout_sessions where status='completed' and id=$1",[d.id]))).toHaveLength(0)
})
test('cancellation retries are idempotent; old receipts and new NULL-revision saves cannot recreate canceled work',async()=>{
 const d=doc(),request=crypto.randomUUID(),initial=await save(d,null,request)
 expect(await cancel(d.id)).toEqual(await cancel(d.id))
 await expect(save(d,null,request)).rejects.toThrow(/canceled/)
 await expect(save(d,initial.revision)).rejects.toThrow(/canceled/)
 await expect(save(d,null,crypto.randomUUID(),true)).rejects.toThrow(/canceled/)
 expect((await db.query('select * from workout_cancellations where session_id=$1',[d.id])).rows).toHaveLength(1)
})
test('cancel before first autosave reserves the ID, also rejecting direct authenticated session inserts',async()=>{
 const d=doc();await cancel(d.id)
 await expect(save(d)).rejects.toThrow(/canceled/)
 await expect(as(A,"insert into workout_sessions(id,user_id,routine_name_snapshot,day_name_snapshot) values($1,$2,'Late direct save','Late session')",[d.id,A])).rejects.toThrow(/canceled/)
 expect((await db.query('select * from workout_sessions where id=$1',[d.id])).rows).toHaveLength(0)
})
test('completed snapshots and finish receipts are unchanged when cancellation is refused',async()=>{
 const d=doc(),request=crypto.randomUUID(),finished=await save(d,null,request,true),before=await snapshot()
 await expect(cancel(d.id)).rejects.toThrow(/Completed workouts cannot be canceled/)
 expect(await snapshot()).toEqual(before)
 expect(await save(d,null,request,true)).toEqual(finished)
 expect((await db.query('select * from workout_cancellations where session_id=$1',[d.id])).rows).toHaveLength(0)
})
test('anonymous, foreign-owner and stale-account requests cannot cancel another user workout',async()=>{
 const d=doc();await save(d);const before=await snapshot()
 await expect(cancel(d.id,B)).rejects.toThrow(/unavailable/)
 await expect(cancel(d.id,null)).rejects.toThrow()
 await expect(cancel(d.id,A,B)).rejects.toThrow(/correct account/)
 expect(await snapshot()).toEqual(before)
 expect((await db.query('select * from workout_cancellations where session_id=$1',[d.id])).rows).toHaveLength(0)
})
test('clients cannot forge/read/delete cancellation markers or bypass the save wrapper via its renamed helper',async()=>{
 const d=doc();await cancel(d.id)
 for(const sql of ['select * from workout_cancellations','delete from workout_cancellations','update workout_cancellations set cancelled_at=now()',`insert into workout_cancellations(user_id,session_id) values('${A}','${crypto.randomUUID()}')`])await expect(as(A,sql)).rejects.toThrow(/permission denied/)
 await expect(as(A,'select fitness_save_workout_v008($1::jsonb,null,$2,$3,false)',[JSON.stringify(d),crypto.randomUUID(),A])).rejects.toThrow(/permission denied/)
 await expect(as(null,'select fitness_cancel_workout($1,$2)',[d.id,A])).rejects.toThrow(/permission denied/)
 const procedures=(await db.query<{prosecdef:boolean;proconfig:string[]}>('select prosecdef,proconfig from pg_proc where proname in ($1,$2)',['fitness_cancel_workout','fitness_save_workout'])).rows
 expect(procedures.every(row=>row.prosecdef&&row.proconfig.includes('search_path=""'))).toBe(true)
})
test('a cleanup failure rolls back the marker, receipt deletions and all workout changes',async()=>{
 const d=doc();await save(d);const before=await snapshot()
 await db.exec(`create function public.test_refuse_delete() returns trigger language plpgsql as $$begin if old.id='${d.id}'::uuid then raise exception 'test cleanup failure';end if;return old;end;$$;create trigger test_delete_failure before delete on workout_sessions for each row execute function public.test_refuse_delete();`)
 await expect(cancel(d.id)).rejects.toThrow(/test cleanup failure/)
 expect(await snapshot()).toEqual(before)
 expect((await db.query('select * from workout_cancellations where session_id=$1',[d.id])).rows).toHaveLength(0)
 await db.exec('drop trigger test_delete_failure on workout_sessions;drop function public.test_refuse_delete()')
 await cancel(d.id)
})
