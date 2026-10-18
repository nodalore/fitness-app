import { afterEach, expect, test, vi } from 'vitest'
import { WorkoutSync, type Recovery } from './WorkoutSync'
import { WorkoutConflict, type WorkoutRepository } from './workoutRepository'
import { createWorkout, emptyActualSet, type WorkoutDraft } from './workoutDraft'
import { testCatalog, testDocument } from '../routines/testFixtures'
const draft = () => createWorkout({ id: crypto.randomUUID(), dayIds: [crypto.randomUUID()], updated_at: '2026-10-18T00:00:00Z', archived_at: null, document: testDocument }, 0, testCatalog)
function setup(repository: Partial<WorkoutRepository> = {}) {
  const records = new Map<string, Recovery>()
  const cache = { read: () => structuredClone([...records.values()]), put: (entry: Recovery) => { records.set(entry.draft.id, structuredClone(entry)) }, remove: (id: string) => { records.delete(id) } }
  const repo = { load: vi.fn().mockResolvedValue([]), save: vi.fn().mockResolvedValue({ revision: 5, status: 'draft' }), ...repository }
  const sync = new WorkoutSync(repo, cache)
  return { sync, cache, repo, records }
}
afterEach(() => vi.useRealTimers())
test('debounced autosave coalesces edits using stable set/session IDs and removes clean recovery data', async () => {
  vi.useFakeTimers(); const { sync, repo, records } = setup(); await sync.load()
  const d = draft(); sync.start(d)
  const latest = structuredClone(d); latest.exercises[0].sets = [{ ...emptyActualSet('lb'), reps: 8, loadKg: 20 }]; sync.change(latest)
  expect(records.size).toBe(1); await vi.advanceTimersByTimeAsync(401)
  expect(repo.save).toHaveBeenCalledTimes(1)
  expect(vi.mocked(repo.save).mock.calls[0][0]).toEqual(latest)
  expect(sync.getSnapshot().status).toBe('saved'); expect(records.size).toBe(0); sync.close()
})
test('edits arriving during a slow request queue one latest snapshot and use its confirmed revision', async () => {
  let resolve!: (value: { revision: number; status: 'draft' }) => void
  const save = vi.fn().mockImplementationOnce(() => new Promise(done => { resolve = done })).mockResolvedValue({ revision: 10, status: 'draft' })
  const { sync } = setup({ save }); const d = draft(); sync.start(d); const running = sync.flush()
  const latest = structuredClone(d); latest.exercises[0].sets.push({ ...emptyActualSet('kg'), reps: 10, loadKg: 0 }); sync.change(latest)
  const newer = structuredClone(latest); newer.exercises[0].sets[0].reps = 9; sync.change(newer)
  resolve({ revision: 4, status: 'draft' }); await running
  expect(save).toHaveBeenCalledTimes(2); expect(save.mock.calls[1][0]).toEqual(newer); expect(save.mock.calls[1][1]).toBe(4)
  expect(sync.getSnapshot().draft).toEqual(newer); sync.close()
})
test('lost-response retry preserves original payload/token then saves queued edits with a new token', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('Response lost')).mockResolvedValue({ revision: 2, status: 'draft' })
  const { sync, records } = setup({ save }); const d = draft(); sync.start(d); await sync.flush()
  expect(sync.getSnapshot().status).toBe('error'); const newer = structuredClone(d); newer.sessionName = 'Changed locally'; sync.change(newer)
  await sync.flush(); expect(save).toHaveBeenCalledTimes(3)
  expect(save.mock.calls[1]).toEqual(save.mock.calls[0]); expect(save.mock.calls[2][2]).not.toBe(save.mock.calls[0][2]); expect(save.mock.calls[2][0]).toEqual(newer)
  expect(records.size).toBe(0); sync.close()
})
test('refresh resumes pending request and latest draft, while closed instances never drain another request', async () => {
  const { sync, cache, repo } = setup({ save: vi.fn().mockRejectedValue(new Error('Offline')) }); const d = draft(); sync.start(d); await sync.flush(); const pending = cache.read()[0].pending!
  sync.close(); const nextRepo = { ...repo, save: vi.fn().mockResolvedValue({ revision: 8, status: 'draft' as const }) }; const restored = new WorkoutSync(nextRepo, cache)
  await restored.load(); restored.resume(restored.getSnapshot().resumable[0]); expect(restored.getSnapshot().draft).toEqual(d)
  await restored.flush(); expect(nextRepo.save).toHaveBeenCalledWith(pending.draft, pending.revision, pending.request, false); restored.close()
})
test('finish is single-flight and lost completion responses retry exactly once without reopening editing', async () => {
  const save = vi.fn().mockResolvedValueOnce({ revision: 3, status: 'draft' }).mockRejectedValueOnce(new Error('Timeout')).mockResolvedValue({ revision: 9, status: 'completed' })
  const { sync, records } = setup({ save }); const d = draft(); sync.start(d); await sync.flush(); await sync.flush(true)
  expect(sync.getSnapshot().finishing).toBe(true); sync.change({ ...d, sessionName: 'Should not change' }); expect(sync.getSnapshot().draft?.sessionName).toBe(d.sessionName)
  await sync.flush(); expect(save.mock.calls[2]).toEqual(save.mock.calls[1]); expect(sync.getSnapshot().draft).toBeNull(); expect(sync.getSnapshot().finished).toEqual(d); expect(records.size).toBe(0)
  await sync.flush(true); expect(save).toHaveBeenCalledTimes(3); sync.close()
})
test('stale saves stop automatic retries and explicit reload obtains server data', async () => {
  const d = draft(), remote = { ...d, sessionName: 'Server version' }
  const save = vi.fn().mockRejectedValue(new WorkoutConflict('Conflict'))
  const { sync, records } = setup({ save, load: vi.fn().mockResolvedValue([{ draft: remote, revision: 15 }]) }); sync.start(d); await sync.flush()
  expect(sync.getSnapshot().status).toBe('conflict'); await sync.flush(); expect(save).toHaveBeenCalledTimes(1); expect(records.size).toBe(1)
  await sync.reload(); expect(sync.getSnapshot().draft).toEqual(remote); expect(sync.getSnapshot().status).toBe('saved'); expect(records.size).toBe(0); sync.close()
})
test('a failed resume-list load is reported, and changing selection flushes before showing resume choices', async () => {
  const { sync, repo } = setup({ load: vi.fn().mockRejectedValueOnce(new Error('Load failed')).mockResolvedValue([]) }); await sync.load(); expect(sync.getSnapshot().error).toBe('Load failed')
  await sync.load(); const d = draft(); sync.start(d); await sync.leave()
  expect(repo.save).toHaveBeenCalledTimes(1); expect(sync.getSnapshot().draft).toBeNull(); sync.close()
})
test('unmount while saving preserves recovery and does not issue queued writes for an old account', async () => {
  let resolve!: (value: { revision: number; status: 'draft' }) => void
  const save = vi.fn().mockImplementation(() => new Promise(done => { resolve = done }))
  const { sync, records } = setup({ save }); const d = draft(); sync.start(d); const running = sync.flush(); sync.change({ ...d, sessionName: 'Queued' }); sync.close(); resolve({ revision: 7, status: 'draft' }); await running
  expect(save).toHaveBeenCalledTimes(1); expect(records.size).toBe(1)
})

test('an unstarted stale source can be explicitly saved independently without changing session or set IDs', async () => {
 const save=vi.fn().mockRejectedValueOnce(new WorkoutConflict('Routine changed')).mockResolvedValue({revision:4,status:'draft'})
 const {sync}=setup({save});const d=draft();sync.start(d);await sync.flush();expect(sync.canSaveIndependent()).toBe(true)
 await sync.saveIndependent();expect(save.mock.calls[1][0]).toEqual({...d,routineId:null,routineDayId:null,routineVersion:null})
 expect(save.mock.calls[1][2]).not.toBe(save.mock.calls[0][2]);sync.close()
})
test('independent recovery refuses to detach a workout that already has a server copy', async()=>{
 const d=draft(),save=vi.fn().mockRejectedValue(new WorkoutConflict('Changed'))
 const {sync}=setup({save,load:vi.fn().mockResolvedValue([{draft:d,revision:7}])});sync.start(d);await sync.flush();await sync.saveIndependent()
 expect(save).toHaveBeenCalledTimes(1);expect(sync.getSnapshot().error).toMatch(/server copy exists/);sync.close()
})
