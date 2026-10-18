import { actualSetError, createWorkout, emptyActualSet } from './workoutDraft'
import { blankExercise } from '../routines/types'
import { testCatalog, testDocument } from '../routines/testFixtures'
const routine = { id: 'saved-a', updated_at: 'exact-version', archived_at: null, document: { ...testDocument, days: [{ name: 'Glutes and Hammies', weekday: 3, exercises: [
  { ...blankExercise('Hip Thrust'), planned_sets: [{ reps: 8, load_kg: 30, entered_unit: 'kg' as const }, { reps: 6, load_kg: 40, entered_unit: 'kg' as const }] },
  testDocument.days[0].exercises[0], blankExercise('RDLs'),
] }] } }
test('workout snapshot preserves custom/catalog order and source version but never copies targets as actuals', () => {
  const before = structuredClone(routine)
  const draft = createWorkout(routine, 0, testCatalog)
  expect(draft).toMatchObject({ routineId: routine.id, routineVersion: routine.updated_at, routineName: routine.document.name, sessionName: 'Glutes and Hammies', dayPosition: 0 })
  expect(draft.exercises.map(item => item.name)).toEqual(['Hip Thrust', testCatalog[0].name, 'RDLs'])
  expect(draft.exercises.map(item => item.sets.length)).toEqual([0, 0, 0])
  draft.exercises[0].name = 'Changed only today'
  draft.exercises[0].source!.notes = 'Changed snapshot'
  draft.exercises[0].sets.push({ ...emptyActualSet('lb'), reps: 4 })
  expect(routine).toEqual(before)
})
test('successive workouts start independently and do not reuse actual results or exercise identifiers', () => {
  const first = createWorkout(routine, 0, testCatalog), next = createWorkout(routine, 0, testCatalog)
  first.exercises[0].sets.push({ ...emptyActualSet('kg'), reps: 8 })
  expect(next.exercises[0].sets).toEqual([])
  expect(first.id).not.toBe(next.id)
  expect(first.exercises[0].id).not.toBe(next.exercises[0].id)
  expect(first.exercises[0].sets[0].id).not.toBe(emptyActualSet('kg').id)
})
test.each([
  [{ reps: 0 }, /whole repetitions/], [{ reps: 1.5 }, /whole repetitions/], [{ reps: 101 }, /whole repetitions/],
  [{ loadKg: -1 }, /weight/], [{ loadKg: Infinity }, /weight/], [{ loadKg: 10001 }, /weight/],
])('invalid actual sets are rejected: %j', (patch, message) => {
  expect(actualSetError({ ...emptyActualSet('kg'), ...patch })).toMatch(message)
})
test('zero weight and unset weight are distinct; bodyweight sets do not require an invented load', () => {
  expect(actualSetError({ ...emptyActualSet('kg'), reps: 8, loadKg: 0 })).toBeNull()
  expect(actualSetError({ ...emptyActualSet('kg'), reps: 8 })).toBeNull()
})
