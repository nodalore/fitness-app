import { validateProfile, type ProfileDraft } from '../profile/profile'
import { exerciseMetadata, suitabilityScore, suitableEquipment } from './exerciseMetadata'
import type { Exercise, Prescription, Recommendation, RoutineDayDraft } from './types'

export const RECOMMENDATION_VERSION = 'rules-2.0'
const corePatterns = ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'trunk']
const mainPatterns = [...corePatterns.slice(0, 4), 'vertical_push', 'vertical_pull']
export const guidanceSources = [
  { title: 'ACSM 2026 position stand', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/' },
  { title: 'NSCA movement progressions', url: 'https://www.nsca.com/education/articles/ptq/teaching-resistance-training-movement-patterns/' },
  { title: 'Kassiano et al. 2022 — exercise variation', url: 'https://pubmed.ncbi.nlm.nih.gov/35438660/' },
  { title: 'Ramos-Campo et al. 2024 — split vs full body', url: 'https://pubmed.ncbi.nlm.nih.gov/38595233/' },
  { title: 'CDC adult activity guidance', url: 'https://www.cdc.gov/physical-activity-basics/guidelines/adults.html' },
]
export const compatible = suitableEquipment

export function prescription(exercise: Exercise, profile: ProfileDraft, lighter = false): Prescription {
  const main = mainPatterns.includes(exercise.movement_pattern)
  const novice = profile.experience === 'beginner'
  const strength = !novice && main && profile.goal === 'strength' && exercise.loading_mode !== 'bodyweight'
  return {
    exercise_id: exercise.id,
    target_sets: lighter ? 1 : novice ? 2 : profile.experience === 'advanced' && main ? 4 : 3,
    rep_min: strength ? 4 : main || exercise.movement_pattern === 'trunk' ? 8 : 10,
    rep_max: strength ? 8 : main || exercise.movement_pattern === 'trunk' ? 12 : 15,
    rest_seconds: strength ? Math.max(180, exercise.default_rest_max_seconds) : exercise.default_rest_min_seconds,
    notes: exercise.technique_notes,
  }
}

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

function weeklyBudget(profile: ProfileDraft, pattern: string, lighter: boolean) {
  if (profile.experience === 'beginner') return lighter ? 2 : 4
  if (!mainPatterns.includes(pattern)) return lighter ? 2 : 4
  if (profile.goal === 'general_fitness' || profile.experience === 'intermediate') return lighter ? 4 : 6
  if (lighter) return 6
  return profile.goal === 'muscle_growth' ? 10 : 8
}

export function recommendRoutines(profile: ProfileDraft, catalog: Exercise[]): { options: Recommendation[]; limitations: string[] } {
  if (validateProfile(profile, true)) return { options: [], limitations: ['Confirm your profile and training frequency (2–6) before generating plans. Saved routines are unchanged.'] }
  const requested = profile.training_days_per_week!
  const count = profile.experience === 'beginner' ? Math.min(requested, 3) : requested
  const limitations: string[] = []
  if (count !== requested) limitations.push(`You requested ${requested} days. Start with ${count} full-body sessions as a beginner; add frequency as you build experience.`)
  const pool = catalog.filter(exercise => compatible(exercise, profile) && !(profile.experience === 'beginner' && exerciseMetadata[exercise.slug]?.experienced))
  const missing = corePatterns.filter(pattern => !pool.some(exercise => exercise.movement_pattern === pattern))
  if (missing.length) return { options: [], limitations: [`No complete plan with your confirmed equipment: missing ${missing.map(pattern => pattern.replaceAll('_',' ')).join(', ')}. Confirm equipment in Profile or build a custom plan. The catalog expansion requires reviewed migration 005.`] }
  const planRoles = roles(count)
  // Split options need vertical coverage, not a renamed incomplete upper/lower plan.
  if (count >= 4 && ['vertical_push','vertical_pull'].some(pattern => !pool.some(exercise => exercise.movement_pattern === pattern))) return { options: [], limitations: ['This split needs vertical push and pull coverage. Confirm the required equipment, review catalog migration 005, or choose 2–3 training days. Saved plans remain available.'] }
  const unavailable = [...new Set(planRoles.flatMap(role => role.patterns))].filter(pattern => !pool.some(exercise => exercise.movement_pattern === pattern))
  if (unavailable.length) limitations.push(`Available starting plan omits ${unavailable.map(pattern => pattern.replaceAll('_',' ')).join(', ')}. Review muscle coverage before adding work.`)
  const repeat = corePatterns.filter(pattern => pool.filter(exercise => exercise.movement_pattern === pattern).length === 1)
  if (repeat.length) limitations.push('Some movements repeat because only one suitable option is available. Keep these anchors consistent for progression.')
  const recovery = 'Choose your training days. Allow recovery before training the same muscles again; insert rest days as needed. After a missed day, continue the workout order rather than doubling sessions.'
  const effort = 'Use a challenging load you can control. Leave a few reps in reserve; no 1RM test or failure training is required. Experience does not establish your current strength or recovery.'
  const build = (lighter: boolean, alternate = false): Recommendation => {
    const familyOccurrences: Record<string, number> = {}
    const chosen = planRoles.map(role => {
      const variant = familyOccurrences[role.family] ?? 0
      familyOccurrences[role.family] = variant + 1
      return role.patterns.flatMap(pattern => {
        let candidates = pool.filter(exercise => exercise.movement_pattern === pattern)
        // Never rotate back to an unloaded squat to manufacture variety.
        if ((profile.experience !== 'beginner' || alternate) && candidates.some(exercise => exercise.loading_mode !== 'bodyweight')) candidates = candidates.filter(exercise => exercise.loading_mode !== 'bodyweight')
        candidates.sort((a,b) => suitabilityScore(b,profile) - suitabilityScore(a,profile) || a.slug.localeCompare(b.slug))
        if (!candidates.length) return []
        // Strength anchors stay specific; variation comes from accessories and emphasis.
        const fixed = !alternate && profile.goal === 'strength' && ['squat','horizontal_push','hinge'].includes(pattern)
        return [candidates[fixed ? 0 : (variant + (alternate ? 1 : 0)) % Math.min(2,candidates.length)]]
      })
    })
    const occurrences: Record<string, number> = {}
    chosen.flat().forEach(exercise => { occurrences[exercise.movement_pattern] = (occurrences[exercise.movement_pattern] ?? 0) + 1 })
    const used: Record<string, number> = {}
    const weeklySets: Record<string, number> = {}
    const weeklyPatternSets: Record<string, number> = {}
    const days: RoutineDayDraft[] = chosen.map((exercises,index) => ({
      name: planRoles[index].name, weekday: null,
      exercises: exercises.map(exercise => {
        const pattern = exercise.movement_pattern
        const novice = profile.experience === 'beginner'
        // Weekly budget is distributed across exposures, not multiplied by days.
        const budget = weeklyBudget(profile, pattern, lighter)
        const position = used[pattern] ?? 0
        used[pattern] = position + 1
        const sets = Math.max(1, Math.min(novice ? 2 : profile.experience === 'advanced' ? 4 : 3, Math.floor(budget / occurrences[pattern]) + (position < budget % occurrences[pattern] ? 1 : 0)))
        const item = { ...prescription(exercise, profile, lighter), target_sets: sets }
        weeklyPatternSets[pattern] = (weeklyPatternSets[pattern] ?? 0) + sets
        exercise.primary_muscles.forEach(muscle => { weeklySets[muscle] = (weeklySets[muscle] ?? 0) + sets })
        return item
      }),
    }))
    // Change emphasis without swapping strength anchors in B workouts.
    days.forEach((day,index) => {
      if (index > 0 && day.name.endsWith('B') && profile.goal === 'strength') day.exercises = [...day.exercises.slice(1), day.exercises[0]]
    })
    const split = count <= 3 ? 'Full body' : count === 4 ? 'Upper / lower' : count === 5 ? 'Upper / lower + PPL' : 'Push / pull / legs'
    const key = `${count <= 3 ? 'full-body' : `split-${count}`}-${alternate ? 'alternate' : lighter ? 'foundation' : 'standard'}`
    const rationale = `${count} sessions · ${profile.experience} · ${profile.goal.replaceAll('_',' ')}. ${alternate ? 'Alternate main exercises at standard volume.' : lighter ? 'Lower weekly volume.' : 'More working sets.'} Main exercises stay stable across weeks.`
    const cautions = [...limitations, recovery, effort, 'Sets, reps, rest and split choices are editable app defaults. Primary-muscle set totals exclude secondary involvement and are not a guarantee of growth.']
    return { key, rationale, cautions, weeklySets, document: {
      name: `${split} · ${alternate ? 'alternate' : lighter ? 'foundation' : 'standard'}`, goal: profile.goal,
      origin_template_key: key, recommendation_version: RECOMMENDATION_VERSION,
      assumptions: {
        profile: { goal: profile.goal, experience: profile.experience, training_days_per_week: requested, equipment: [...profile.equipment], equipment_details: [...(profile.equipment_details ?? [])] },
        sessions_per_week: count, exercise_selection: alternate ? 'alternate' : 'primary', review_after_weeks: profile.timeline_weeks,
        weekly_primary_sets: weeklySets, weekly_pattern_sets: weeklyPatternSets,
        limitations: [...limitations], recovery, effort, source_urls: guidanceSources.map(source => source.url),
        guidance: 'Review at your chosen timeline; results are not guaranteed. Initial volume may be below higher-volume hypertrophy targets. Increase gradually based on recovery, not experience label alone.',
      }, days,
    } }
  }
  const seen = new Set<string>()
  const standard = build(false)
  const alternate = build(false, true)
  const mainSelection = (option: Recommendation) => JSON.stringify(option.document.days.map(day => day.exercises.filter(item => mainPatterns.includes(pool.find(exercise => exercise.id === item.exercise_id)!.movement_pattern)).map(item => item.exercise_id)))
  const candidates = [build(true), standard]
  if (mainSelection(standard) !== mainSelection(alternate)) candidates.push(alternate)
  const options = candidates.filter(option => {
    const signature = JSON.stringify(option.document.days)
    if (seen.has(signature)) return false
    seen.add(signature); return true
  })
  if (options.length < 2) limitations.push('Only one distinct workload fits these constraints.')
  return { options, limitations }
}
