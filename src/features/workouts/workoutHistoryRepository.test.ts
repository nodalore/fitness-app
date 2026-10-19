import { expect, test, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { historyWorkout, loadWorkoutHistory } from './workoutHistoryRepository'
import { poundsPerKg } from './workoutDraft'
import { historyFixture } from './historyTestFixtures'
test('history uses ordered actual snapshots, original units and valid included sets without altering source data', () => {
  const row = historyFixture(), before = structuredClone(row), result = historyWorkout(row)
  expect(result.exercises.map(e => e.name)).toEqual(['Hip Thrust', 'Cable pull-through', 'Lunges', 'Extra calf raises'])
  expect(result).toMatchObject({ exerciseCount: 3, setCount: 4, sessionName: 'Glutes and Hammies', routineName: 'My saved plan' })
  expect(result.exercises[0].sets).toEqual([{ id: 's1', number: 1, reps: 10, weight: 180, unit: 'lb' }, { id: 's2', number: 2, reps: 8, weight: 60, unit: 'kg' }])
  expect(result.exercises[1]).toMatchObject({ sourceName: 'RDLs', sets: [{ weight: 0, unit: 'lb' }] })
  expect(result.exercises[2]).toMatchObject({ disposition: 'skipped', sets: [] })
  expect(result.exercises[3].sets[0].weight).toBeNull()
  expect(row).toEqual(before)
})
test('legacy weights convert to recorded unit; removed and incomplete exercises do not count', () => {
  const row = historyFixture()
  row.routine_name_snapshot = null
  row.session_exercises[1].workout_sets[1].entered_load = null
  row.session_exercises[1].workout_sets[1].load_kg = 180 / poundsPerKg
  row.session_exercises[0].removed = true
  row.session_exercises[2].workout_sets[0].reps = null
  const result = historyWorkout(row)
  expect(result.exercises[0].sets[0].weight).toBeCloseTo(180)
  expect(result.exercises[1].disposition).toBe('unperformed')
  expect(result.exercises[3].disposition).toBe('removed')
  expect(result.exerciseCount).toBe(1); expect(result.setCount).toBe(2)
})
test('history reads completed owner-only snapshots, stable newest-first pagination and no mutable tables', async () => {
  const chain = { eq: vi.fn(), order: vi.fn(), range: vi.fn(), abortSignal: vi.fn().mockResolvedValue({ data: Array.from({ length: 21 }, (_, i) => ({ ...historyFixture(), id: String(i) })), error: null }) }
  chain.eq.mockReturnValue(chain); chain.order.mockReturnValue(chain); chain.range.mockReturnValue(chain)
  const select = vi.fn().mockReturnValue(chain), from = vi.fn().mockReturnValue({ select })
  const result = await loadWorkoutHistory({ from } as unknown as SupabaseClient, 'account-a', 1)
  expect(from).toHaveBeenCalledExactlyOnceWith('workout_sessions')
  expect(chain.eq.mock.calls).toEqual([['user_id','account-a'], ['status','completed']])
  expect(chain.order.mock.calls).toEqual([['started_at',{ ascending:false }],['id',{ ascending:false }]])
  expect(chain.range).toHaveBeenCalledWith(20,40)
  expect(select.mock.calls[0][0]).not.toMatch(/target_snapshot|routine_days|routine_exercises/)
  expect(result.workouts).toHaveLength(20); expect(result.hasMore).toBe(true)
})
test('history errors do not masquerade as an empty history', async () => {
  const chain = { eq: vi.fn(), order: vi.fn(), range: vi.fn(), abortSignal: vi.fn().mockRejectedValue(new Error('private backend information')) }
  chain.eq.mockReturnValue(chain); chain.order.mockReturnValue(chain); chain.range.mockReturnValue(chain)
  await expect(loadWorkoutHistory({ from: () => ({ select: () => chain }) } as unknown as SupabaseClient, 'a')).rejects.toThrow('Unable to load workout history. Check your connection and retry.')
})
