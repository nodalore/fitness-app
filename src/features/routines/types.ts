import type { ProfileDraft } from '../profile/profile'

export type Exercise = {
  id: string; slug: string; name: string; movement_pattern: string;
  primary_muscles: string[]; secondary_muscles: string[]; equipment: string[];
  loading_mode: 'external' | 'per_implement' | 'bodyweight'; technique_notes: string;
  default_rest_min_seconds: number; default_rest_max_seconds: number;
  deprecated_at: string | null;
}
export type Prescription = {
  exercise_id: string; target_sets: number; rep_min: number; rep_max: number;
  rest_seconds: number; notes: string;
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
