// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, expect, test } from 'vitest'
import { historyWorkout, type HistoryRow } from '../../src/features/workouts/workoutHistoryRepository'
let db:PGlite
const A='a0000000-0000-4000-8000-000000000001',B='b0000000-0000-4000-8000-000000000001'
const legacyRoutine=crypto.randomUUID(),legacySession=crypto.randomUUID()
async function as(owner:string|null,sql:string,params:unknown[]=[]) {
 await db.exec('begin')
 try {await db.exec(`set local role ${owner?'authenticated':'anon'}`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[owner??'']);const result=await db.query<Record<string,unknown>>(sql,params);await db.exec('commit');return result.rows}
 catch(error){await db.exec('rollback');throw error}
}
const planDocument=()=>({name:'Personal recommendation copy',goal:'strength',origin_template_key:'synthetic-template',recommendation_version:'rules-3.0',assumptions:{origin:'recommendation'},days:[{name:'Glutes and Hammies',weekday:null,exercises:[{exercise_id:null,custom_exercise_name:'Custom hip thrust',planning_mode:'per_set',target_sets:null,rep_min:null,rep_max:null,rest_seconds:null,notes:'Planned only',planned_sets:[{reps:8,load_kg:60,entered_unit:'kg'}]}]}]})
async function stamp(id:string){return (await db.query<{stamp:string}>('select updated_at::text as stamp from routines where id=$1',[id])).rows[0].stamp}
async function plan(owner=A){const id=crypto.randomUUID(),request=crypto.randomUUID(),document=planDocument();await as(owner,'select fitness_save_routine_v2($1,$2::jsonb,$3,null)',[id,JSON.stringify(document),request]);const day=(await db.query<{id:string}>('select id from routine_days where routine_id=$1',[id])).rows[0].id;return {id,day,request,document,version:await stamp(id)}}
async function manage(id:string,action:string,version:string,owner:string|null=A,expected=owner??A){return (await as(owner,'select fitness_manage_routine($1,$2,$3::timestamptz,$4) as result',[id,action,version,expected]))[0].result}
function workout(p:{id:string;day:string;version:string}) {return {id:crypto.randomUUID(),routineId:p.id,routineDayId:p.day,routineVersion:p.version,routineName:'Client name ignored',sessionName:'Client name ignored',dayPosition:0,startedAt:'2026-10-18T14:00:00Z',exercises:[
 {id:crypto.randomUUID(),exerciseId:null,name:'Actual hip thrust',loadingMode:'external',sourceName:'Hip Thrust',target:{reps:8,weight:60},skipped:false,removed:false,sets:[{id:crypto.randomUUID(),reps:10,weight:180,unit:'lb'},{id:crypto.randomUUID(),reps:8,weight:60,unit:'kg'}]},
 {id:crypto.randomUUID(),exerciseId:null,name:'Extra calf raises',loadingMode:'bodyweight',sourceName:null,target:{},skipped:false,removed:false,sets:[{id:crypto.randomUUID(),reps:15,weight:null,unit:'kg'}]},
 {id:crypto.randomUUID(),exerciseId:null,name:'Skipped RDLs',loadingMode:'external',sourceName:null,target:{},skipped:true,removed:false,sets:[]},
]}}
async function saveWorkout(d:ReturnType<typeof workout>,finish=true,revision:number|null=null,request=crypto.randomUUID()){return(await as(A,'select fitness_save_workout($1::jsonb,$2,$3,$4,$5) as result',[JSON.stringify(d),revision,request,A,finish]))[0].result as {revision:number;status:string}}
async function snapshots(){const result:Record<string,unknown>={};for(const table of ['profiles','routines','routine_days','routine_exercises','routine_planned_sets','exercises','evidence_sources','exercise_alternatives','workout_sessions','session_exercises','workout_sets','workout_save_receipts','workout_cancellations'])result[table]=(await db.query(`select to_jsonb(t) from ${table} t order by to_jsonb(t)::text`)).rows;return result}
async function actuals(id:string){const root=(await db.query<Record<string,unknown>>('select * from workout_sessions where id=$1',[id])).rows[0];delete root.routine_id;delete root.routine_day_id;return {root,exercises:(await db.query('select * from session_exercises where session_id=$1 order by position',[id])).rows,sets:(await db.query('select s.* from workout_sets s join session_exercises e on e.id=s.session_exercise_id where e.session_id=$1 order by e.position,s.set_number',[id])).rows,receipts:(await db.query('select * from workout_save_receipts where session_id=$1 order by request_id',[id])).rows}}
async function history(id:string){return historyWorkout((await as(A,`select s.id,s.started_at::text,s.day_name_snapshot,s.routine_name_snapshot,
 coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('workout_sets',coalesce((select jsonb_agg(to_jsonb(t)) from workout_sets t where t.session_exercise_id=e.id),'[]'::jsonb))) from session_exercises e where e.session_id=s.id),'[]'::jsonb) as session_exercises
 from workout_sessions s where s.id=$1 and s.status='completed'`,[id]))[0] as unknown as HistoryRow)}
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon nologin;create role authenticated nologin;create role fitness_history_member nologin inherit;grant authenticated to fitness_history_member;create role fitness_history_outsider nologin;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`)
 await db.query('insert into auth.users values($1),($2)',[A,B])
 for(const file of ['202610170001_schema.sql','202610170002_reference_seed.sql','202610170003_routine_save.sql','202610180004_profile_frequency.sql','202610180005_catalog_expansion.sql','202610180006_profile_gender.sql','202610180007_custom_planning.sql'])await db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'))
 await db.query("insert into routines(id,user_id,name,goal) values($1,$2,'Legacy source','strength')",[legacyRoutine,A])
 await db.query("insert into workout_sessions(id,user_id,routine_id,routine_name_snapshot,day_name_snapshot,status,started_at,completed_at) values($1,$2,$3,'Original legacy routine','Original legacy session','completed','2025-01-01','2025-01-02')",[legacySession,A,legacyRoutine])
 const eid=crypto.randomUUID();await db.query("insert into session_exercises(id,user_id,session_id,exercise_id,exercise_name_snapshot,loading_mode_snapshot,position) values($1,$2,$3,'20000000-0000-4000-8000-000000000004','Legacy actual','external',0)",[eid,A,legacySession])
 await db.query("insert into workout_sets(user_id,session_exercise_id,set_number,reps,load_kg,entered_unit,completed) values($1,$2,1,150,123.4567,'lb',true)",[A,eid])
 for(const file of ['202610180008_workout_saving.sql','202610180009_cancel_workout.sql'])await db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'))
 const p=await plan();await saveWorkout(workout(p));await saveWorkout(workout(p),false)
 const before=await snapshots();await db.exec(readFileSync(new URL('../migrations/202610180010_routine_management.sql',import.meta.url),'utf8'));expect(await snapshots()).toEqual(before)
},30000)
afterAll(async()=>{await db?.close()})
test('archive and restore preserve the same ID, plans, completed history and draft progress without duplicates',async()=>{
 const p=await plan(),completed=workout(p),draft=workout(p);await saveWorkout(completed);await saveWorkout(draft,false)
 const originals=[await actuals(completed.id),await actuals(draft.id)],targets=(await db.query('select * from routine_planned_sets where routine_exercise_id in (select id from routine_exercises where routine_day_id=$1)',[p.day])).rows
 expect(await manage(p.id,'archive',p.version)).toEqual({id:p.id,status:'archived'})
 const archivedStamp=await stamp(p.id);expect(archivedStamp).not.toBe(p.version)
 expect(await manage(p.id,'archive',p.version)).toEqual({id:p.id,status:'archived'});expect(await stamp(p.id)).toBe(archivedStamp)
 expect(await manage(p.id,'restore',archivedStamp)).toEqual({id:p.id,status:'active'})
 const restoredStamp=await stamp(p.id);await manage(p.id,'restore',archivedStamp);expect(await stamp(p.id)).toBe(restoredStamp)
 expect((await db.query('select * from routines where id=$1 and archived_at is null',[p.id])).rows).toHaveLength(1)
 expect((await db.query('select id from routine_days where routine_id=$1',[p.id])).rows).toEqual([{id:p.day}])
 expect((await db.query('select * from routine_planned_sets where routine_exercise_id in (select id from routine_exercises where routine_day_id=$1)',[p.day])).rows).toEqual(targets)
 expect([await actuals(completed.id),await actuals(draft.id)]).toEqual(originals)
})
test.each([false,true])('permanent deletion of archived=%s preserves exact completed actuals, snapshots, receipts and read-only history',async archived=>{
 const p=await plan(),d=workout(p),request=crypto.randomUUID(),finished=await saveWorkout(d,true,null,request)
 const before=await actuals(d.id),rendered=await history(d.id)
 if(archived)await manage(p.id,'archive',p.version)
 const version=await stamp(p.id)
 expect(await manage(p.id,'delete',version)).toEqual({id:p.id,status:'deleted'})
 expect((await db.query('select routine_id,routine_day_id from workout_sessions where id=$1',[d.id])).rows).toEqual([{routine_id:null,routine_day_id:null}])
 expect(await actuals(d.id)).toEqual(before);expect(await history(d.id)).toEqual(rendered)
 expect(rendered).toMatchObject({routineName:'Personal recommendation copy',sessionName:'Glutes and Hammies',exerciseCount:2,setCount:3,exercises:[{name:'Actual hip thrust',sourceName:'Hip Thrust',sets:[{weight:180,unit:'lb',reps:10},{weight:60,unit:'kg',reps:8}]},{name:'Extra calf raises'},{disposition:'skipped'}]})
 for(const [table,column] of [['routines','id'],['routine_days','routine_id']])expect((await db.query(`select * from ${table} where ${column}=$1`,[p.id])).rows).toHaveLength(0)
 expect((await db.query('select * from routine_exercises where routine_day_id=$1',[p.day])).rows).toHaveLength(0)
 expect(await saveWorkout(d,true,null,request)).toEqual(finished)
 await expect(as(A,'update workout_sessions set routine_name_snapshot=$1 where id=$2',['Altered',d.id])).rejects.toThrow(/read-only/)
 await expect(as(A,'update workout_sessions set routine_id=null,routine_day_id=null where id=$1 returning id',[d.id])).rejects.toThrow(/read-only/)
 await expect(as(A,'update workout_sets set reps=99 where id=$1',[d.exercises[0].sets[0].id])).rejects.toThrow(/read-only/)
 await expect(as(A,'delete from workout_sessions where id=$1',[d.id])).rejects.toThrow(/read-only/)
 await expect(as(A,'delete from session_exercises where session_id=$1',[d.id])).rejects.toThrow(/read-only/)
 await expect(as(A,'delete from workout_sets where id=$1',[d.exercises[0].sets[0].id])).rejects.toThrow(/read-only/)
 await expect(saveWorkout(d,true,finished.revision)).rejects.toThrow(/read-only/)
 expect(await actuals(d.id)).toEqual(before)
 expect(await manage(p.id,'delete',version)).toEqual({id:p.id,status:'deleted'})
})
test('legacy completed values detach without revalidation, rewriting timestamps/revision or changing original units',async()=>{
 const before=await actuals(legacySession),display=await history(legacySession)
 await manage(legacyRoutine,'delete',await stamp(legacyRoutine))
 expect(await actuals(legacySession)).toEqual(before);expect(await history(legacySession)).toEqual(display)
 expect(display.exercises[0].sets[0]).toMatchObject({reps:150,unit:'lb'})
})
test.each(['finish','cancel'])('unfinished workouts block the entire deletion until explicitly resolved by %s',async resolution=>{
 const p=await plan(),done=workout(p),draft=workout(p);await saveWorkout(done);const result=await saveWorkout(draft,false)
 const before=await snapshots();await expect(manage(p.id,'delete',p.version)).rejects.toThrow(/Finish or cancel unfinished/)
 expect(await snapshots()).toEqual(before);expect((await db.query('select * from routine_deletions where routine_id=$1',[p.id])).rows).toHaveLength(0)
 if(resolution==='finish')await saveWorkout(draft,true,result.revision)
 else await as(A,'select fitness_cancel_workout($1,$2)',[draft.id,A])
 const original=await actuals(done.id);await manage(p.id,'delete',p.version);expect(await actuals(done.id)).toEqual(original)
})
test('ownership, expected account identity, anonymous access, private markers and direct-delete bypasses are enforced',async()=>{
 const p=await plan(),before=await snapshots()
 for(const action of ['archive','restore','delete'])await expect(manage(p.id,action,p.version,B)).rejects.toThrow(/unavailable/)
 await expect(manage(p.id,'delete',p.version,A,B)).rejects.toThrow(/correct account/)
 await expect(manage(p.id,'delete',p.version,null)).rejects.toThrow()
 await expect(as(A,'delete from routines where id=$1',[p.id])).rejects.toThrow(/permission denied/)
 for(const sql of ['select * from routine_deletions','delete from routine_deletions',`insert into routine_deletions(user_id,routine_id,deleted_version) values('${A}','${p.id}',now())`])await expect(as(A,sql)).rejects.toThrow(/permission denied/)
 expect(await snapshots()).toEqual(before)
})
test('deleted routine IDs cannot be resurrected by original v2 create retries, new requests or direct inserts/identity changes',async()=>{
 const p=await plan();await manage(p.id,'delete',p.version)
 for(const request of [p.request,crypto.randomUUID()])await expect(as(A,'select fitness_save_routine_v2($1,$2::jsonb,$3,null)',[p.id,JSON.stringify(p.document),request])).rejects.toThrow(/permanently deleted/)
 await expect(as(A,"insert into routines(id,user_id,name,goal) values($1,$2,'Recreated','strength')",[p.id,A])).rejects.toThrow(/permanently deleted/)
 const other=await plan();await expect(as(A,'update routines set id=$1 where id=$2',[p.id,other.id])).rejects.toThrow(/identity cannot change/)
 await expect(as(A,'update routines set user_id=$1 where id=$2',[B,other.id])).rejects.toThrow(/identity cannot change/)
 await expect(manage(p.id,'restore',p.version)).rejects.toThrow(/unavailable/)
})
test('legacy v1 create retries cannot recreate a deleted routine; unrelated routines/catalog/templates remain untouched',async()=>{
 const own=await plan(),foreign=await plan(B),id=crypto.randomUUID(),request=crypto.randomUUID()
 const document={...planDocument(),days:[{name:'A',weekday:null,exercises:[{exercise_id:'20000000-0000-4000-8000-000000000001',target_sets:2,rep_min:8,rep_max:12,rest_seconds:120,notes:''}]}]}
 await as(A,'select fitness_save_routine($1,$2::jsonb,$3,null)',[id,JSON.stringify(document),request])
 const before=(await db.query('select * from routines where id=any($1::uuid[]) order by id',[[own.id,foreign.id]])).rows,catalog=(await db.query('select * from exercises order by id')).rows
 await manage(id,'delete',await stamp(id))
 await expect(as(A,'select fitness_save_routine($1,$2::jsonb,$3,null)',[id,JSON.stringify(document),request])).rejects.toThrow(/permanently deleted/)
 expect((await db.query('select * from routines where id=any($1::uuid[]) order by id',[[own.id,foreign.id]])).rows).toEqual(before)
 expect((await db.query('select * from exercises order by id')).rows).toEqual(catalog)
})
test('stale confirmations cannot delete/edit state after an archive or restore transition',async()=>{
 const p=await plan();await manage(p.id,'archive',p.version);const archived=await stamp(p.id)
 await expect(manage(p.id,'delete',p.version)).rejects.toThrow(/changed/)
 await manage(p.id,'restore',archived)
 await expect(manage(p.id,'archive',p.version)).rejects.toThrow(/changed/)
 expect((await db.query('select archived_at from routines where id=$1',[p.id])).rows[0]).toEqual({archived_at:null})
})
test('a late deletion failure rolls back source detachments, markers and planned data atomically',async()=>{
 const p=await plan(),d=workout(p);await saveWorkout(d);const before=await snapshots()
 await db.exec(`create function public.test_refuse_routine_delete() returns trigger language plpgsql as $$begin if old.id='${p.id}'::uuid then raise exception 'test delete failure';end if;return old;end;$$;create trigger test_delete_failure before delete on routines for each row execute function public.test_refuse_routine_delete();`)
 await expect(manage(p.id,'delete',p.version)).rejects.toThrow(/test delete failure/)
 expect(await snapshots()).toEqual(before);expect((await db.query('select * from routine_deletions where routine_id=$1',[p.id])).rows).toHaveLength(0)
 await db.exec('drop trigger test_delete_failure on routines;drop function public.test_refuse_routine_delete()')
})

test('deleting one routine leaves another account completed workout and all actual child data unchanged',async()=>{
 const other=await plan(B),foreign=workout(other)
 await as(B,'select fitness_save_workout($1::jsonb,null,$2,$3,true)',[JSON.stringify(foreign),crypto.randomUUID(),B])
 const own=await plan(),before=await actuals(foreign.id)
 await manage(own.id,'delete',own.version)
 expect(await actuals(foreign.id)).toEqual(before)
 expect((await db.query('select routine_id,routine_day_id from workout_sessions where id=$1',[foreign.id])).rows).toEqual([{routine_id:other.id,routine_day_id:other.day}])
 expect(await as(A,'select id from workout_sessions where id=$1',[foreign.id])).toHaveLength(0)
})

// Final security review: actual PostgreSQL role changes, never app mocks.
async function asRole(role:string,owner:string|null,sql:string,params:unknown[]=[],spoofFlags=false) {
 await db.exec('begin')
 try {await db.exec(`set local role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[owner??'']);if(spoofFlags)await db.query("select set_config('fitness.routine_delete','true',true),set_config('fitness.deletion_xid',pg_current_xact_id()::text,true)");const rows=(await db.query<Record<string,unknown>>(sql,params)).rows;await db.exec('commit');return rows}
 catch(error){await db.exec('rollback');throw error}
}
test('an inherited authenticated role cannot directly detach completed source links',async()=>{
 const p=await plan(),d=workout(p);await saveWorkout(d);const before=await actuals(d.id)
 await expect(asRole('fitness_history_member',A,'update workout_sessions set routine_id=null,routine_day_id=null where id=$1 returning id',[d.id])).rejects.toThrow(/read-only/)
 expect((await db.query('select routine_id,routine_day_id from workout_sessions where id=$1',[d.id])).rows).toEqual([{routine_id:p.id,routine_day_id:p.day}]);expect(await actuals(d.id)).toEqual(before)
})
test('an inherited authenticated role cannot edit completed names or dates through direct SQL',async()=>{
 const p=await plan(),d=workout(p);await saveWorkout(d);const before=await actuals(d.id)
 await expect(asRole('fitness_history_member',A,"update workout_sessions set routine_name_snapshot='Forged history',started_at=started_at-interval '1 day' where id=$1 returning id",[d.id])).rejects.toThrow(/read-only/)
 expect(await actuals(d.id)).toEqual(before)
})
test('a separate privileged SQL path cannot detach completed history without a deletion authorization',async()=>{
 const p=await plan(),d=workout(p);await saveWorkout(d)
 // Simulate an unrelated trusted writer running with the migration owner's
 // table privileges. It must not gain source-detachment permission implicitly.
 await db.exec(`create function public.test_unrelated_history_writer(sid uuid) returns void language sql security definer set search_path='' as $$update public.workout_sessions set routine_id=null,routine_day_id=null where id=sid$$;revoke all on function public.test_unrelated_history_writer(uuid) from public;grant execute on function public.test_unrelated_history_writer(uuid) to authenticated;`)
 await expect(as(A,'select test_unrelated_history_writer($1)',[d.id])).rejects.toThrow(/read-only/)
 expect((await db.query('select routine_id from workout_sessions where id=$1',[d.id])).rows).toEqual([{routine_id:p.id}])
 await db.exec('drop function public.test_unrelated_history_writer(uuid)')
})

