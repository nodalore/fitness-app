import { describe, expect, test } from 'vitest'
import { compatible, recommendRoutines, RECOMMENDATION_VERSION } from './recommendations'
import { validateRoutine } from './routineValidation'
import { testCatalog, testDocument, testProfile } from './testFixtures'
import expansion from '../../data/catalog-expansion.json'
import type { Exercise } from './types'
const catalog: Exercise[] = [...testCatalog, ...expansion.exercises.map(exercise => ({ ...exercise, loading_mode: exercise.loading_mode as Exercise['loading_mode'], deprecated_at: null }))]
const choose = (patch = {}) => recommendRoutines({ ...testProfile, ...patch }, catalog)

describe.each(['general_fitness','strength','muscle_growth'])('%s programming', goal => {
  describe.each(['beginner','intermediate','advanced'])('%s experience', experience => {
    test.each([2,3,4,5,6])('%s requested sessions produce feasible, saved-compatible workloads', training_days_per_week => {
      const profile = { ...testProfile, goal, experience, training_days_per_week }
      const result = recommendRoutines(profile, catalog)
      expect(result.options).toHaveLength(2)
      for (const option of result.options) {
        expect(option.document.recommendation_version).toBe(RECOMMENDATION_VERSION)
        expect(validateRoutine(option.document,catalog)).toBeNull()
        expect(option.document.days).toHaveLength(experience === 'beginner' ? Math.min(3,training_days_per_week) : training_days_per_week)
        expect(option.document.days.every(day => day.weekday === null)).toBe(true)
        for (const day of option.document.days) for (const item of day.exercises) {
          expect(compatible(catalog.find(exercise => exercise.id === item.exercise_id)!,profile)).toBe(true)
          expect(item.target_sets).toBeLessThanOrEqual(experience === 'beginner' ? 2 : experience === 'advanced' ? 4 : 3)
          if (experience !== 'beginner') expect(catalog.find(exercise => exercise.id === item.exercise_id)?.slug).not.toBe('bodyweight-squat')
        }
        expect(option.document.assumptions.profile).toMatchObject({ training_days_per_week })
      }
      expect(result.options[0].document.days).not.toEqual(result.options[1].document.days)
      if (experience === 'beginner' && training_days_per_week > 3) expect(result.limitations.join(' ')).toContain(`requested ${training_days_per_week}`)
    })
  })
})
test('upper/lower occurrence counts break the 0/2 and 1/3 repetition bug', () => {
  const option = choose({ experience:'advanced', goal:'muscle_growth', training_days_per_week:4 }).options[1]
  expect(option.document.days.map(day => day.name)).toEqual(['Upper A','Lower A','Upper B','Lower B'])
  const ids = (index: number) => option.document.days[index].exercises.map(item => item.exercise_id)
  expect(ids(0)).not.toEqual(ids(2)); expect(ids(1)).not.toEqual(ids(3))
  expect(ids(0).some(id => ids(2).includes(id))).toBe(true) // anchors deliberately shared
})
test('strength anchors remain specific, while B changes emphasis', () => {
  const option = choose({ experience:'advanced', goal:'strength', training_days_per_week:4 }).options[1]
  const squats = option.document.days.flatMap(day => day.exercises).filter(item => catalog.find(exercise => exercise.id === item.exercise_id)?.movement_pattern === 'squat')
  expect(new Set(squats.map(item => item.exercise_id)).size).toBe(1)
  expect(catalog.find(exercise => exercise.id === squats[0].exercise_id)?.slug).toBe('barbell-back-squat')
})
test('weekly workload is distributed rather than multiplied by frequency', () => {
  const totals = [2,3,4,5,6].map(training_days_per_week => choose({ experience:'advanced', goal:'muscle_growth', training_days_per_week }).options[1].document.assumptions.weekly_pattern_sets as Record<string,number>)
  for (const pattern of ['squat','hinge','horizontal_push','horizontal_pull']) {
    expect(Math.max(...totals.map(total => total[pattern]))).toBeLessThanOrEqual(10)
    expect(Math.max(...totals.map(total => total[pattern])) - Math.min(...totals.map(total => total[pattern]))).toBeLessThanOrEqual(2)
  }
})
test('advanced main-lift workloads exceed beginner starts without assigning a weight', () => {
  const sets = (experience: string) => choose({ experience, goal:'strength', training_days_per_week:2 }).options[1].document.days[0].exercises[0]
  expect(sets('advanced').target_sets).toBeGreaterThan(sets('beginner').target_sets)
  expect(sets('advanced').rep_min).toBe(4)
  expect(sets('advanced')).not.toHaveProperty('load_kg')
})
test('equipment details prevent assuming a full gym, bench or rack', () => {
  const result = choose({ experience:'advanced', training_days_per_week:4, equipment_details:[] })
  expect(result.options).toHaveLength(0)
  expect(result.limitations.join(' ')).toContain('Confirm')
  const dumbbell = choose({ equipment:['dumbbell'], equipment_details:['stable_support'], training_days_per_week:2 })
  expect(dumbbell.options.length).toBeGreaterThan(0)
  expect(dumbbell.options[0].document.days.flatMap(day => day.exercises).every(item => !['dumbbell-bench-press','barbell-back-squat'].includes(catalog.find(exercise => exercise.id === item.exercise_id)!.slug))).toBe(true)
})
test('limited alternatives repeat honestly and no unavailable exercise is invented', () => {
  const result = recommendRoutines({ ...testProfile, equipment:['dumbbell'], training_days_per_week:2 }, testCatalog)
  expect(result.options).toHaveLength(2)
  expect(result.limitations.join(' ')).toContain('repeat')
  expect(choose({ equipment:['bodyweight'],equipment_details:[] }).options).toHaveLength(0)
})
test('rules are stable across reloads, catalog order, weekday and timeline changes', () => {
  const before = JSON.stringify([testProfile,catalog])
  const first = recommendRoutines(testProfile,catalog)
  expect(first).toEqual(recommendRoutines(testProfile,[...catalog].reverse()))
  expect(first.options.map(option => option.document.days)).toEqual(choose({ available_weekdays:[0,6],timeline_weeks:52 }).options.map(option => option.document.days))
  expect(before).toBe(JSON.stringify([testProfile,catalog]))
})
test.each([null,1,7,2.5])('unconfirmed/invalid frequency %s requires profile confirmation', training_days_per_week => {
  expect(choose({training_days_per_week}).options).toHaveLength(0)
})
test('deprecated catalog records cannot be recommended', () => {
  expect(recommendRoutines(testProfile,catalog.map(exercise => ({...exercise,deprecated_at:'2026-01-01'}))).options).toHaveLength(0)
})
test.each([{name:''},{days:[]},{goal:'unknown'},{days:[{...testDocument.days[0],exercises:[]}]}])('invalid custom input is rejected: %j', patch => {
  expect(validateRoutine({...testDocument,...patch},catalog)).toEqual(expect.any(String))
})
