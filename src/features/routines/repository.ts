import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeProfile, type ProfileDraft } from '../profile/profile'
import type { Exercise, RoutineDocument, SavedRoutine, PlannedSet } from './types'

function editableAssumptions(value: Record<string, unknown> | null) {
  // Retry receipts are server bookkeeping, not editable recommendation inputs.
  return Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => !['_save_receipts', '_save_request_id', '_save_payload_hash'].includes(key)))
}

type RoutineRowDay = { id?: string; name: string; weekday: number | null; position: number; routine_exercises: { position: number; exercise_id: string; custom_exercise_name: string | null; planning_mode: string; target_sets: number; rep_min: number; rep_max: number; rest_seconds: number; notes: string; routine_planned_sets?: (PlannedSet & {position: number})[] }[] }

const failure = 'Unable to load routines. Check your connection and retry.'
export async function loadWorkspace(client: SupabaseClient, userId: string): Promise<{ profile: ProfileDraft | null; catalog: Exercise[]; routines: SavedRoutine[] }> {
  const routineQuery = (withTargets: boolean) => client.from('routines').select(withTargets ? '*,routine_days(*,routine_exercises(*,routine_planned_sets(*)))' : '*,routine_days(*,routine_exercises(*))').eq('user_id', userId).order('created_at', { ascending: false })
  const results = await Promise.all([
    client.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    // Retired catalog rows are still needed to name saved exercises exactly.
    // Recommendation generation and new library choices filter availability.
    client.from('exercises').select('*').order('name'),
    routineQuery(true),
  ])
  // Installed 001–006 remains readable before 007 is approved. Never hide
  // missing targets when 007 exists, or fall back for permission/network errors.
  if (['PGRST200','42P01','PGRST205'].includes(results[2].error?.code ?? '')) {
    results[2] = await routineQuery(false)
    if (results[2].data?.some(row => row.routine_days.some((day: RoutineRowDay) => day.routine_exercises.some(item => item.planning_mode === 'per_set')))) throw new Error('Your planned sets could not be loaded. Please try again later; your routine has not been changed.')
  }
  if (results.some(result => result.error)) throw new Error(failure)
  const [profile, catalog, routines] = results
  return {
    profile: profile.data ? normalizeProfile(profile.data) : null, catalog: catalog.data ?? [],
    routines: (routines.data ?? []).map(row => ({
      id: row.id, updated_at: row.updated_at, archived_at: row.archived_at,
      dayIds: [...row.routine_days].sort((a, b) => a.position - b.position).map((day: RoutineRowDay) => day.id ?? ''),
      document: {
        name: row.name, goal: row.goal, origin_template_key: row.origin_template_key,
        recommendation_version: row.recommendation_version, assumptions: editableAssumptions(row.assumptions),
        days: [...row.routine_days].sort((a, b) => a.position - b.position).map((day: RoutineRowDay) => ({
          name: day.name, weekday: day.weekday,
          exercises: [...day.routine_exercises].sort((a, b) => a.position - b.position).map(item => item.planning_mode === 'per_set' ? {
            exercise_id: item.exercise_id, custom_exercise_name: item.custom_exercise_name, planning_mode: 'per_set' as const,
            target_sets: null, rep_min: null, rep_max: null, rest_seconds: null, notes: item.notes,
            planned_sets: [...(item.routine_planned_sets ?? [])].sort((a,b) => a.position - b.position).map(({ reps, load_kg, entered_unit }) => ({ reps, load_kg: load_kg == null ? null : Number(load_kg), entered_unit })),
          } : {
            exercise_id: item.exercise_id, target_sets: item.target_sets, rep_min: item.rep_min,
            rep_max: item.rep_max, rest_seconds: item.rest_seconds, notes: item.notes,
          }),
        })),
      },
    })),
  }
}

// One server transaction saves the complete plan and optional target rows.
// UI success follows server confirmation; new targets never fall back to v1.
export async function saveRoutine(client: SupabaseClient, id: string, document: RoutineDocument, requestId: string, expectedUpdatedAt: string | null): Promise<string> {
  const { data, error } = await client.rpc(document.days.some(day => day.exercises.some(item => item.planning_mode === 'per_set')) ? 'fitness_save_routine_v2' : 'fitness_save_routine', {
    p_id: id, p_document: document, p_request_id: requestId, p_expected_updated_at: expectedUpdatedAt,
  })
  if (error || typeof data !== 'string') {
    if (error?.code === 'PGRST202' || error?.code === '42883') throw new Error('Routine saving is unavailable right now. Your draft is kept; please try again later.')
    if (error?.code === '55000') throw new Error('This routine was permanently deleted. Reload routines; your unsaved form is kept.')
    if (error?.code === '40001') throw new Error('This routine changed in another session. Reload routines before editing again; your unsaved form is still available here.')
    throw new Error('Routine was not saved. Check your connection and retry. Your form has been kept.')
  }
  return data
}

type RoutineAction = 'archive' | 'restore' | 'delete'
async function manageRoutine(client: SupabaseClient, userId: string, routine: SavedRoutine, action: RoutineAction): Promise<void> {
  const { data, error } = await client.rpc('fitness_manage_routine', {
    p_id: routine.id, p_action: action, p_expected_updated_at: routine.updated_at, p_expected_user_id: userId,
  })
  if (error?.code === 'PGRST202' || error?.code === '42883') throw new Error('Routine management is unavailable right now. Nothing was changed; please try again later.')
  if (error?.code === '55000') throw new Error('Finish or cancel unfinished workouts before deleting this routine. Your workout progress is kept.')
  if (error?.code === '40001') throw new Error('This routine changed in another session. Reload routines before retrying.')
  const status = { archive: 'archived', restore: 'active', delete: 'deleted' }[action]
  if (error || data?.id !== routine.id || data?.status !== status) throw new Error(`Routine was not ${action === 'delete' ? 'deleted' : action === 'archive' ? 'archived' : 'restored'}. Reload routines and retry; no success was confirmed.`)
}
export const archiveRoutine = (client: SupabaseClient, userId: string, routine: SavedRoutine) => manageRoutine(client, userId, routine, 'archive')
export const restoreRoutine = (client: SupabaseClient, userId: string, routine: SavedRoutine) => manageRoutine(client, userId, routine, 'restore')
export const deleteRoutine = (client: SupabaseClient, userId: string, routine: SavedRoutine) => manageRoutine(client, userId, routine, 'delete')
