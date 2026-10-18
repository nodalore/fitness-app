export const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const equipmentOptions = ['bodyweight', 'dumbbell', 'barbell', 'machine', 'band']
export const equipmentDetails = { bench: 'Bench', rack: 'Squat rack + safeties', leg_press: 'Leg press', lat_pulldown: 'Lat pulldown', leg_curl: 'Leg curl', cable_station: 'Cable station', calf_machine: 'Calf raise machine', chest_press: 'Chest press machine', seated_row: 'Seated row machine', shoulder_press: 'Shoulder press machine', stable_support: 'Stable row support', band_anchor: 'Secure band anchor + attachments', pull_up_bar: 'Pull-up bar' }
export type ProfileDraft = {
  gender?: string | null
  display_name: string
  goal: string
  experience: string
  available_weekdays: number[]
  timeline_weeks: number
  equipment: string[]
  display_unit: string
  timezone: string
  training_days_per_week?: number | null
  equipment_details?: string[]
}
export const defaultProfile: ProfileDraft = {
  gender: null, display_name: '', goal: 'general_fitness', experience: 'beginner', available_weekdays: [1, 3],
  timeline_weeks: 8, equipment: ['bodyweight'], display_unit: 'kg', timezone: 'UTC', training_days_per_week: 3, equipment_details: [],
}

// Use the browser's IANA timezone; UTC keeps profile saving available if
// detection is unavailable. Persist this value for future date/week grouping.
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function validateProfile(profile: ProfileDraft, requireFrequency = false): string | null {
  if (profile.display_name.trim().length > 80) return 'Keep your name to 80 characters or fewer.'
  if (!['general_fitness', 'strength', 'muscle_growth'].includes(profile.goal)) return 'Choose a valid goal.'
  if (!['beginner', 'intermediate', 'advanced'].includes(profile.experience)) return 'Choose your experience level.'
  if ((requireFrequency || profile.training_days_per_week != null) && (!Number.isInteger(profile.training_days_per_week) || profile.training_days_per_week! < 2 || profile.training_days_per_week! > 6)) return 'Choose 2–6 training days per week.'
  if (profile.equipment_details?.some(item => !(item in equipmentDetails))) return 'Choose valid equipment details.'
  if (!profile.available_weekdays.length || profile.available_weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) return 'Choose at least one available day.'
  if (!Number.isInteger(profile.timeline_weeks) || profile.timeline_weeks < 1 || profile.timeline_weeks > 52) return 'Choose a review timeline from 1 to 52 weeks.'
  if (!profile.equipment.length || profile.equipment.some(item => !equipmentOptions.includes(item))) return 'Choose your available equipment.'
  if (!['kg', 'lb'].includes(profile.display_unit)) return 'Choose kg or lb.'
  try {
    if (!profile.timezone || profile.timezone.length > 100) throw new Error()
    new Intl.DateTimeFormat('en', { timeZone: profile.timezone }).format()
  } catch { return 'Unable to determine your timezone. Please reload and try again.' }
  return null
}

// Read every schema version without inventing an explicit frequency preference.
export function normalizeProfile(value: ProfileDraft): ProfileDraft {
  return {
    gender: value.gender ?? null, display_name: value.display_name, goal: value.goal, experience: value.experience,
    available_weekdays: value.available_weekdays, timeline_weeks: value.timeline_weeks,
    equipment: value.equipment, display_unit: value.display_unit, timezone: value.timezone,
    training_days_per_week: value.training_days_per_week ?? null,
    equipment_details: value.equipment_details ?? [],
  }
}
export function legacyFrequencySuggestion(profile: ProfileDraft): number | null {
  const count = new Set(profile.available_weekdays.filter(day => Number.isInteger(day) && day >= 0 && day <= 6)).size
  return count >= 2 && count <= 6 ? count : null
}

export const genderOptions = { woman: 'Woman', man: 'Man', non_binary: 'Non-binary', prefer_not_to_say: 'Prefer not to say' }

// Only these fields belong to the simplified form. Never spread a loaded row
// into a write: hidden preferences may have changed in another browser.
export function profilePatch(profile: ProfileDraft, userId: string) {
  return { user_id: userId, display_name: profile.display_name.trim(), gender: profile.gender,
    goal: profile.goal, experience: profile.experience,
    training_days_per_week: profile.training_days_per_week, timezone: detectTimezone() }
}
export function validateProfileForm(profile: ProfileDraft): string | null {
  if (!Object.hasOwn(genderOptions, profile.gender ?? '')) return 'Choose your gender, including Prefer not to say.'
  // Reuse established validation with defaults for fields this form cannot edit.
  return validateProfile({ ...defaultProfile, display_name: profile.display_name,
    goal: profile.goal, experience: profile.experience,
    training_days_per_week: profile.training_days_per_week, timezone: detectTimezone() }, true)
}
