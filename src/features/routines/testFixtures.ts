import type { Exercise, RoutineDocument } from './types'
import { defaultProfile } from '../profile/profile'

// Synthetic fixtures for unit tests; production reads the actual seeded catalog.
export const testProfile = { ...defaultProfile, equipment: ['bodyweight', 'dumbbell', 'machine', 'barbell'] }
export const testCatalog: Exercise[] = [
  ['bodyweight-squat', 'squat', 'bodyweight'], ['goblet-squat', 'squat', 'dumbbell'],
  ['dumbbell-rdl', 'hinge', 'dumbbell'], ['barbell-rdl', 'hinge', 'barbell'],
  ['dumbbell-bench-press', 'horizontal_push', 'dumbbell'], ['machine-chest-press', 'horizontal_push', 'machine'],
  ['dumbbell-row', 'horizontal_pull', 'dumbbell'], ['seated-machine-row', 'horizontal_pull', 'machine'],
  ['dumbbell-shoulder-press', 'vertical_push', 'dumbbell'], ['machine-shoulder-press', 'vertical_push', 'machine'],
  ['dead-bug', 'trunk', 'bodyweight'], ['bird-dog', 'trunk', 'bodyweight'],
].map(([slug, pattern, equipment], index) => ({
  id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, slug, name: slug,
  movement_pattern: pattern, equipment: [equipment], loading_mode: equipment === 'bodyweight' ? 'bodyweight' : 'external',
  primary_muscles: [pattern], secondary_muscles: [], technique_notes: 'Controlled movement.',
  default_rest_min_seconds: pattern === 'trunk' ? 60 : 120, default_rest_max_seconds: pattern === 'trunk' ? 120 : 180, deprecated_at: null,
}))
export const testDocument: RoutineDocument = {
  name: 'My training plan', goal: 'strength', origin_template_key: null, recommendation_version: null, assumptions: {},
  days: [{ name: 'Full body', weekday: 1, exercises: [{ exercise_id: testCatalog[0].id, target_sets: 2, rep_min: 8, rep_max: 12, rest_seconds: 120, notes: '' }] }],
}
