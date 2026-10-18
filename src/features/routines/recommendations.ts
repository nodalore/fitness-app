import type { ProfileDraft } from '../profile/profile'
import { exerciseMetadata, suitabilityScore } from './exerciseMetadata'
import { blankExercise, type Exercise, type Recommendation, type RoutineDayDraft } from './types'

export const RECOMMENDATION_VERSION = 'rules-3.0'
const corePatterns = ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'trunk']
export const guidanceSources = [
  { title: 'ACSM 2026 position stand', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/' },
  { title: 'NSCA movement progressions', url: 'https://www.nsca.com/education/articles/ptq/teaching-resistance-training-movement-patterns/' },
  { title: 'Kassiano et al. 2022 — exercise variation', url: 'https://pubmed.ncbi.nlm.nih.gov/35438660/' },
  { title: 'Ramos-Campo et al. 2024 — split vs full body', url: 'https://pubmed.ncbi.nlm.nih.gov/38595233/' },
  { title: 'CDC adult activity guidance', url: 'https://www.cdc.gov/physical-activity-basics/guidelines/adults.html' },
]
type Role = { name: string; family: string; patterns: string[] }
function roles(count: number): Role[] {
  const upper = ['horizontal_push', 'horizontal_pull', 'vertical_push', 'vertical_pull', 'elbow_flexion', 'elbow_extension']
  const lower = ['squat', 'hinge', 'knee_flexion', 'calf', 'trunk']
  const push = ['horizontal_push', 'vertical_push', 'lateral_raise', 'elbow_extension']
  const pull = ['horizontal_pull', 'vertical_pull', 'elbow_flexion', 'trunk']
  const legs = ['squat', 'hinge', 'knee_flexion', 'calf']
  const role = (name: string, family: string, patterns: string[]) => ({ name, family, patterns })
  if (count <= 3) return Array.from({ length: count }, (_, index) => role(`Full Body ${'ABC'[index]}`, 'full', [...corePatterns, index % 2 ? 'vertical_pull' : 'vertical_push', 'calf']))
  if (count === 4) return [role('Upper A','upper',upper),role('Lower A','lower',lower),role('Upper B','upper',upper),role('Lower B','lower',lower)]
  if (count === 5) return [role('Upper A','upper',upper),role('Lower A','lower',lower),role('Push','upper',push),role('Pull','upper',pull),role('Legs','lower',legs)]
  return [role('Push A','push',push),role('Pull A','pull',pull),role('Legs A','legs',legs),role('Push B','push',push),role('Pull B','pull',pull),role('Legs B','legs',legs)]
}


export function recommendRoutines(profile: ProfileDraft, catalog: Exercise[]): { options: Recommendation[]; limitations: string[] } {
  const count = profile.training_days_per_week
  if (!['general_fitness','strength','muscle_growth'].includes(profile.goal)
    || !['beginner','intermediate','advanced'].includes(profile.experience)
    || !Number.isInteger(count) || count! < 2 || count! > 6) return { options: [], limitations: ['Confirm your goal, experience and training frequency (2–6) in Profile.'] }
  const pool = catalog.filter(item => !item.deprecated_at && !(profile.experience === 'beginner' && exerciseMetadata[item.slug]?.experienced))
  const missing = corePatterns.filter(pattern => !pool.some(item => item.movement_pattern === pattern))
  if (missing.length) return { options: [], limitations: [`Catalog coverage missing: ${missing.join(', ')}. Saved routines remain available; you can create your own.`] }
  const limitations = ['Equipment availability is unknown. Check requirements and customize any exercise you cannot use.']
  if (profile.experience === 'beginner' && count! > 3) limitations.push('Higher frequency is optional. Keep sessions manageable and allow recovery; more days do not require more total work.')
  const families: Record<string, number> = {}
  const days: RoutineDayDraft[] = roles(count!).map(role => {
    const occurrence = families[role.family] ?? 0
    families[role.family] = occurrence + 1
    const exercises = role.patterns.flatMap(pattern => {
      let candidates = pool.filter(item => item.movement_pattern === pattern)
      if (candidates.some(item => item.loading_mode !== 'bodyweight')) candidates = candidates.filter(item => item.loading_mode !== 'bodyweight')
      candidates.sort((a,b) => suitabilityScore(b,profile) - suitabilityScore(a,profile) || a.slug.localeCompare(b.slug) || a.id.localeCompare(b.id))
      if (!candidates.length) return []
      // Repeat strength anchors; rotate accessories by family, never by global day index.
      const anchor = profile.goal === 'strength' && ['squat','hinge','horizontal_push'].includes(pattern)
      const choice = candidates[anchor ? 0 : occurrence % Math.min(2,candidates.length)]
      return [blankExercise('', choice.id)]
    })
    if (occurrence > 0 && profile.goal === 'strength' && exercises.length > 1) exercises.push(exercises.shift()!)
    return { name: role.name, weekday: null, exercises }
  })
  const omitted = [...new Set(roles(count!).flatMap(role => role.patterns))].filter(pattern => !pool.some(item => item.movement_pattern === pattern))
  if (omitted.length) limitations.push(`Catalog has no suitable ${omitted.join(', ').replaceAll('_',' ')} option. Review coverage when customizing.`)
  const split = count! <= 3 ? 'Full body' : count === 4 ? 'Upper / lower' : count === 5 ? 'Upper / lower + PPL' : 'Push / pull / legs'
  const key = `matched-${count}`
  return { limitations, options: [{ key, rationale: `${count} sessions · ${profile.experience} · ${profile.goal.replaceAll('_',' ')}. An explained app match, not a measured personal optimum.`,
    cautions: limitations, weeklySets: {}, document: { name: split, goal: profile.goal, origin_template_key: key,
      recommendation_version: RECOMMENDATION_VERSION, assumptions: {
        profile: { goal: profile.goal, experience: profile.experience, training_days_per_week: count },
        equipment_availability: 'unknown', targets: 'unset', limitations,
        recovery: 'Place rest days between repeated muscle groups as needed. Continue session order after a missed day.',
        source_urls: guidanceSources.map(source => source.url),
      }, days } }] }
}
