import type { HistoryRow } from './workoutHistoryRepository'
export function historyFixture(): HistoryRow {
  return { id: 'workout', started_at: '2026-10-18T12:00:00Z', day_name_snapshot: 'Glutes and Hammies', routine_name_snapshot: 'My saved plan', session_exercises: [
    { id: 'extra', position: 3, exercise_name_snapshot: 'Extra calf raises', source_name_snapshot: null, loading_mode_snapshot: 'bodyweight', skipped: false, removed: false, workout_sets: [{ id: 'bw', set_number: 1, completed: true, reps: 15, entered_load: null, load_kg: null, entered_unit: 'kg' }] },
    { id: 'hip', position: 0, exercise_name_snapshot: 'Hip Thrust', source_name_snapshot: null, loading_mode_snapshot: 'external', skipped: false, removed: false, workout_sets: [
      { id: 's2', set_number: 2, completed: true, reps: 8, entered_load: '60', load_kg: '60', entered_unit: 'kg' },
      { id: 's1', set_number: 1, completed: true, reps: 10, entered_load: '180', load_kg: '81.6466', entered_unit: 'lb' },
      { id: 'draft', set_number: 3, completed: false, reps: null, entered_load: null, load_kg: null, entered_unit: 'lb' } ] },
    { id: 'replace', position: 1, exercise_name_snapshot: 'Cable pull-through', source_name_snapshot: 'RDLs', loading_mode_snapshot: 'external', skipped: false, removed: false, workout_sets: [{ id: 's3', set_number: 1, completed: true, reps: 12, entered_load: '0', load_kg: '0', entered_unit: 'lb' }] },
    { id: 'skip', position: 2, exercise_name_snapshot: 'Lunges', source_name_snapshot: null, loading_mode_snapshot: 'bodyweight', skipped: true, removed: false, workout_sets: [{ id: 'skipset', set_number: 1, completed: true, reps: 20, entered_load: null, load_kg: null, entered_unit: 'kg' }] },
  ] }
}