test('direct root/child mutations, role claims and fake deletion flags cannot alter attached completed history',async()=>{
 const p=await plan(),d=workout(p);await saveWorkout(d);const before=await actuals(d.id)
 const rootChanges=["routine_id=null,routine_day_id=null","routine_day_id=null","routine_name_snapshot='Forged'","day_name_snapshot='Forged'","started_at=started_at-interval '1 day'","completed_at=completed_at+interval '1 day'","status='draft',completed_at=null","revision=revision+1"]
 for(const role of ['authenticated','fitness_history_member']) {
  for(const change of rootChanges)await expect(asRole(role,A,`update workout_sessions set ${change} where id=$1 returning id`,[d.id])).rejects.toThrow(/read-only/)
  await expect(asRole(role,A,"update session_exercises set exercise_name_snapshot='Forged replacement' where id=$1",[d.exercises[0].id])).rejects.toThrow(/read-only/)
  await expect(asRole(role,A,"update workout_sets set reps=99,entered_load=999,entered_unit='kg' where id=$1",[d.exercises[0].sets[0].id])).rejects.toThrow(/read-only/)
  for(const [table,column,id] of [['workout_sessions','id',d.id],['session_exercises','session_id',d.id],['workout_sets','session_exercise_id',d.exercises[0].id]])await expect(asRole(role,A,`delete from ${table} where ${column}=$1`,[id])).rejects.toThrow(/read-only/)
  await expect(asRole(role,A,'update workout_sessions set routine_id=null,routine_day_id=null where id=$1',[d.id],true)).rejects.toThrow(/read-only/)
 }
 expect(await actuals(d.id)).toEqual(before)
 expect((await db.query('select routine_id,routine_day_id from workout_sessions where id=$1',[d.id])).rows).toEqual([{routine_id:p.id,routine_day_id:p.day}])
})
test('private detachment authorization cannot be forged or reused from another transaction',async()=>{
 const p=await plan(),d=workout(p);await saveWorkout(d);const before=await actuals(d.id)
 for(const role of ['authenticated','fitness_history_member']) {
  await expect(asRole(role,A,'insert into routine_deletions(user_id,routine_id,deleted_version,deletion_xid) values($1,$2,$3::timestamptz,pg_current_xact_id())',[A,p.id,p.version])).rejects.toThrow(/permission denied/)
  await expect(asRole(role,A,'update routine_deletions set deletion_xid=pg_current_xact_id()')).rejects.toThrow(/permission denied/)
 }
 // Administrator fixture inserts a committed marker without deleting the plan;
 // even this cannot authorize detachment from a subsequent transaction.
 await db.query('insert into routine_deletions(user_id,routine_id,deleted_version) values($1,$2,$3::timestamptz)',[A,p.id,p.version])
 await expect(asRole('postgres',A,'update workout_sessions set routine_id=null,routine_day_id=null where id=$1',[d.id])).rejects.toThrow(/read-only/)
 expect(await actuals(d.id)).toEqual(before)
 await db.query('delete from routine_deletions where user_id=$1 and routine_id=$2',[A,p.id])
})
test('authorization is scoped to the owner/routine and cannot carry extra history changes',async()=>{
 const p=await plan(),other=await plan(),d=workout(p);await saveWorkout(d);const before=await actuals(d.id)
 await db.exec(`create function public.test_scope_writer(marker_owner uuid,marker_routine uuid,marker_version timestamptz,target_session uuid,tamper boolean) returns void language plpgsql security definer set search_path='' as $$begin insert into public.routine_deletions(user_id,routine_id,deleted_version) values(marker_owner,marker_routine,marker_version);if tamper then update public.workout_sessions set routine_id=null,routine_day_id=null,day_name_snapshot='Forged' where id=target_session;else update public.workout_sessions set routine_id=null,routine_day_id=null where id=target_session;end if;end;$$;revoke all on function public.test_scope_writer(uuid,uuid,timestamptz,uuid,boolean) from public;grant execute on function public.test_scope_writer(uuid,uuid,timestamptz,uuid,boolean) to authenticated;`)
 for(const [owner,routine,tamper] of [[A,other.id,false],[B,p.id,false],[A,p.id,true]])await expect(as(A,'select test_scope_writer($1,$2,$3::timestamptz,$4,$5)',[owner,routine,p.version,d.id,tamper])).rejects.toThrow(/read-only/)
 expect(await actuals(d.id)).toEqual(before)
 expect((await db.query('select routine_id,routine_day_id from workout_sessions where id=$1',[d.id])).rows).toEqual([{routine_id:p.id,routine_day_id:p.day}])
 await db.exec('drop function public.test_scope_writer(uuid,uuid,timestamptz,uuid,boolean)')
})
test('unauthorized roles and account spoofing cannot call management; inherited users remain owner-scoped',async()=>{
 const p=await plan(),d=workout(p);await saveWorkout(d);const before=await actuals(d.id)
 for(const role of ['anon','fitness_history_outsider']) {
  await expect(asRole(role,A,'select fitness_manage_routine($1,$2,$3::timestamptz,$4)',[p.id,'delete',p.version,A])).rejects.toThrow(/permission denied/)
  await expect(asRole(role,A,'update workout_sessions set routine_id=null,routine_day_id=null where id=$1',[d.id])).rejects.toThrow(/permission denied/)
 }
 for(const action of ['archive','restore','delete'])await expect(asRole('fitness_history_member',B,'select fitness_manage_routine($1,$2,$3::timestamptz,$4)',[p.id,action,p.version,B])).rejects.toThrow(/unavailable/)
 await expect(asRole('fitness_history_member',B,'select fitness_manage_routine($1,$2,$3::timestamptz,$4)',[p.id,'delete',p.version,A])).rejects.toThrow(/correct account/)
 await expect(asRole('fitness_history_member',null,'select fitness_manage_routine($1,$2,$3::timestamptz,$4)',[p.id,'delete',p.version,A])).rejects.toThrow(/correct account/)
 expect(await actuals(d.id)).toEqual(before)
})
test('privileged direct edits/deletes still cannot erase history while legitimate auth-account cleanup remains possible',async()=>{
 const p=await plan(),d=workout(p);await saveWorkout(d);const before=await actuals(d.id)
 await expect(db.query("update workout_sessions set routine_name_snapshot='Admin accident' where id=$1",[d.id])).rejects.toThrow(/read-only/)
 await expect(db.query('delete from workout_sessions where id=$1',[d.id])).rejects.toThrow(/read-only/)
 expect(await actuals(d.id)).toEqual(before)
 const C='c0000000-0000-4000-8000-000000000001';await db.query('insert into auth.users values($1)',[C])
 const own=await plan(C),actual=workout(own)
 await as(C,'select fitness_save_workout($1::jsonb,null,$2,$3,true)',[JSON.stringify(actual),crypto.randomUUID(),C])
 await db.query('delete from auth.users where id=$1',[C])
 expect((await db.query('select id from workout_sessions where id=$1',[actual.id])).rows).toHaveLength(0)
 expect(await actuals(d.id)).toEqual(before)
})

