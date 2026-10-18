import type { Exercise, Prescription, SavedRoutine } from '../routines/types'

export type ActualSet = { id: string; reps: number | null; loadKg: number | null; unit: 'kg' | 'lb' }
export type WorkoutExercise = {
  id: string; exerciseId: string | null; name: string;
  loadingMode: Exercise['loading_mode'] | null;
  source: Prescription | null; sourceName?: string | null; targetSnapshot?: Record<string, unknown>; removed?: boolean; skipped: boolean; sets: ActualSet[];
}
export type WorkoutDraft = {
  id: string; routineId: string | null; routineDayId?: string | null; routineVersion: string | null; routineName: string;
  dayPosition: number; sessionName: string; startedAt: string; exercises: WorkoutExercise[];
}
export const poundsPerKg = 2.20462262185
export const emptyActualSet = (unit: ActualSet['unit']): ActualSet => ({ id: crypto.randomUUID(), reps: null, loadKg: null, unit })
export function createWorkout(routine: SavedRoutine, dayPosition: number, catalog: Exercise[]): WorkoutDraft {
  const day = routine.document.days[dayPosition]
  return {
    id: crypto.randomUUID(), routineId: routine.id, routineDayId: routine.dayIds?.[dayPosition] ?? null, routineVersion: routine.updated_at,
    routineName: routine.document.name, dayPosition, sessionName: day.name, startedAt: new Date().toISOString(),
    exercises: day.exercises.map(source => {
      const entry = catalog.find(exercise => exercise.id === source.exercise_id)
      // Only explicitly added sets represent performed work.
      return { id: crypto.randomUUID(), exerciseId: source.exercise_id, name: source.custom_exercise_name ?? entry?.name ?? 'Library exercise unavailable',
        loadingMode: entry?.loading_mode ?? null, sourceName: source.custom_exercise_name ?? entry?.name ?? null, source: structuredClone(source), skipped: false,
        sets: [] }
    }),
  }
}
export function actualSetError(set: ActualSet): string | null {
  if (set.reps !== null && (!Number.isInteger(set.reps) || set.reps < 1 || set.reps > 100)) return 'Use 1–100 whole repetitions.'
  if (set.loadKg !== null && (!Number.isFinite(set.loadKg) || set.loadKg < 0 || set.loadKg > 10000)) return 'Use a weight from 0–10000 kg (or its lb equivalent).'
  return null
}

export function finishError(draft: WorkoutDraft): string | null {
  const exercises = draft.exercises.filter(item => !item.skipped && !item.removed)
  if (!exercises.some(item => item.sets.length)) return 'Log at least one set before finishing.'
  for (const exercise of exercises) for (const set of exercise.sets) {
    if (set.reps === null) return `Enter reps for ${exercise.name}, or remove the incomplete set.`
    const error = actualSetError(set)
    if (error) return error
  }
  return null
}
