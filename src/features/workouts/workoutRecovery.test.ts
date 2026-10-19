import { beforeEach, expect, test } from 'vitest'
import { workoutRecovery } from './workoutRecovery'
import { createWorkout } from './workoutDraft'
import { testCatalog, testDocument } from '../routines/testFixtures'
import type { Recovery } from './WorkoutSync'
beforeEach(() => localStorage.clear())
function entry(): Recovery { return { draft: createWorkout({ id: crypto.randomUUID(), dayIds: [crypto.randomUUID()], updated_at: 'exact', archived_at: null, document: testDocument }, 0, testCatalog), revision: null, pending: null, dirty: true } }
test('recovery is scoped to the signed-in account, with no auth credentials stored', () => {
 const a = workoutRecovery('A'), b = workoutRecovery('B'), first = entry(), second = entry()
 a.put(first); b.put(second); expect(a.read()).toEqual([first]); expect(b.read()).toEqual([second]); a.remove(first.draft.id); expect(b.read()).toEqual([second])
 expect(localStorage.getItem('fitness-workout-recovery-v1:B')).not.toMatch(/access_token|refresh_token|password/)
})
test('corrupt/oversized recovery and malformed pending payloads are never submitted', () => {
 const cache = workoutRecovery('A'), key = 'fitness-workout-recovery-v1:A'
 for (const raw of ['not-json', '{}', 'x'.repeat(4194305), JSON.stringify([{ ...entry(), pending: { draft: {}, request: crypto.randomUUID(), revision: 0, finish: true } }])]) {
  localStorage.setItem(key, raw); expect(cache.read()).toEqual([])
 }
})
test('updating one recovery entry keeps other unfinished workouts and stable pending IDs', () => {
 const cache = workoutRecovery('A'), first = entry(), second = entry()
 first.pending = { draft: first.draft, request: crypto.randomUUID(), revision: null, finish: false }; cache.put(first); cache.put(second)
 cache.put({ ...first, dirty: false }); expect(cache.read()).toHaveLength(2); expect(cache.read().find(e => e.draft.id === first.draft.id)?.pending?.request).toBe(first.pending.request)
})

test('a pending cancellation is retained even for an otherwise clean saved workout',()=>{
 const cache=workoutRecovery('A'),value={...entry(),revision:5,dirty:false,cancelRequested:true}
 cache.put(value);expect(cache.read()).toEqual([value])
 expect(workoutRecovery('B').read()).toEqual([])
 cache.remove(value.draft.id);expect(cache.read()).toEqual([])
})