test('an RLS-hidden auth account is not mistaken for an authorized account-cleanup cascade',async()=>{
 const p=await plan(),d=workout(p);await saveWorkout(d);const before=await actuals(d.id)
 await db.exec(`create role fitness_history_limited nologin;grant usage on schema public,auth to fitness_history_limited;grant select on auth.users to fitness_history_limited;grant select,delete on workout_sessions to fitness_history_limited;create policy review_limited_read on workout_sessions for select to fitness_history_limited using(auth.uid()=user_id);create policy review_limited_delete on workout_sessions for delete to fitness_history_limited using(auth.uid()=user_id);alter table auth.users enable row level security;alter table auth.users force row level security;`)
 try {
  expect(await asRole('fitness_history_limited',A,'select id from auth.users where id=$1',[A])).toHaveLength(0)
  expect(await asRole('fitness_history_limited',A,'select id from workout_sessions where id=$1',[d.id])).toEqual([{id:d.id}])
  await expect(asRole('fitness_history_limited',A,'delete from workout_sessions where id=$1 returning id',[d.id])).rejects.toThrow(/read-only/)
  expect(await actuals(d.id)).toEqual(before)
 } finally {await db.exec('alter table auth.users disable row level security;alter table auth.users no force row level security;drop policy review_limited_read on workout_sessions;drop policy review_limited_delete on workout_sessions')}
})
