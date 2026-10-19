import type { SupabaseClient } from '@supabase/supabase-js'
import { poundsPerKg } from './workoutDraft'

export type HistorySet = { id: string; number: number; reps: number; weight: number | null; unit: 'lb' | 'kg' }
export type HistoryExercise = { id: string; name: string; sourceName: string | null; disposition: 'performed' | 'skipped' | 'removed' | 'unperformed'; sets: HistorySet[] }
export type HistoryWorkout = { id: string; date: string; sessionName: string; routineName: string | null; exercises: HistoryExercise[]; exerciseCount: number; setCount: number }
export type HistoryRow = {
  id: string; started_at: string; day_name_snapshot: string; routine_name_snapshot: string | null;
  session_exercises: { id: string; position: number; exercise_name_snapshot: string; source_name_snapshot: string | null; loading_mode_snapshot: string | null; skipped: boolean; removed: boolean;
    workout_sets: { id: string; set_number: number; completed: boolean; reps: number | null; entered_load: number | string | null; load_kg: number | string | null; entered_unit: 'lb' | 'kg' }[] }[]
}
// Read actual snapshots only. Never join current routines, catalog names or planned targets.
export function historyWorkout(row: HistoryRow): HistoryWorkout {
  const exercises = [...row.session_exercises].sort((a, b) => a.position - b.position).map((exercise): HistoryExercise => {
    const sets = exercise.skipped || exercise.removed ? [] : [...exercise.workout_sets].sort((a, b) => a.set_number - b.set_number)
      .filter(set => set.completed && set.reps != null && set.reps > 0 && (exercise.loading_mode_snapshot === 'bodyweight' || set.entered_load != null || set.load_kg != null))
      .map(set => ({ id: set.id, number: set.set_number, reps: set.reps!, unit: set.entered_unit,
        weight: set.entered_load != null ? Number(set.entered_load) : set.load_kg == null ? null : Number(set.load_kg) * (set.entered_unit === 'lb' ? poundsPerKg : 1) }))
    return { id: exercise.id, name: exercise.exercise_name_snapshot, sourceName: exercise.source_name_snapshot,
      disposition: exercise.removed ? 'removed' : exercise.skipped ? 'skipped' : sets.length ? 'performed' : 'unperformed', sets }
  })
  return { id: row.id, date: row.started_at, sessionName: row.day_name_snapshot, routineName: row.routine_name_snapshot,
    exercises, exerciseCount: exercises.filter(exercise => exercise.sets.length > 0).length, setCount: exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0) }
}
export const historyPageSize = 20
export async function loadWorkoutHistory(client: SupabaseClient, userId: string, page = 0) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const { data, error } = await client.from('workout_sessions')
      .select('id,started_at,day_name_snapshot,routine_name_snapshot,session_exercises(id,position,exercise_name_snapshot,source_name_snapshot,loading_mode_snapshot,skipped,removed,workout_sets(id,set_number,completed,reps,entered_load,load_kg,entered_unit))')
      .eq('user_id', userId).eq('status', 'completed')
      .order('started_at', { ascending: false }).order('id', { ascending: false })
      .range(page * historyPageSize, (page + 1) * historyPageSize).abortSignal(controller.signal)
    if (error) throw error
    const rows = (data ?? []) as unknown as HistoryRow[]
    return { workouts: rows.slice(0, historyPageSize).map(historyWorkout), hasMore: rows.length > historyPageSize }
  } catch { throw new Error('Unable to load workout history. Check your connection and retry.') }
  finally { clearTimeout(timer) }
}
