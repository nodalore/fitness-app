import type { ProfileDraft } from '../profile/profile'
import { validateProfile } from '../profile/profile'
import type { Exercise, Prescription, Recommendation, RoutineDayDraft } from './types'

export const RECOMMENDATION_VERSION = 'rules-1.0'
const corePatterns = ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'trunk']
export const guidanceSources = [
  { title: 'ACSM 2026 resistance-training summary', url: 'https://acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf' },
  { title: 'CDC adult activity guidance', url: 'https://www.cdc.gov/physical-activity-basics/guidelines/adults.html' },
  { title: 'NSCA time-efficient training', url: 'https://www.nsca.com/education/articles/ptq/time-efficient-training/' },
]

export function compatible(exercise: Exercise, profile: ProfileDraft) {
  return !exercise.deprecated_at && exercise.equipment.every(item => item === 'bodyweight' || profile.equipment.includes(item))
}

export function prescription(exercise: Exercise, profile: ProfileDraft, lighter = false): Prescription {
  const trunk = exercise.movement_pattern === 'trunk'
  const novice = profile.experience === 'beginner'
  return {
    exercise_id: exercise.id,
    target_sets: lighter ? novice || profile.goal === 'general_fitness' ? 1 : 2 : novice || trunk || profile.goal === 'general_fitness' ? 2 : 3,
    rep_min: !novice && !trunk && profile.goal === 'strength' ? 4 : 8,
    rep_max: !novice && !trunk && profile.goal === 'strength' ? 8 : 12,
    rest_seconds: trunk ? exercise.default_rest_min_seconds : profile.goal === 'strength' && !novice ? exercise.default_rest_max_seconds : exercise.default_rest_min_seconds,
    notes: exercise.technique_notes,
  }
}

function combinations(days: number[], count: number): number[][] {
  if (count === 0) return [[]]
  return days.flatMap((day, index) => combinations(days.slice(index + 1), count - 1).map(rest => [day, ...rest]))
}
function bestFullBodyDays(days: number[], count: number) {
  const eligible = combinations(days, count).filter(option => option.every((day, index) => option.length === 1 || (option[(index + 1) % option.length] - day + 7) % 7 >= 2))
  // Prefer evenly spaced weeks, then the earlier weekday for reproducibility.
  return eligible.sort((a, b) => {
    const spread = (list: number[]) => Math.max(...list.map((day, i) => (list[(i + 1) % list.length] - day + 7) % 7))
    return spread(a) - spread(b) || a.join('').localeCompare(b.join(''))
  })[0]
}

export function recommendRoutines(profile: ProfileDraft, catalog: Exercise[]): { options: Recommendation[]; limitations: string[] } {
  if (validateProfile(profile)) return { options: [], limitations: ['Save a complete, valid fitness profile before generating recommendations.'] }
  const available = [...new Set(profile.available_weekdays)].sort((a, b) => a - b)
  const pool = catalog.filter(exercise => compatible(exercise, profile)).sort((a, b) => a.slug.localeCompare(b.slug))
  const missing = corePatterns.filter(pattern => !pool.some(exercise => exercise.movement_pattern === pattern))
  if (missing.length) return {
    options: [], limitations: [`The small exercise library cannot cover these movements with your equipment: ${missing.map(value => value.replaceAll('_', ' ')).join(', ')}. No complete routine is recommended. Update your equipment if appropriate, or build a custom routine and review its coverage.`],
  }
  const twoDays = bestFullBodyDays(available, 2)
  const baseDays = twoDays ?? [available[0]]
  const limitations: string[] = []
  if (baseDays.length === 1) limitations.push('This one-day starter is below the general twice-weekly strengthening guideline. Available days do not allow separated full-body sessions; add a separated day when feasible.')
  limitations.push('Dumbbell presses assume access to a suitable bench/seat; supported rows need stable support. Check equipment notes before selecting a plan.')
  const pick = (pattern: string, variant: number) => {
    const matches = pool.filter(exercise => exercise.movement_pattern === pattern)
    // Prefer loadable squats over bodyweight when external resistance is available.
    if (pattern === 'squat') matches.sort((a, b) => Number(a.loading_mode === 'bodyweight') - Number(b.loading_mode === 'bodyweight') || a.slug.localeCompare(b.slug))
    if (profile.goal === 'strength' && pattern === 'squat' && matches.some(exercise => exercise.loading_mode !== 'bodyweight')) return matches[0]
    return matches[variant % matches.length]
  }
  const build = (key: string, name: string, days: number[], lighter: boolean, split = false): Recommendation => {
    const weeklySets: Record<string, number> = {}
    const routineDays: RoutineDayDraft[] = days.map((weekday, index) => {
      const patterns = split ? index % 2 === 0 ? ['horizontal_push', 'horizontal_pull', 'vertical_push'] : ['squat', 'hinge', 'trunk'] : [...corePatterns]
      const chosen = patterns.filter(pattern => pool.some(exercise => exercise.movement_pattern === pattern)).map(pattern => pick(pattern, index))
      const exercises = chosen.map(exercise => {
        const item = prescription(exercise, profile, lighter)
        for (const muscle of exercise.primary_muscles) weeklySets[muscle] = (weeklySets[muscle] ?? 0) + item.target_sets
        return item
      })
      return { name: split ? index % 2 === 0 ? 'Upper body' : 'Lower body & trunk' : `Full body ${index + 1}`, weekday, exercises }
    })
    return {
      key, rationale: `${profile.experience} training with a ${profile.goal.replaceAll('_', ' ')} focus. ${days.length} sessions use your available days; ${lighter ? 'fewer starting sets keep the initial workload manageable' : 'working sets are spread across the week'}.`,
      cautions: [...limitations, 'Sets, rep ranges, and rest are adjustable starting defaults, not uniquely effective prescriptions. Use controlled technique; no 1RM test or training to failure is required.'],
      weeklySets,
      document: {
        name, goal: profile.goal, origin_template_key: key, recommendation_version: RECOMMENDATION_VERSION,
        assumptions: {
          profile: { goal: profile.goal, experience: profile.experience, available_weekdays: available, equipment: [...profile.equipment] },
          review_after_weeks: profile.timeline_weeks, limitations: [...limitations], source_urls: guidanceSources.map(source => source.url),
          guidance: 'Review the plan at your chosen timeline; results are not guaranteed. Weekly sets below higher-volume muscle-growth targets are starting workloads, not a claim to maximize growth.',
        }, days: routineDays,
      },
    }
  }
  const options = [
    build('full-body-foundation', 'Full body · foundation', baseDays, true),
    build('full-body-standard', 'Full body · standard', baseDays, false),
  ]
  const threeDays = bestFullBodyDays(available, 3)
  if (profile.experience !== 'beginner' && available.length >= 4 && pool.some(exercise => exercise.movement_pattern === 'vertical_push')) {
    options.push(build('upper-lower-four', 'Upper / lower · four days', available.slice(0, 4), false, true))
  } else if (threeDays) options.push(build('full-body-three', 'Full body · three days', threeDays, false))
  return { options, limitations }
}
