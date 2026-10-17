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
async function save(client, id, value = document, request = randomUUID(), stamp = null) {
  const { rows } = await client.query('select public.fitness_save_routine($1,$2::jsonb,$3,$4::timestamptz) as id', [id, JSON.stringify(value), request, stamp])
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
  for (const file of ['202610170001_schema.sql','202610170002_reference_seed.sql','202610170003_routine_save.sql']) {
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
  console.log('6 multi-connection scenarios passed. Local test data will be removed. No hosted access or credentials used.')
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
