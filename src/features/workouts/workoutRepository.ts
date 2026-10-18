import type { SupabaseClient } from '@supabase/supabase-js'
import { poundsPerKg, type WorkoutDraft, type WorkoutExercise } from './workoutDraft'
export type SavedWorkout = { draft: WorkoutDraft; revision: number }
export type SaveResult = { revision: number; status: 'draft' | 'completed' }
export type WorkoutRepository = { load(): Promise<SavedWorkout[]>; save(draft: WorkoutDraft, revision: number | null, request: string, finish: boolean): Promise<SaveResult> }
export class WorkoutConflict extends Error {}
export function workoutPayload(draft: WorkoutDraft) {
  return { id: draft.id, routineId: draft.routineId, routineDayId: draft.routineDayId ?? null, routineVersion: draft.routineVersion,
    routineName: draft.routineName, sessionName: draft.sessionName, dayPosition: draft.dayPosition, startedAt: draft.startedAt,
    exercises: draft.exercises.map(exercise => ({ id: exercise.id, exerciseId: exercise.exerciseId, name: exercise.name, loadingMode: exercise.loadingMode,
      sourceName: exercise.sourceName ?? null, target: exercise.targetSnapshot ?? exercise.source ?? {}, skipped: exercise.skipped, removed: exercise.removed ?? false,
      sets: exercise.sets.map(set => ({ id: set.id, reps: set.reps, weight: set.loadKg === null ? null : Number((set.loadKg * (set.unit === 'lb' ? poundsPerKg : 1)).toFixed(6)), unit: set.unit })),
    })),
  }
}
async function withTimeout<T>(run: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try { return await run(controller.signal) } finally { clearTimeout(timer) }
}
// Never read/write planned tables from the workout save path.
export function workoutRepository(client: SupabaseClient, userId: string): WorkoutRepository {
  return {
    async load() {
      const { data, error } = await withTimeout(signal => client.from('workout_sessions').select('*,session_exercises(*,workout_sets(*))').eq('user_id', userId).eq('status', 'draft').order('started_at', { ascending: false }).abortSignal(signal))
      if (error) throw new Error('Unable to load unfinished workouts. Retry before starting another workout.')
      return (data ?? []).map(row => ({ revision: Number(row.revision ?? 0), draft: {
        id: row.id, routineId: row.routine_id, routineDayId: row.routine_day_id, routineVersion: row.source_routine_version ?? null,
        routineName: row.routine_name_snapshot, sessionName: row.day_name_snapshot, dayPosition: row.source_day_position ?? 0, startedAt: row.started_at,
        exercises: [...row.session_exercises].sort((a, b) => a.position - b.position).map((exercise): WorkoutExercise => ({
          id: exercise.id, exerciseId: exercise.exercise_id, name: exercise.exercise_name_snapshot, loadingMode: exercise.loading_mode_snapshot,
          source: null, targetSnapshot: exercise.target_snapshot, sourceName: exercise.source_name_snapshot ?? null,
          skipped: exercise.skipped ?? false, removed: exercise.removed ?? false,
          sets: [...exercise.workout_sets].sort((a,b) => a.set_number - b.set_number).map(set => ({ id: set.id, reps: set.reps,
            loadKg: set.entered_load != null ? Number(set.entered_load) / (set.entered_unit === 'lb' ? poundsPerKg : 1) : set.load_kg == null ? null : Number(set.load_kg), unit: set.entered_unit })),
        })),
      } }))
    },
    async save(draft, revision, request, finish) {
      const { data, error } = await withTimeout(signal => client.rpc('fitness_save_workout', { p_document: workoutPayload(draft), p_expected_revision: revision, p_request_id: request, p_expected_user_id: userId, p_finish: finish }).abortSignal(signal))
      if (error) {
        if (error.code === '40001' || error.code === '55000' || error.code === '42501') throw new WorkoutConflict('This workout or its routine changed in another session. Reload before saving; your recovery copy is kept.')
        if (error.code === 'PGRST202' || error.code === '42883') throw new Error('Workout saving requires reviewed migration 008. Hosted installation needs separate approval. Your recovery copy is kept.')
        if (error.code === '22023') throw new Error('Some workout details are invalid. Review the sets and retry; your recovery copy is kept.')
        throw new Error('Workout not saved. Check your connection and retry. Your recovery copy is kept.')
      }
      if (!data || !Number.isSafeInteger(data.revision) || !['draft','completed'].includes(data.status)) throw new Error('Save could not be confirmed. Retry; your recovery copy is kept.')
      if ((data.currentRevision !== undefined && data.currentRevision !== data.revision) || (data.currentStatus !== undefined && data.currentStatus !== data.status)) throw new WorkoutConflict('A newer workout version exists. Reload before saving; your recovery copy is kept.')
      return { revision: data.revision, status: data.status } as SaveResult
    },
  }
}
