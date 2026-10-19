// Local-only native PostgreSQL verification. Never loads .env.local or Supabase.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const scratch = join(root, '.test-postgres')
await mkdir(scratch, { recursive: true })
const run = await mkdtemp(join(scratch, 'run-'))
const temp = join(run, 'tmp')
const socket = join(run, 'sock')
await mkdir(temp); await mkdir(socket)
// Keep the runner's initdb password file and sockets inside the project as well.
process.env.TMPDIR = temp
const { default: EmbeddedPostgres } = await import('embedded-postgres')
const cluster = new EmbeddedPostgres({
  databaseDir: join(run, 'data'), user: 'postgres', password: randomBytes(32).toString('hex'),
  port: 54791, persistent: true, createPostgresUser: false, authMethod: 'scram-sha-256',
  initdbFlags: ['--no-locale', '--encoding=UTF8'],
  postgresFlags: ['-k', socket, '-c', 'listen_addresses=', '-c', 'unix_socket_permissions=0700'],
  onLog: () => {}, onError: () => {},
})
const clients = []
let started = false
let currentTest = 'initialization'
const A = 'a0000000-0000-4000-8000-000000000001'
const B = 'b0000000-0000-4000-8000-000000000001'
const exercise = '20000000-0000-4000-8000-000000000001'
const document = {
  name: 'Concurrent test', goal: 'strength', assumptions: {},
  days: [{ name: 'Day', weekday: 1, exercises: [{ exercise_id: exercise, target_sets: 2, rep_min: 8, rep_max: 12, rest_seconds: 120, notes: '' }] }],
}
async function connect() {
  const client = cluster.getPgClient('postgres', socket)
  await client.connect(); clients.push(client)
  await client.query("set statement_timeout='10s'; set idle_in_transaction_session_timeout='20s'")
  return client
}
async function begin(client, owner = A) {
  await client.query('begin isolation level read committed; set local role authenticated')
  await client.query("select set_config('request.jwt.claim.sub',$1,true)", [owner])
}
async function save(client, id, value = document, request = randomUUID(), stamp = null, v2 = false) {
  const { rows } = await client.query(`select public.fitness_save_routine${v2 ? '_v2' : ''}($1,$2::jsonb,$3,$4::timestamptz) as id`, [id, JSON.stringify(value), request, stamp])
  return rows[0].id
}
async function stamp(client, id) {
  return (await client.query('select updated_at::text as value from public.routines where id=$1', [id])).rows[0].value
}
async function waiting(admin, client, kind) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const { rows } = await admin.query('select wait_event_type,wait_event from pg_stat_activity where pid=$1', [client.processID])
    if (rows[0]?.wait_event_type === 'Lock' && (!kind || rows[0]?.wait_event === kind)) return
    await new Promise(done => setTimeout(done, 20))
  }
  throw new Error('Expected a real blocked PostgreSQL connection')
}
function pass(name) { console.log(`PASS ${name}`) }
try {
  await cluster.initialise(); await cluster.start(); started = true
  const [admin, first, second, other] = await Promise.all([connect(), connect(), connect(), connect()])
  await admin.query(`create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`)
  await admin.query('insert into auth.users values ($1),($2)', [A, B])
  for (const file of ['202610170001_schema.sql','202610170002_reference_seed.sql','202610170003_routine_save.sql','202610180004_profile_frequency.sql','202610180005_catalog_expansion.sql','202610180006_profile_gender.sql','202610180007_custom_planning.sql','202610180008_workout_saving.sql','202610180009_cancel_workout.sql']) {
    await admin.query(await readFile(resolve(root, 'supabase/migrations', file), 'utf8'))
  }
  console.log(`Local PostgreSQL ${String((await admin.query('show server_version')).rows[0].server_version).split(' ')[0]}; separate connections; Supabase is not used.`)

  currentTest = 'simultaneous identical saves'
  const id = randomUUID(), request = randomUUID()
  await begin(first); assert.equal(await save(first, id, document, request), id)
  await begin(second)
  const identical = save(second, id, document, request).then(value => ({ value }), error => ({ error }))
  await waiting(admin, second, 'advisory')
  // A different user is not blocked by A's account-wide lock.
  await begin(other, B)
  await save(other, randomUUID())
  await other.query('rollback')
  await first.query('commit')
  const repeated = await identical
  assert.ok(!repeated.error); assert.equal(repeated.value, id)
  await second.query('commit')
  assert.equal((await admin.query('select count(*)::int as n from public.routines where id=$1', [id])).rows[0].n, 1)
  pass('simultaneous identical saves create one plan; another user is not blocked')

  currentTest = 'competing edits'
  const expected = await stamp(admin, id)
  await begin(first); await save(first, id, { ...document, name: 'Winning edit' }, randomUUID(), expected)
  await begin(second)
  const competing = save(second, id, { ...document, name: 'Stale edit' }, randomUUID(), expected).then(value => ({ value }), error => ({ error }))
  await waiting(admin, second, 'advisory'); await first.query('commit')
  assert.equal((await competing).error?.code, '40001')
  await second.query('rollback')
  assert.equal((await admin.query('select name from public.routines where id=$1', [id])).rows[0].name, 'Winning edit')
  pass('competing edits reject the stale editor instead of overwriting')

  currentTest = 'old retry after a later edit'
  await begin(first); assert.equal(await save(first, id, document, request), id); await first.query('commit')
  assert.equal((await admin.query('select name from public.routines where id=$1', [id])).rows[0].name, 'Winning edit')
  pass('older retries acknowledge success without undoing newer edits')

  currentTest = 'concurrent archive'
  const archiveExpected = await stamp(admin, id)
  await begin(first)
  await first.query('update public.routines set archived_at=clock_timestamp() where id=$1', [id])
  await begin(second)
  const afterArchive = save(second, id, document, randomUUID(), archiveExpected).then(value => ({ value }), error => ({ error }))
  await waiting(admin, second); await first.query('commit')
  assert.equal((await afterArchive).error?.code, '22023')
  await second.query('rollback')
  assert.ok((await admin.query('select archived_at from public.routines where id=$1', [id])).rows[0].archived_at)
  pass('concurrent archival is respected; save cannot reactivate the plan')

  currentTest = 'session creation before editing'
  const historyId = randomUUID(), sessionId = randomUUID()
  await begin(first); await save(first, historyId); await first.query('commit')
  const oldDay = (await admin.query('select id from public.routine_days where routine_id=$1', [historyId])).rows[0].id
  const historyStamp = await stamp(admin, historyId)
  await begin(first)
  await first.query('insert into public.workout_sessions(id,user_id,routine_id,routine_day_id) values ($1,$2,$3,$4)', [sessionId, A, historyId, oldDay])
  await begin(second)
  const versioned = save(second, historyId, { ...document, name: 'New version' }, randomUUID(), historyStamp).then(value => ({ value }), error => ({ error }))
  await waiting(admin, second); await first.query('commit')
  const versionResult = await versioned
  assert.ok(!versionResult.error); assert.notEqual(versionResult.value, historyId)
  await second.query('commit')
  assert.equal((await admin.query('select routine_day_id from public.workout_sessions where id=$1', [sessionId])).rows[0].routine_day_id, oldDay)
  assert.equal((await admin.query('select count(*)::int as n from public.routine_days where id=$1', [oldDay])).rows[0].n, 1)
  pass('a simultaneously committed workout forces versioning and keeps its original day')

  currentTest = 'session creation after editing begins'
  const updateId = randomUUID()
  await begin(first); await save(first, updateId); await first.query('commit')
  const replacedDay = (await admin.query('select id from public.routine_days where routine_id=$1', [updateId])).rows[0].id
  const updateStamp = await stamp(admin, updateId)
  await begin(first); await save(first, updateId, { ...document, name: 'Updated plan' }, randomUUID(), updateStamp)
  await begin(second)
  const staleSession = second.query('insert into public.workout_sessions(user_id,routine_id,routine_day_id) values ($1,$2,$3)', [A, updateId, replacedDay]).then(value => ({ value }), error => ({ error }))
  await waiting(admin, second); await first.query('commit')
  assert.equal((await staleSession).error?.code, '23503')
  await second.query('rollback')
  pass('a workout referencing a concurrently replaced day fails safely and can reload the plan')
  const planned = { ...document, days: [{ name: 'Session', weekday: null, exercises: [{ exercise_id: exercise, custom_exercise_name: null, planning_mode: 'per_set', target_sets: null, rep_min: null, rep_max: null, rest_seconds: null, notes: '', planned_sets: [] }] }] }
  currentTest = 'v2 concurrent identical saves and competing edits'
  const v2id=randomUUID(),v2request=randomUUID()
  await begin(first);await save(first,v2id,planned,v2request,null,true)
  await begin(second)
  const v2retry=save(second,v2id,planned,v2request,null,true).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit')
  assert.equal((await v2retry).value,v2id);await second.query('commit')
  const v2stamp=await stamp(admin,v2id)
  await begin(first);await save(first,v2id,{...planned,name:'V2 winner'},randomUUID(),v2stamp,true)
  await begin(second)
  const v2stale=save(second,v2id,planned,randomUUID(),v2stamp,true).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit')
  assert.equal((await v2stale).error?.code,'40001');await second.query('rollback')
  pass('v2 retries create one routine and competing edits reject a stale timestamp')

  currentTest='parent mode update before planned target insert'
  const parentId=(await admin.query('select e.id from routine_exercises e join routine_days d on d.id=e.routine_day_id where d.routine_id=$1',[v2id])).rows[0].id
  await begin(first)
  await first.query("update routine_exercises set planning_mode='legacy',target_sets=2,rep_min=8,rep_max=12,rest_seconds=120 where id=$1",[parentId])
  await begin(second)
  const targetInsert=second.query("insert into routine_planned_sets(routine_exercise_id,position,entered_unit) values ($1,0,'kg')",[parentId]).then(value=>({value}),error=>({error}))
  await waiting(admin,second);await first.query('commit')
  assert.equal((await targetInsert).error?.code,'23514');await second.query('rollback')
  pass('target insert waits for parent mode update then rejects the legacy parent')

  currentTest='planned target insert before parent mode update'
  await begin(first);await first.query("update routine_exercises set planning_mode='per_set',target_sets=null,rep_min=null,rep_max=null,rest_seconds=null where id=$1",[parentId]);await first.query('commit')
  await begin(first);await first.query("insert into routine_planned_sets(routine_exercise_id,position,entered_unit) values ($1,0,'kg')",[parentId])
  await begin(second)
  const modeUpdate=second.query("update routine_exercises set planning_mode='legacy',target_sets=2,rep_min=8,rep_max=12,rest_seconds=120 where id=$1",[parentId]).then(value=>({value}),error=>({error}))
  await waiting(admin,second);await first.query('commit')
  assert.equal((await modeUpdate).error?.code,'23514');await second.query('rollback')
  pass('parent mode update waits for target insert then rejects incompatible legacy mode')
  currentTest='delete confirmation races with a save'
  const deletionId=randomUUID()
  await begin(first);await save(first,deletionId,planned,randomUUID(),null,true);await first.query('commit')
  const deletionStamp=await stamp(admin,deletionId)
  await begin(first);await save(first,deletionId,{...planned,name:'Edited after delete confirmation'},randomUUID(),deletionStamp,true)
  await begin(second)
  const staleDelete=second.query('delete from routines where user_id=$1 and id=$2 and updated_at=$3::timestamptz returning id',[A,deletionId,deletionStamp]).then(value=>({value}),error=>({error}))
  await waiting(admin,second);await first.query('commit')
  const deletedAfterSave=await staleDelete
  assert.ok(!deletedAfterSave.error);assert.equal(deletedAfterSave.value.rows.length,0);await second.query('commit')
  assert.equal((await admin.query('select name from routines where id=$1',[deletionId])).rows[0].name,'Edited after delete confirmation')
  pass('stale permanent-delete confirmation waits for editing then affects zero rows')

  currentTest='workout commits before deletion'
  const protectedId=randomUUID()
  await begin(first);await save(first,protectedId,planned,randomUUID(),null,true);await first.query('commit')
  const protectedDay=(await admin.query('select id from routine_days where routine_id=$1',[protectedId])).rows[0].id
  await begin(first);await first.query('insert into workout_sessions(user_id,routine_id,routine_day_id) values ($1,$2,$3)',[A,protectedId,protectedDay])
  await begin(second)
  const historyDelete=second.query('delete from routines where user_id=$1 and id=$2 returning id',[A,protectedId]).then(value=>({value}),error=>({error}))
  await waiting(admin,second);await first.query('commit')
  assert.equal((await historyDelete).error?.code,'23503');await second.query('rollback')
  assert.equal((await admin.query('select count(*)::int as n from workout_sessions where routine_id=$1',[protectedId])).rows[0].n,1)
  assert.equal((await admin.query('select count(*)::int as n from routine_days where id=$1',[protectedDay])).rows[0].n,1)
  pass('concurrently committed workout blocks deletion and preserves its routine and day')

  currentTest='deletion commits before workout'
  const removableId=randomUUID()
  await begin(first);await save(first,removableId,planned,randomUUID(),null,true);await first.query('commit')
  const removableDay=(await admin.query('select id from routine_days where routine_id=$1',[removableId])).rows[0].id
  await begin(first);await first.query('delete from routines where user_id=$1 and id=$2',[A,removableId])
  await begin(second)
  const staleWorkout=second.query('insert into workout_sessions(user_id,routine_id,routine_day_id) values ($1,$2,$3)',[A,removableId,removableDay]).then(value=>({value}),error=>({error}))
  await waiting(admin,second);await first.query('commit')
  assert.equal((await staleWorkout).error?.code,'23503');await second.query('rollback')
  assert.equal((await admin.query('select count(*)::int as n from workout_sessions where routine_id=$1',[removableId])).rows[0].n,0)
  pass('a workout started after permanent deletion fails safely without orphan history')
  currentTest='workout autosave retries and stale writers'
  const workoutRoutine=randomUUID()
  await begin(first);await save(first,workoutRoutine);await first.query('commit')
  const workoutDay=(await admin.query('select id from routine_days where routine_id=$1',[workoutRoutine])).rows[0].id
  const workoutVersion=await stamp(admin,workoutRoutine)
  const workoutDocument={id:randomUUID(),routineId:workoutRoutine,routineDayId:workoutDay,routineVersion:workoutVersion,routineName:'Snapshot',sessionName:'Session',dayPosition:0,startedAt:'2026-01-01',exercises:[{id:randomUUID(),exerciseId:null,name:'Custom hip thrust',sourceName:'RDLs',loadingMode:null,target:{},skipped:false,removed:false,sets:[{id:randomUUID(),reps:10,weight:180,unit:'lb'}]}]}
  const writeWorkout=async(client,value,revision,request,finish=false)=>(await client.query('select fitness_save_workout($1::jsonb,$2,$3,$4,$5) as result',[JSON.stringify(value),revision,request,A,finish])).rows[0].result
  const workoutRequest=randomUUID()
  await begin(first);const initialWorkout=await writeWorkout(first,workoutDocument,null,workoutRequest)
  await begin(second);const repeatedWorkout=writeWorkout(second,workoutDocument,null,workoutRequest).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit');assert.deepEqual((await repeatedWorkout).value,initialWorkout);await second.query('commit')
  assert.equal((await admin.query('select count(*)::int as n from workout_sets where session_exercise_id=$1',[workoutDocument.exercises[0].id])).rows[0].n,1)
  pass('simultaneous workout start retries create one session and stable set ID')

  const updatedWorkout=structuredClone(workoutDocument);updatedWorkout.exercises[0].sets[0].reps=9
  await begin(first);const updatedResult=await writeWorkout(first,updatedWorkout,initialWorkout.revision,randomUUID())
  await begin(second);const staleWorkoutEdit=writeWorkout(second,workoutDocument,initialWorkout.revision,randomUUID()).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit');assert.equal((await staleWorkoutEdit).error?.code,'40001');await second.query('rollback')
  pass('competing workout autosaves reject stale revisions without overwriting actual sets')

  currentTest='single workout finish under concurrent retries'
  const finishRequest=randomUUID()
  await begin(first);const finishedResult=await writeWorkout(first,updatedWorkout,updatedResult.revision,finishRequest,true)
  await begin(second);const repeatedFinish=writeWorkout(second,updatedWorkout,updatedResult.revision,finishRequest,true).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit');assert.deepEqual((await repeatedFinish).value,finishedResult);await second.query('commit')
  await begin(first);await assert.rejects(writeWorkout(first,updatedWorkout,finishedResult.revision,randomUUID(),true),error=>error.code==='55000');await first.query('rollback')
  pass('concurrent finish retries acknowledge one completion; new submissions cannot rewrite it')

  currentTest='direct actual set editing races with finishing'
  const secondWorkout=structuredClone(workoutDocument);secondWorkout.id=randomUUID();secondWorkout.exercises[0].id=randomUUID();secondWorkout.exercises[0].sets[0].id=randomUUID()
  await begin(first);const secondInitial=await writeWorkout(first,secondWorkout,null,randomUUID());await first.query('commit')
  await begin(first);await first.query('update workout_sets set reps=7 where id=$1',[secondWorkout.exercises[0].sets[0].id])
  await begin(second);const staleFinish=writeWorkout(second,secondWorkout,secondInitial.revision,randomUUID(),true).then(value=>({value}),error=>({error}))
  await waiting(admin,second);await first.query('commit');assert.equal((await staleFinish).error?.code,'40001');await second.query('rollback')
  assert.equal((await admin.query('select reps from workout_sets where id=$1',[secondWorkout.exercises[0].sets[0].id])).rows[0].reps,7)
  pass('direct set edits lock the workout and invalidate a concurrently finishing stale snapshot')

  currentTest='routine version preserves actual workouts and source day'
  await begin(first);const routineVersion=await save(first,workoutRoutine,{...document,name:'New routine version'},randomUUID(),workoutVersion);await first.query('commit')
  assert.notEqual(routineVersion,workoutRoutine)
  assert.equal((await admin.query('select routine_day_id from workout_sessions where id=$1',[workoutDocument.id])).rows[0].routine_day_id,workoutDay)
  assert.equal((await admin.query('select reps from workout_sets where id=$1',[workoutDocument.exercises[0].sets[0].id])).rows[0].reps,9)
  pass('routine versioning preserves completed actuals, draft progress and the original source day')
  currentTest='direct receipt forgery cannot interfere with legitimate finish retries'
  await begin(first)
  await assert.rejects(first.query("insert into workout_save_receipts(user_id,request_id,session_id,payload_hash,result_revision,result_status) values($1,$2,$3,'forged',0,'draft')",[A,randomUUID(),workoutDocument.id]),error=>error.code==='42501')
  await first.query('rollback')
  await begin(second);assert.deepEqual(await writeWorkout(second,updatedWorkout,updatedResult.revision,finishRequest,true),finishedResult);await second.query('commit')
  pass('authenticated receipt forgery is denied; the original finish receipt still retries correctly')
  const cancellationDocument=()=>{
    const value=structuredClone(workoutDocument)
    value.id=randomUUID();value.routineId=null;value.routineDayId=null;value.routineVersion=null
    value.exercises[0].id=randomUUID();value.exercises[0].sets[0].id=randomUUID()
    return value
  }
  const cancelWorkout=async(client,sid)=>(await client.query('select fitness_cancel_workout($1,$2) as result',[sid,A])).rows[0].result
  currentTest='in-flight first autosave commits before cancellation'
  const savedThenCanceled=cancellationDocument(),savedToken=randomUUID()
  await begin(first);await writeWorkout(first,savedThenCanceled,null,savedToken)
  await begin(second);const cancelAfterSave=cancelWorkout(second,savedThenCanceled.id).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit');assert.equal((await cancelAfterSave).value.status,'canceled');await second.query('commit')
  assert.equal((await admin.query('select count(*)::int as n from workout_sessions where id=$1',[savedThenCanceled.id])).rows[0].n,0)
  assert.equal((await admin.query('select count(*)::int as n from workout_sets where session_exercise_id=$1',[savedThenCanceled.exercises[0].id])).rows[0].n,0)
  await begin(first);await assert.rejects(writeWorkout(first,savedThenCanceled,null,savedToken),error=>error.code==='55000');await first.query('rollback')
  pass('cancellation waits for an in-flight autosave, deletes its actuals and rejects its retry')

  currentTest='cancellation commits before delayed first autosave'
  const canceledBeforeSave=cancellationDocument()
  await begin(first);await cancelWorkout(first,canceledBeforeSave.id)
  await begin(second);const lateFirstSave=writeWorkout(second,canceledBeforeSave,null,randomUUID()).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit');assert.equal((await lateFirstSave).error?.code,'55000');await second.query('rollback')
  assert.equal((await admin.query('select count(*)::int as n from workout_sessions where id=$1',[canceledBeforeSave.id])).rows[0].n,0)
  pass('a delayed first autosave cannot recreate a canceled workout')

  currentTest='cancellation wins against concurrent finish'
  const cancelWins=cancellationDocument()
  await begin(first);const cancelInitial=await writeWorkout(first,cancelWins,null,randomUUID());await first.query('commit')
  await begin(first);await cancelWorkout(first,cancelWins.id)
  await begin(second);const losingFinish=writeWorkout(second,cancelWins,cancelInitial.revision,randomUUID(),true).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit');assert.equal((await losingFinish).error?.code,'55000');await second.query('rollback')
  pass('cancellation wins atomically against a concurrent finish without creating history')

  currentTest='finish wins against concurrent cancellation'
  const finishWins=cancellationDocument(),winningFinishToken=randomUUID()
  await begin(first);const finishInitial=await writeWorkout(first,finishWins,null,randomUUID());await first.query('commit')
  await begin(first);await writeWorkout(first,finishWins,finishInitial.revision,winningFinishToken,true)
  await begin(second);const losingCancel=cancelWorkout(second,finishWins.id).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit');assert.equal((await losingCancel).error?.code,'55000');await second.query('rollback')
  assert.equal((await admin.query('select status from workout_sessions where id=$1',[finishWins.id])).rows[0].status,'completed')
  assert.equal((await admin.query('select count(*)::int as n from workout_sets where session_exercise_id=$1',[finishWins.exercises[0].id])).rows[0].n,1)
  pass('a committed finish refuses cancellation and preserves its exact actual sets')

  currentTest='direct insert waits for pending cancellation marker'
  const directId=randomUUID()
  await begin(first);await cancelWorkout(first,directId)
  await begin(second);const lateDirectInsert=second.query("insert into workout_sessions(id,user_id,routine_name_snapshot,day_name_snapshot) values($1,$2,'Late insert','Session')",[directId,A]).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit');assert.equal((await lateDirectInsert).error?.code,'55000');await second.query('rollback')
  pass('direct authenticated inserts serialize with cancellation and cannot bypass its marker')
  currentTest='upgrade populated database to routine management 010'
  await admin.query(await readFile(resolve(root,'supabase/migrations/202610180010_routine_management.sql'),'utf8'))
  const managePlan=async(client,id,action,version)=>(await client.query('select fitness_manage_routine($1,$2,$3::timestamptz,$4) as result',[id,action,version,A])).rows[0].result
  const newManagedPlan=async()=>{
    const id=randomUUID(),request=randomUUID()
    await begin(first);await save(first,id,document,request);await first.query('commit')
    return {id,request,version:await stamp(admin,id),day:(await admin.query('select id from routine_days where routine_id=$1',[id])).rows[0].id}
  }
  const managedWorkout=p=>{
    const value=cancellationDocument();value.routineId=p.id;value.routineDayId=p.day;value.routineVersion=p.version;return value
  }
  currentTest='concurrent restores keep one existing routine'
  const restored=await newManagedPlan()
  await begin(first);await managePlan(first,restored.id,'archive',restored.version);await first.query('commit')
  const archivedVersion=await stamp(admin,restored.id)
  await begin(first);const firstRestore=await managePlan(first,restored.id,'restore',archivedVersion)
  await begin(second);const repeatedRestore=managePlan(second,restored.id,'restore',archivedVersion).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit');assert.deepEqual((await repeatedRestore).value,firstRestore);await second.query('commit')
  assert.equal((await admin.query('select count(*)::int as n from routines where id=$1 and archived_at is null',[restored.id])).rows[0].n,1)
  pass('concurrent restores reactivate the same routine without duplicates')

  currentTest='restore invalidates a pending delete confirmation'
  await begin(first);await managePlan(first,restored.id,'archive',await stamp(admin,restored.id));await first.query('commit')
  const staleArchivedVersion=await stamp(admin,restored.id)
  await begin(first);await managePlan(first,restored.id,'restore',staleArchivedVersion)
  await begin(second);const staleManagementDelete=managePlan(second,restored.id,'delete',staleArchivedVersion).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit');assert.equal((await staleManagementDelete).error?.code,'40001');await second.query('rollback')
  pass('restore invalidates a concurrent stale permanent-delete confirmation')

  currentTest='delete wins against a restore without recreating a routine'
  const deletedArchived=await newManagedPlan()
  await begin(first);await managePlan(first,deletedArchived.id,'archive',deletedArchived.version);await first.query('commit')
  const deletionVersion=await stamp(admin,deletedArchived.id)
  await begin(first);await managePlan(first,deletedArchived.id,'delete',deletionVersion)
  await begin(second);const missingRestore=managePlan(second,deletedArchived.id,'restore',deletionVersion).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit');assert.equal((await missingRestore).error?.code,'42501');await second.query('rollback')
  pass('a concurrent restore cannot recreate a permanently deleted archived routine')

  currentTest='started draft blocks concurrently deleting its source'
  const startedPlan=await newManagedPlan(),startedDoc=managedWorkout(startedPlan)
  await begin(first);await writeWorkout(first,startedDoc,null,randomUUID())
  await begin(second);const blockedPlanDelete=managePlan(second,startedPlan.id,'delete',startedPlan.version).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit');assert.equal((await blockedPlanDelete).error?.code,'55000');await second.query('rollback')
  assert.equal((await admin.query('select count(*)::int as n from workout_sets where session_exercise_id=$1',[startedDoc.exercises[0].id])).rows[0].n,1)
  pass('a concurrently started unfinished workout blocks routine deletion without losing actuals')

  currentTest='routine deletion wins against a delayed workout start'
  const removedSource=await newManagedPlan(),lateWorkout=managedWorkout(removedSource)
  await begin(first);await managePlan(first,removedSource.id,'delete',removedSource.version)
  await begin(second);const failedStart=writeWorkout(second,lateWorkout,null,randomUUID()).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit');assert.equal((await failedStart).error?.code,'42501');await second.query('rollback')
  assert.equal((await admin.query('select count(*)::int as n from workout_sessions where id=$1',[lateWorkout.id])).rows[0].n,0)
  pass('routine deletion rejects a delayed workout start safely without orphan records')

  currentTest='committed finish survives concurrent routine deletion'
  const finishPlan=await newManagedPlan(),finishedDoc=managedWorkout(finishPlan)
  await begin(first);const finishedInitial=await writeWorkout(first,finishedDoc,null,randomUUID());await first.query('commit')
  await begin(first);await writeWorkout(first,finishedDoc,finishedInitial.revision,randomUUID(),true)
  const completedSnapshot=(await first.query("select to_jsonb(s)-array['routine_id','routine_day_id'] as row from workout_sessions s where id=$1",[finishedDoc.id])).rows
  const performedSnapshot=(await first.query('select * from workout_sets where session_exercise_id=$1',[finishedDoc.exercises[0].id])).rows
  await begin(second);const deleteAfterFinish=managePlan(second,finishPlan.id,'delete',finishPlan.version).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit');assert.equal((await deleteAfterFinish).value.status,'deleted');await second.query('commit')
  assert.deepEqual((await admin.query("select to_jsonb(s)-array['routine_id','routine_day_id'] as row from workout_sessions s where id=$1",[finishedDoc.id])).rows,completedSnapshot)
  assert.deepEqual((await admin.query('select * from workout_sets where session_exercise_id=$1',[finishedDoc.exercises[0].id])).rows,performedSnapshot)
  pass('finishing before routine deletion preserves exact completed snapshots, revisions and actual sets')

  currentTest='blocked deletion cannot discard an in-flight finish'
  const blockedPlan=await newManagedPlan(),blockedDoc=managedWorkout(blockedPlan)
  await begin(first);const blockedInitial=await writeWorkout(first,blockedDoc,null,randomUUID());await first.query('commit')
  await begin(first);await assert.rejects(managePlan(first,blockedPlan.id,'delete',blockedPlan.version),error=>error.code==='55000')
  // An errored statement rolls back its subtransaction locks; the independent
  // finish must still succeed and the failed deletion leaves its source intact.
  await begin(second);const finishingAfterBlock=await writeWorkout(second,blockedDoc,blockedInitial.revision,randomUUID(),true);await second.query('commit');await first.query('rollback')
  assert.equal(finishingAfterBlock.status,'completed')
  assert.equal((await admin.query('select count(*)::int as n from routines where id=$1',[blockedPlan.id])).rows[0].n,1)
  pass('a refused deletion leaves routine and workout available for explicit finishing')

  currentTest='deleted routine cannot be recreated by an in-flight original create retry'
  const retryPlan=await newManagedPlan()
  await begin(first);await managePlan(first,retryPlan.id,'delete',retryPlan.version)
  await begin(second);const createRetry=save(second,retryPlan.id,document,retryPlan.request).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit');assert.equal((await createRetry).error?.code,'55000');await second.query('rollback')
  pass('permanent deletion blocks a delayed original routine-save retry from resurrecting the plan')

  currentTest='archive wins against a stale routine edit'
  const archivePlan=await newManagedPlan()
  await begin(first);await managePlan(first,archivePlan.id,'archive',archivePlan.version)
  await begin(second);const staleArchivedEdit=save(second,archivePlan.id,{...document,name:'Stale change'},randomUUID(),archivePlan.version).then(value=>({value}),error=>({error}))
  await waiting(admin,second,'advisory');await first.query('commit');assert.equal((await staleArchivedEdit).error?.code,'22023');await second.query('rollback')
  pass('a concurrent stale edit cannot unarchive or overwrite an archived routine')
  currentTest='history security under real restricted session authorization'
  await admin.query(`create role fitness_history_member nologin inherit;grant authenticated to fitness_history_member;
    create role fitness_history_outsider nologin;
    create role fitness_review_session nologin inherit;
    grant authenticated,anon,fitness_history_member,fitness_history_outsider to fitness_review_session;`)
  const reviewer=await connect()
  // SET SESSION AUTHORIZATION makes this a genuinely restricted session: its
  // SET ROLE checks cannot use the original postgres session user's membership.
  await reviewer.query('set session authorization fitness_review_session')
  const reviewQuery=async(role,owner,sql,params=[],spoofFlags=false)=>{
    await reviewer.query('begin');await reviewer.query(`set local role ${role}`)
    try {
      await reviewer.query("select set_config('request.jwt.claim.sub',$1,true)",[owner??''])
      if(spoofFlags)await reviewer.query("select set_config('fitness.routine_delete','true',true),set_config('fitness.deletion_xid',pg_current_xact_id()::text,true)")
      const result=(await reviewer.query(sql,params)).rows;await reviewer.query('commit');return result
    } catch(error){await reviewer.query('rollback');throw error}
  }
  const securedPlan=await newManagedPlan(),securedDoc=managedWorkout(securedPlan)
  await begin(first);await writeWorkout(first,securedDoc,null,randomUUID(),true);await first.query('commit')
  const securedSnapshot=async()=>({
    root:(await admin.query("select to_jsonb(s)-array['routine_id','routine_day_id'] as row from workout_sessions s where id=$1",[securedDoc.id])).rows,
    exercises:(await admin.query('select * from session_exercises where session_id=$1 order by position',[securedDoc.id])).rows,
    sets:(await admin.query('select s.* from workout_sets s join session_exercises e on e.id=s.session_exercise_id where e.session_id=$1 order by e.position,s.set_number',[securedDoc.id])).rows,
    receipts:(await admin.query('select * from workout_save_receipts where session_id=$1 order by request_id',[securedDoc.id])).rows,
  })
  const immutableHistory=await securedSnapshot()
  const roles=['authenticated','fitness_history_member']
  for(const role of roles){
    const identity=await reviewQuery(role,A,'select current_user,session_user')
    assert.equal(identity[0].current_user,role);assert.equal(identity[0].session_user,'fitness_review_session')
    for(const change of ["routine_id=null,routine_day_id=null","routine_day_id=null","routine_name_snapshot='Forged'","day_name_snapshot='Forged'","started_at=started_at-interval '1 day'","completed_at=completed_at+interval '1 day'","status='draft',completed_at=null"])
      await assert.rejects(reviewQuery(role,A,`update workout_sessions set ${change} where id=$1 returning id`,[securedDoc.id]),error=>error.code==='55000')
    await assert.rejects(reviewQuery(role,A,'delete from workout_sessions where id=$1',[securedDoc.id]),error=>error.code==='55000')
    await assert.rejects(reviewQuery(role,A,"update session_exercises set exercise_name_snapshot='Forged' where id=$1",[securedDoc.exercises[0].id]),error=>error.code==='55000')
    await assert.rejects(reviewQuery(role,A,"update workout_sets set reps=99,entered_load=900,entered_unit='kg' where id=$1",[securedDoc.exercises[0].sets[0].id]),error=>error.code==='55000')
    await assert.rejects(reviewQuery(role,A,'update workout_sessions set routine_id=null,routine_day_id=null where id=$1',[securedDoc.id],true),error=>error.code==='55000')
  }
  await assert.rejects(reviewQuery('authenticated',A,'set local role postgres'),error=>error.code==='42501')
  assert.deepEqual(await securedSnapshot(),immutableHistory)
  pass('restricted authenticated and inherited roles cannot edit, detach, reopen or delete completed history')

  currentTest='unauthorized and foreign-account management attempts'
  for(const role of ['anon','fitness_history_outsider']) {
    await assert.rejects(reviewQuery(role,A,'select fitness_manage_routine($1,$2,$3::timestamptz,$4)',[securedPlan.id,'delete',securedPlan.version,A]),error=>error.code==='42501')
    await assert.rejects(reviewQuery(role,A,'update workout_sessions set routine_id=null,routine_day_id=null where id=$1',[securedDoc.id]),error=>error.code==='42501')
  }
  for(const action of ['archive','restore','delete'])await assert.rejects(reviewQuery('fitness_history_member',B,'select fitness_manage_routine($1,$2,$3::timestamptz,$4)',[securedPlan.id,action,securedPlan.version,B]),error=>error.code==='42501')
  await assert.rejects(reviewQuery('authenticated',B,'select fitness_manage_routine($1,$2,$3::timestamptz,$4)',[securedPlan.id,'delete',securedPlan.version,A]),error=>error.code==='42501')
  await assert.rejects(reviewQuery('authenticated',null,'select fitness_manage_routine($1,$2,$3::timestamptz,$4)',[securedPlan.id,'delete',securedPlan.version,A]),error=>error.code==='42501')
  assert.deepEqual(await reviewQuery('fitness_history_member',B,'update workout_sessions set routine_id=null,routine_day_id=null where id=$1 returning id',[securedDoc.id]),[])
  assert.deepEqual(await securedSnapshot(),immutableHistory)
  pass('anonymous, unauthorized and foreign-owner roles cannot manage or detach another account history')

  currentTest='deletion authorization cannot be forged and unrelated privileged writers are denied'
  await admin.query("create function public.test_unrelated_history_writer(sid uuid) returns void language sql security definer set search_path='' as $$update public.workout_sessions set routine_id=null,routine_day_id=null where id=sid$$;revoke all on function public.test_unrelated_history_writer(uuid) from public;grant execute on function public.test_unrelated_history_writer(uuid) to authenticated")
  for(const role of roles){
    await assert.rejects(reviewQuery(role,A,'insert into routine_deletions(user_id,routine_id,deleted_version,deletion_xid) values($1,$2,$3::timestamptz,pg_current_xact_id())',[A,securedPlan.id,securedPlan.version]),error=>error.code==='42501')
    await assert.rejects(reviewQuery(role,A,'update routine_deletions set deletion_xid=pg_current_xact_id()'),error=>error.code==='42501')
    await assert.rejects(reviewQuery(role,A,'select test_unrelated_history_writer($1)',[securedDoc.id]),error=>error.code==='55000')
  }
  assert.deepEqual(await securedSnapshot(),immutableHistory)
  pass('private detachment authorization cannot be forged and unrelated SECURITY DEFINER writes are rejected')

  currentTest='old transaction authorization is not reusable'
  await admin.query('insert into routine_deletions(user_id,routine_id,deleted_version) values($1,$2,$3::timestamptz)',[A,securedPlan.id,securedPlan.version])
  await assert.rejects(reviewQuery('authenticated',A,'select test_unrelated_history_writer($1)',[securedDoc.id]),error=>error.code==='55000')
  assert.deepEqual(await securedSnapshot(),immutableHistory)
  await admin.query('delete from routine_deletions where user_id=$1 and routine_id=$2',[A,securedPlan.id])
  await admin.query('drop function public.test_unrelated_history_writer(uuid)')
  pass('committed deletion markers cannot authorize a different transaction to detach history')

  currentTest='authorized archive restore delete preserve history under restricted real roles'
  await reviewQuery('authenticated',A,'select fitness_manage_routine($1,$2,$3::timestamptz,$4)',[securedPlan.id,'archive',securedPlan.version,A])
  assert.deepEqual(await securedSnapshot(),immutableHistory)
  await reviewQuery('fitness_history_member',A,'select fitness_manage_routine($1,$2,$3::timestamptz,$4)',[securedPlan.id,'restore',await stamp(admin,securedPlan.id),A])
  assert.deepEqual(await securedSnapshot(),immutableHistory)
  await reviewQuery('authenticated',A,'select fitness_manage_routine($1,$2,$3::timestamptz,$4)',[securedPlan.id,'delete',await stamp(admin,securedPlan.id),A])
  assert.deepEqual(await securedSnapshot(),immutableHistory)
  assert.deepEqual((await admin.query('select routine_id,routine_day_id from workout_sessions where id=$1',[securedDoc.id])).rows,[{routine_id:null,routine_day_id:null}])
  await assert.rejects(reviewQuery('fitness_history_member',A,"update workout_sessions set day_name_snapshot='Forged after delete' where id=$1",[securedDoc.id]),error=>error.code==='55000')
  pass('authorized Archive Restore and Delete preserve every completed snapshot and actual value')

  currentTest='completed history survives administrative accidents but account cleanup still works'
  await assert.rejects(admin.query("update workout_sessions set routine_name_snapshot='Accidental edit' where id=$1",[securedDoc.id]),error=>error.code==='55000')
  await assert.rejects(admin.query('delete from workout_sessions where id=$1',[securedDoc.id]),error=>error.code==='55000')
  const C='c0000000-0000-4000-8000-000000000001',cleanupPlan=randomUUID()
  await admin.query('insert into auth.users values($1)',[C])
  await begin(first,C);await save(first,cleanupPlan);await first.query('commit')
  const cleanupSource={id:cleanupPlan,day:(await admin.query('select id from routine_days where routine_id=$1',[cleanupPlan])).rows[0].id,version:await stamp(admin,cleanupPlan)}
  const cleanupDoc=managedWorkout(cleanupSource)
  await begin(first,C);await first.query('select fitness_save_workout($1::jsonb,null,$2,$3,true)',[JSON.stringify(cleanupDoc),randomUUID(),C]);await first.query('commit')
  await admin.query('delete from auth.users where id=$1',[C])
  assert.equal((await admin.query('select count(*)::int as n from workout_sessions where id=$1',[cleanupDoc.id])).rows[0].n,0)
  assert.deepEqual(await securedSnapshot(),immutableHistory)
  pass('ordinary privileged history edits are blocked while deliberate auth-account cleanup remains valid')
  currentTest='RLS-hidden auth rows do not grant maintenance deletion rights'
  await admin.query(`create role fitness_history_limited nologin;
    grant fitness_history_limited to fitness_review_session;
    grant usage on schema public,auth to fitness_history_limited;
    grant select on auth.users to fitness_history_limited;
    grant select,delete on workout_sessions to fitness_history_limited;
    create policy review_limited_read on workout_sessions for select to fitness_history_limited using(auth.uid()=user_id);
    create policy review_limited_delete on workout_sessions for delete to fitness_history_limited using(auth.uid()=user_id);
    alter table auth.users enable row level security;alter table auth.users force row level security;`)
  try {
    assert.deepEqual(await reviewQuery('fitness_history_limited',A,'select id from auth.users where id=$1',[A]),[])
    assert.deepEqual(await reviewQuery('fitness_history_limited',A,'select id from workout_sessions where id=$1',[securedDoc.id]),[{id:securedDoc.id}])
    await assert.rejects(reviewQuery('fitness_history_limited',A,'delete from workout_sessions where id=$1 returning id',[securedDoc.id]),error=>error.code==='55000')
    assert.deepEqual(await securedSnapshot(),immutableHistory)
  } finally {await admin.query('alter table auth.users disable row level security;alter table auth.users no force row level security;drop policy review_limited_read on workout_sessions;drop policy review_limited_delete on workout_sessions')}
  pass('RLS hiding the auth-account row cannot grant a custom role permission to delete completed history')
  console.log('39 multi-connection/security scenarios passed. Local test data will be removed. No hosted access or credentials used.')
} catch (error) {
  // Never output native runner configuration or generated passwords.
  console.error(`FAIL ${currentTest}${error?.code ? ` (code ${error.code})` : ''}. Hosted database was not accessed.`)
  process.exitCode = 1
} finally {
  await Promise.allSettled(clients.map(client => client.end()))
  if (started) await cluster.stop()
  await rm(run, { recursive: true, force: true })
}

// All clients/processes are closed above. The embedded runner's beforeExit hook
// forces exit code 0, so explicitly preserve test failures after cleanup.
process.exit(process.exitCode ?? 0)
