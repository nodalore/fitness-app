import type { Exercise } from './types'
import type { ProfileDraft } from '../profile/profile'

type Metadata = { requires?: string[][]; experienced?: boolean; strength?: number; growth?: number }
// Requirements are AND across groups, OR within each group. Metadata never adds
// an exercise to the live catalog; it only ranks/filters records actually loaded.
export const exerciseMetadata: Record<string, Metadata> = {
  'bodyweight-squat': { strength: 0, growth: 0 },
  'goblet-squat': { strength: 3, growth: 3 },
  'barbell-back-squat': { requires: [['rack']], experienced: true, strength: 6, growth: 5 },
  'leg-press': { requires: [['leg_press']], strength: 5, growth: 6 },
  'dumbbell-split-squat': { strength: 4, growth: 5 },
  'dumbbell-rdl': { strength: 4, growth: 4 },
  'barbell-rdl': { experienced: true, strength: 6, growth: 5 },
  'dumbbell-hip-thrust': { requires: [['bench']], strength: 3, growth: 4 },
  'dumbbell-bench-press': { requires: [['bench']], strength: 4, growth: 5 },
  'barbell-bench-press': { requires: [['bench'], ['rack']], experienced: true, strength: 6, growth: 5 },
  'dumbbell-floor-press': { strength: 3, growth: 3 },
  'machine-chest-press': { requires: [['chest_press']], strength: 5, growth: 5 },
  'push-up': { strength: 1, growth: 1 },
  'dumbbell-row': { requires: [['bench', 'stable_support']], strength: 4, growth: 5 },
  'seated-machine-row': { requires: [['seated_row']], strength: 5, growth: 5 },
  'dumbbell-shoulder-press': { requires: [['bench']], strength: 4, growth: 4 },
  'machine-shoulder-press': { requires: [['shoulder_press']], strength: 5, growth: 5 },
  'lat-pulldown': { requires: [['lat_pulldown']], strength: 5, growth: 5 },
  'seated-leg-curl': { requires: [['leg_curl']] },
  'cable-triceps-pressdown': { requires: [['cable_station']] },
  'standing-dumbbell-calf-raise': {},
  'dumbbell-lateral-raise': {},
  'dumbbell-curl': {},
  'band-row': { requires: [['band_anchor']], strength: 2, growth: 2 },
  'band-rdl': { strength: 2, growth: 2 },
  'standing-calf-raise': {}, 'band-leg-curl': { requires: [['band_anchor']] },
  'pull-up': { requires: [['pull_up_bar']], experienced: true, strength: 3, growth: 3 },
  'dead-bug': {}, 'bird-dog': {},
}
export function supportRequirements(exercise: Exercise) {
  return exerciseMetadata[exercise.slug]?.requires ?? []
}
export function suitableEquipment(exercise: Exercise, profile: ProfileDraft) {
  return !exercise.deprecated_at
    && exercise.equipment.every(item => item === 'bodyweight' || profile.equipment.includes(item))
    && supportRequirements(exercise).every(group => group.some(item => profile.equipment_details?.includes(item)))
}
export function suitabilityScore(exercise: Exercise, profile: ProfileDraft) {
  const data = exerciseMetadata[exercise.slug] ?? {}
  const loadable = exercise.loading_mode !== 'bodyweight'
  const specific = profile.goal === 'strength' ? data.strength : data.growth
  return (loadable ? 100 : 0) + (specific ?? 3) * 10
    + (profile.experience === 'advanced' && data.experienced ? 5 : 0)
}
