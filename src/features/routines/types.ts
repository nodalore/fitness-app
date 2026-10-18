import type { ProfileDraft } from '../profile/profile'

export type Exercise = {
  id: string; slug: string; name: string; movement_pattern: string;
  primary_muscles: string[]; secondary_muscles: string[]; equipment: string[];
  loading_mode: 'external' | 'per_implement' | 'bodyweight'; technique_notes: string;
  default_rest_min_seconds: number; default_rest_max_seconds: number;
  deprecated_at: string | null;
}
export type PlannedSet = { reps: number | null; load_kg: number | null; entered_unit: 'kg' | 'lb' }
export type LegacyPrescription = {
  exercise_id: string; target_sets: number; rep_min: number; rep_max: number;
  rest_seconds: number; notes: string; planning_mode?: 'legacy'; custom_exercise_name?: null; planned_sets?: never[];
}
export type PerSetPrescription = {
  exercise_id: string | null; custom_exercise_name: string | null; planning_mode: 'per_set';
  target_sets: null; rep_min: null; rep_max: null; rest_seconds: null;
  planned_sets: PlannedSet[]; notes: string;
}
export type Prescription = LegacyPrescription | PerSetPrescription
export function blankExercise(name = '', exerciseId: string | null = null): PerSetPrescription {
  return { exercise_id: exerciseId, custom_exercise_name: exerciseId ? null : name,
    planning_mode: 'per_set', target_sets: null, rep_min: null, rep_max: null,
    rest_seconds: null, planned_sets: [], notes: '' }
}
export type RoutineDayDraft = { name: string; weekday: number | null; exercises: Prescription[] }
export type RoutineDocument = {
  name: string; goal: ProfileDraft['goal']; origin_template_key: string | null;
  recommendation_version: string | null; assumptions: Record<string, unknown>;
  days: RoutineDayDraft[];
}
export type SavedRoutine = {
  id: string; updated_at: string; archived_at: string | null; document: RoutineDocument;
}
export type Recommendation = {
  key: string; rationale: string; cautions: string[];
  weeklySets: Record<string, number>; document: RoutineDocument;
}
