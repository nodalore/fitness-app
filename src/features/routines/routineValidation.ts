import type { Exercise, Prescription, RoutineDocument } from './types'

export function validateRoutine(document: RoutineDocument, catalog: Exercise[]): string | null {
  if (!document.name.trim() || document.name.trim().length > 100) return 'Enter a routine name of 1–100 characters.'
  if (!['general_fitness', 'strength', 'muscle_growth'].includes(document.goal)) return 'Choose a valid goal.'
  if (document.days.length < 1 || document.days.length > 7) return 'Include 1–7 workout days.'
  for (const day of document.days) {
    if (!day.name.trim() || day.name.trim().length > 100) return 'Give each day a name of 1–100 characters.'
    if (day.weekday !== null && (!Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6)) return 'Choose a valid weekday.'
    if (day.exercises.length < 1 || day.exercises.length > 20) return 'Include 1–20 exercises per day.'
    for (const item of day.exercises) {
      const error = validateExercise(item, catalog)
      if (error) return error
    }
  }
  return null
}

export function validateExercise(item: Prescription, catalog: Exercise[]): string | null {
  const custom = item.planning_mode === 'per_set' ? item.custom_exercise_name : null
  if (item.exercise_id) {
    if (custom != null || !catalog.some(exercise => exercise.id === item.exercise_id && !exercise.deprecated_at)) return 'Choose an available library exercise or type a custom name.'
  } else if (!custom?.trim() || custom.trim().length > 100) return 'Enter an exercise name of 1–100 characters.'
  if (item.planning_mode === 'per_set') {
    if ([item.target_sets,item.rep_min,item.rep_max,item.rest_seconds].some(value => value !== null)) return 'Per-set plans cannot contain legacy targets.'
    if (item.planned_sets.length > 10) return 'Use at most 10 sets per exercise.'
    for (const set of item.planned_sets) {
      if (set.reps !== null && (!Number.isInteger(set.reps) || set.reps < 1 || set.reps > 100)) return 'Use 1–100 reps or leave unset.'
      if (set.load_kg !== null && (!Number.isFinite(set.load_kg) || set.load_kg < 0 || set.load_kg > 10000)) return 'Use planned weight from 0–10000 kg or leave unset.'
      if (!['kg','lb'].includes(set.entered_unit)) return 'Choose kg or lb.'
    }
  } else {
    if (!Number.isInteger(item.target_sets) || item.target_sets < 1 || item.target_sets > 10) return 'Use 1–10 sets per exercise.'
    if (!Number.isInteger(item.rep_min) || !Number.isInteger(item.rep_max) || item.rep_min < 1 || item.rep_max > 100 || item.rep_max < item.rep_min) return 'Use repetition ranges from 1–100, with maximum at least minimum.'
    if (!Number.isInteger(item.rest_seconds) || item.rest_seconds < 1 || item.rest_seconds > 900) return 'Use a rest period from 1–900 seconds.'
  }
  if (item.notes.length > 2000) return 'Keep exercise notes to 2,000 characters.'
  return null
}
