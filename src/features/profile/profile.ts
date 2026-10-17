export const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const equipmentOptions = ['bodyweight', 'dumbbell', 'barbell', 'machine', 'band']
export type ProfileDraft = {
  display_name: string
  goal: string
  experience: string
  available_weekdays: number[]
  timeline_weeks: number
  equipment: string[]
  display_unit: string
  timezone: string
}
export const defaultProfile: ProfileDraft = {
  display_name: '', goal: 'general_fitness', experience: 'beginner', available_weekdays: [1, 3],
  timeline_weeks: 8, equipment: ['bodyweight'], display_unit: 'kg', timezone: 'UTC',
}

export function validateProfile(profile: ProfileDraft): string | null {
  if (profile.display_name.trim().length > 80) return 'Keep your name to 80 characters or fewer.'
  if (!['general_fitness', 'strength', 'muscle_growth'].includes(profile.goal)) return 'Choose a valid goal.'
  if (!['beginner', 'intermediate', 'advanced'].includes(profile.experience)) return 'Choose your experience level.'
  if (!profile.available_weekdays.length || profile.available_weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) return 'Choose at least one available day.'
  if (!Number.isInteger(profile.timeline_weeks) || profile.timeline_weeks < 1 || profile.timeline_weeks > 52) return 'Choose a review timeline from 1 to 52 weeks.'
  if (!profile.equipment.length || profile.equipment.some(item => !equipmentOptions.includes(item))) return 'Choose your available equipment.'
  if (!['kg', 'lb'].includes(profile.display_unit)) return 'Choose kg or lb.'
  try {
    if (!profile.timezone || profile.timezone.length > 100) throw new Error()
    new Intl.DateTimeFormat('en', { timeZone: profile.timezone }).format()
  } catch { return 'Enter a valid timezone, such as America/New_York or UTC.' }
  return null
}
