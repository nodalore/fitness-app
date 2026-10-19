import { afterEach, expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { workoutRepository, workoutPayload, WorkoutConflict } from './workoutRepository'
import { createWorkout, emptyActualSet, poundsPerKg } from './workoutDraft'
import { testCatalog, testDocument } from '../routines/testFixtures'
const response = (data: unknown, error: unknown) => ({ abortSignal: vi.fn().mockResolvedValue({ data, error }) })
afterEach(() => vi.useRealTimers())
const draft = () => createWorkout({ id: crypto.randomUUID(), dayIds: [crypto.randomUUID()], updated_at: '2026-10-18T00:00:00Z', archived_at: null, document: testDocument }, 0, testCatalog)
test('save sends one atomic owned-workout RPC, exact revision and request with entered lb values', async () => {
 const d = draft(); d.exercises[0].sets = [{ ...emptyActualSet('lb'), reps: 10, loadKg: 180 / poundsPerKg }]
 const rpc = vi.fn().mockReturnValue(response({ revision: 8, status: 'draft' }, null)), client = { rpc } as unknown as SupabaseClient
 await expect(workoutRepository(client, 'owner').save(d, 7, 'request', false)).resolves.toEqual({ revision: 8, status: 'draft' })
 expect(rpc).toHaveBeenCalledWith('fitness_save_workout', { p_document: workoutPayload(d), p_expected_revision: 7, p_request_id: 'request', p_expected_user_id: 'owner', p_finish: false })
 expect(workoutPayload(d).exercises[0].sets[0]).toMatchObject({ weight: 180, unit: 'lb', reps: 10 })
 expect(rpc.mock.calls[0][1].p_expected_user_id).toBe('owner')
 expect(JSON.stringify(rpc.mock.calls)).not.toContain('p_owner_id')
})
test.each(['40001','55000','42501'])('conflicts %s cannot silently overwrite newer or completed data', async code => {
 const client = { rpc: vi.fn().mockReturnValue(response(null, { code })) } as unknown as SupabaseClient
 await expect(workoutRepository(client,'owner').save(draft(), 3, 'request', false)).rejects.toBeInstanceOf(WorkoutConflict)
})
test('missing migration and invalid acknowledgements never report success or fall back to routine saving', async () => {
 const rpc = vi.fn().mockReturnValueOnce(response(null, { code: 'PGRST202' })).mockReturnValueOnce(response({ status: 'draft', revision: '8' }, null))
 const repo = workoutRepository({ rpc } as unknown as SupabaseClient, 'owner')
 await expect(repo.save(draft(),null,'request',false)).rejects.toThrow(/Workout saving is unavailable/)
 await expect(repo.save(draft(),null,'request',false)).rejects.toThrow(/could not be confirmed/)
})
test('resume queries owner/draft only and restores actual rows in order, snapshots, entered weight and zero/NULL', async () => {
 const d = draft(), rows = [{ id: d.id, revision: 9, routine_id: d.routineId, routine_day_id: d.routineDayId, source_routine_version: d.routineVersion, routine_name_snapshot: 'Snapshot routine', day_name_snapshot: 'Actual session', started_at: d.startedAt, source_day_position: 0, session_exercises: [
 { id: 'removed', position: 1, exercise_id: null, exercise_name_snapshot: 'My custom row', loading_mode_snapshot: null, target_snapshot: {}, skipped: true, removed: true, workout_sets: [] },
 { id: 'exercise', position: 0, exercise_id: null, exercise_name_snapshot: 'Actual replacement', loading_mode_snapshot: null, source_name_snapshot: 'RDLs', target_snapshot: { reps: 5 }, workout_sets: [
 { id: 'set-b', set_number: 2, reps: null, load_kg: null, entered_unit: 'kg', entered_load: null },
 { id: 'set-a', set_number: 1, reps: 10, load_kg: '81.6466', entered_unit: 'lb', entered_load: '180' },
 { id: 'set-c', set_number: 3, reps: 8, load_kg: '0', entered_unit: 'kg', entered_load: '0' },
 ] },
 ] }]
 const chain = { eq: vi.fn(), order: vi.fn().mockReturnValue(response(rows, null)) }; chain.eq.mockReturnValue(chain)
 const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(chain) }), repo = workoutRepository({ from } as unknown as SupabaseClient,'owner')
 const [result] = await repo.load(); expect(chain.eq.mock.calls).toEqual([['user_id','owner'],['status','draft']])
 expect(from).toHaveBeenCalledWith('workout_sessions'); expect(result.revision).toBe(9); expect(result.draft.routineName).toBe('Snapshot routine')
 expect(result.draft.exercises[0]).toMatchObject({ name: 'Actual replacement', sourceName: 'RDLs', targetSnapshot: { reps: 5 } })
 expect(result.draft.exercises[0].sets.map(s=>s.id)).toEqual(['set-a','set-b','set-c']); expect(result.draft.exercises[0].sets[0].loadKg).toBeCloseTo(180/poundsPerKg,8)
 expect(result.draft.exercises[0].sets[1]).toMatchObject({ reps:null, loadKg:null }); expect(result.draft.exercises[0].sets[2].loadKg).toBe(0)
 expect(result.draft.exercises[1]).toMatchObject({ skipped:true, removed:true })
})

test('a stalled network request times out without claiming success and remains retryable', async () => {
 vi.useFakeTimers()
 const rpc = vi.fn().mockReturnValue({ abortSignal: (signal: AbortSignal) => new Promise(resolve => signal.addEventListener('abort', () => resolve({ data: null, error: { code: 'aborted' } }))) })
 const request = workoutRepository({ rpc } as unknown as SupabaseClient,'owner').save(draft(),null,'request',false)
 const assertion = expect(request).rejects.toThrow(/not saved/)
 await vi.advanceTimersByTimeAsync(20001); await assertion
})

test('acknowledging an old retry never rebases queued edits onto a newer or completed server workout', async()=>{
 const rpc=vi.fn().mockReturnValue(response({revision:3,status:'draft',currentRevision:9,currentStatus:'completed'},null))
 await expect(workoutRepository({rpc} as unknown as SupabaseClient,'owner').save(draft(),null,'old-request',false)).rejects.toBeInstanceOf(WorkoutConflict)
})

test('cancellation sends one ownership-checked RPC and validates the exact canceled workout acknowledgement',async()=>{
 const rpc=vi.fn().mockReturnValueOnce(response({id:'workout',status:'canceled'},null)).mockReturnValueOnce(response({id:'different',status:'canceled'},null))
 const repo=workoutRepository({rpc} as unknown as SupabaseClient,'owner')
 await expect(repo.cancel('workout')).resolves.toBeUndefined()
 expect(rpc).toHaveBeenCalledWith('fitness_cancel_workout',{p_session_id:'workout',p_expected_user_id:'owner'})
 await expect(repo.cancel('workout')).rejects.toThrow(/could not be confirmed/)
})
test.each(['PGRST202','55000','42501','network'])('cancellation failure %s preserves data and never falls back to direct deletion',async code=>{
 const rpc=vi.fn().mockReturnValue(response(null,{code})),from=vi.fn(),repo=workoutRepository({rpc,from} as unknown as SupabaseClient,'owner')
 await expect(repo.cancel('workout')).rejects.toThrow(code==='PGRST202'?/Cancel Workout is unavailable/:code==='network'?/Retry cancellation/:/Cancellation refused/)
 expect(from).not.toHaveBeenCalled()
})
