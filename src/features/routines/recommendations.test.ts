import { describe, expect, test } from 'vitest'
import { recommendRoutines, RECOMMENDATION_VERSION } from './recommendations'
import { validateRoutine } from './routineValidation'
import { testCatalog, testDocument, testProfile } from './testFixtures'
import expansion from '../../data/catalog-expansion.json'
import type { Exercise } from './types'
const catalog: Exercise[] = [...testCatalog, ...expansion.exercises.map(exercise => ({ ...exercise, loading_mode: exercise.loading_mode as Exercise['loading_mode'], deprecated_at: null }))]
const choose = (patch = {}) => recommendRoutines({ ...testProfile, ...patch }, catalog)

describe.each(['general_fitness','strength','muscle_growth'])('%s programming', goal => {
  describe.each(['beginner','intermediate','advanced'])('%s experience', experience => {
    test.each([2,3,4,5,6])('%s sessions produce exactly one target-free plan', training_days_per_week => {
      const result = choose({ goal, experience, training_days_per_week })
      expect(result.options).toHaveLength(1)
      const document = result.options[0].document
      expect(document.recommendation_version).toBe(RECOMMENDATION_VERSION)
      expect(validateRoutine(document,catalog)).toBeNull()
      expect(document.days).toHaveLength(training_days_per_week)
      expect(document.days.every(day => day.weekday === null)).toBe(true)
      for (const day of document.days) for (const item of day.exercises) {
        expect(catalog.some(exercise => exercise.id === item.exercise_id && !exercise.deprecated_at)).toBe(true)
        expect(item).toMatchObject({ planning_mode: 'per_set', planned_sets: [], target_sets: null, rep_min: null, rep_max: null, rest_seconds: null })
      }
      expect(document.assumptions.profile).toEqual({ goal, experience, training_days_per_week })
      expect(document.assumptions).not.toHaveProperty('weekly_primary_sets')
    })
  })
})
test('A/B variation uses family occurrences and retains shared anchors', () => {
  const option = choose({ experience:'advanced', goal:'muscle_growth', training_days_per_week:4 }).options[0]
  expect(option.document.days.map(day => day.name)).toEqual(['Upper A','Lower A','Upper B','Lower B'])
  const ids = (index: number) => option.document.days[index].exercises.map(item => item.exercise_id)
  expect(ids(0)).not.toEqual(ids(2)); expect(ids(1)).not.toEqual(ids(3))
  expect(ids(0).some(id => ids(2).includes(id))).toBe(true)
})
test('strength anchors remain stable and advanced choices are loadable', () => {
  const option = choose({ experience:'advanced', goal:'strength', training_days_per_week:4 }).options[0]
  const squats = option.document.days.flatMap(day => day.exercises).filter(item => catalog.find(exercise => exercise.id === item.exercise_id)?.movement_pattern === 'squat')
  expect(new Set(squats.map(item => item.exercise_id)).size).toBe(1)
  expect(catalog.find(exercise => exercise.id === squats[0].exercise_id)?.slug).toBe('barbell-back-squat')
})
test('all hidden preferences and gender leave the entire recommendation unchanged', () => {
  expect(choose()).toEqual(choose({ gender:'woman', equipment:[], equipment_details:[], available_weekdays:[], timeline_weeks:52, display_unit:'lb', timezone:'invalid', display_name:'' }))
  expect(choose()).toEqual(choose({ gender:'prefer_not_to_say', equipment:['band'], equipment_details:['band_anchor'] }))
  expect(choose().options[0].document.assumptions.equipment_availability).toBe('unknown')
})
test('selection is deterministic, does not mutate inputs and excludes deprecated records', () => {
  const before = JSON.stringify([testProfile,catalog])
  expect(choose()).toEqual(recommendRoutines(testProfile,[...catalog].reverse()))
  expect(JSON.stringify([testProfile,catalog])).toBe(before)
  expect(recommendRoutines(testProfile,catalog.map(exercise => ({...exercise,deprecated_at:'2026-01-01'}))).options).toHaveLength(0)
})
test.each([null,1,7,2.5])('unconfirmed/invalid frequency %s requires profile confirmation', training_days_per_week => {
  expect(choose({training_days_per_week}).options).toHaveLength(0)
})
test.each([{name:''},{days:[]},{goal:'unknown'},{days:[{...testDocument.days[0],exercises:[]}]}])('invalid routine input is rejected: %j', patch => {
  expect(validateRoutine({...testDocument,...patch},catalog)).toEqual(expect.any(String))
})
