import { describe, expect, test } from 'vitest'
import { compatible, recommendRoutines, RECOMMENDATION_VERSION } from './recommendations'
import { validateRoutine } from './routineValidation'
import { testCatalog, testDocument, testProfile } from './testFixtures'

describe.each(['general_fitness', 'strength', 'muscle_growth'])('%s recommendations', goal => {
  test.each(['beginner', 'intermediate', 'advanced'])('match %s experience, schedule, and equipment', experience => {
    const profile = { ...testProfile, goal, experience, available_weekdays: [1, 3, 5], equipment: ['dumbbell'] }
    const result = recommendRoutines(profile, testCatalog)
    expect(result.options.length).toBeGreaterThanOrEqual(2)
    expect(result.options.length).toBeLessThanOrEqual(3)
    for (const option of result.options) {
      expect(option.document.recommendation_version).toBe(RECOMMENDATION_VERSION)
      expect(validateRoutine(option.document, testCatalog)).toBeNull()
      expect(option.document.goal).toBe(goal)
      expect(option.document.days.every(day => profile.available_weekdays.includes(day.weekday!))).toBe(true)
      const exercises = option.document.days.flatMap(day => day.exercises)
      for (const item of exercises) {
        expect(compatible(testCatalog.find(exercise => exercise.id === item.exercise_id)!, profile)).toBe(true)
        if (experience === 'beginner') expect(item.target_sets).toBeLessThanOrEqual(2)
        expect(item.rest_seconds).toBeGreaterThanOrEqual(60)
      }
      expect(option.document.assumptions.source_urls).toHaveLength(3)
      expect(option.weeklySets.trunk).toBeGreaterThan(0)
    }
    expect(result.options[0].document.days[0].exercises[0].target_sets).toBeLessThan(result.options[1].document.days[0].exercises[0].target_sets)
  })
})

test('timeline changes the review point without accelerating training', () => {
  const short = recommendRoutines({ ...testProfile, timeline_weeks: 1 }, testCatalog)
  const long = recommendRoutines({ ...testProfile, timeline_weeks: 52 }, testCatalog)
  expect(short.options.map(option => option.document.days)).toEqual(long.options.map(option => option.document.days))
  expect(short.options[0].document.assumptions.review_after_weeks).toBe(1)
})

test('consecutive-only availability produces honest one-day options', () => {
  const result = recommendRoutines({ ...testProfile, available_weekdays: [1, 2] }, testCatalog)
  expect(result.options.every(option => option.document.days.length === 1)).toBe(true)
  expect(result.limitations.join(' ')).toContain('below the general twice-weekly')
})

test('Sunday and Monday are consecutive across the weekly boundary', () => {
  const result = recommendRoutines({ ...testProfile, available_weekdays: [0, 6] }, testCatalog)
  expect(result.options.every(option => option.document.days.length === 1)).toBe(true)
})

test('four-day upper/lower is available for experienced users', () => {
  const result = recommendRoutines({ ...testProfile, experience: 'intermediate', available_weekdays: [1, 2, 4, 5] }, testCatalog)
  const split = result.options.find(option => option.key === 'upper-lower-four')!
  expect(split.document.days).toHaveLength(4)
  expect(split.document.days.map(day => day.name)).toEqual(['Upper body', 'Lower body & trunk', 'Upper body', 'Lower body & trunk'])
})

test('unavailable movements are explained without recommending an incomplete plan', () => {
  const result = recommendRoutines({ ...testProfile, equipment: ['bodyweight'] }, testCatalog)
  expect(result.options).toHaveLength(0)
  expect(result.limitations.join(' ')).toContain('hinge')
  expect(result.limitations.join(' ')).toContain('horizontal pull')
})

test('deprecated exercises are excluded and empty equipment/schedules are invalid', () => {
  const result = recommendRoutines(testProfile, testCatalog.map(exercise => ({ ...exercise, deprecated_at: '2026-01-01' })))
  expect(result.options).toHaveLength(0)
  expect(recommendRoutines({ ...testProfile, available_weekdays: [] }, testCatalog).options).toHaveLength(0)
})

test('rules are deterministic and do not mutate saved profile or catalog', () => {
  const before = JSON.stringify([testProfile, testCatalog])
  expect(recommendRoutines(testProfile, testCatalog)).toEqual(recommendRoutines(testProfile, testCatalog))
  expect(JSON.stringify([testProfile, testCatalog])).toBe(before)
})

test.each([
  { name: '' }, { days: [] }, { goal: 'unknown' },
  { days: [{ ...testDocument.days[0], exercises: [] }] },
  { days: [{ ...testDocument.days[0], exercises: [{ ...testDocument.days[0].exercises[0], rep_min: 20 }] }] },
  { days: [{ ...testDocument.days[0], exercises: [{ ...testDocument.days[0].exercises[0], target_sets: 0 }] }] },
])('custom routine validation rejects invalid input: %j', patch => {
  expect(validateRoutine({ ...testDocument, ...patch }, testCatalog)).toEqual(expect.any(String))
})


test('all weekday combinations keep full-body sessions separated and within availability', () => {
  for (let mask = 1; mask < 128; mask++) {
    const days = Array.from({ length: 7 }, (_, index) => index).filter(day => mask & (1 << day))
    const result = recommendRoutines({ ...testProfile, available_weekdays: days }, testCatalog)
    for (const option of result.options) {
      const selected = option.document.days.map(day => day.weekday!)
      expect(selected.every(day => days.includes(day))).toBe(true)
      if (selected.length > 1) {
        expect(selected.every((day, index) => (selected[(index + 1) % selected.length] - day + 7) % 7 >= 2)).toBe(true)
      }
    }
  }
})
