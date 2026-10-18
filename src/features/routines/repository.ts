import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeProfile, type ProfileDraft } from '../profile/profile'
import type { Exercise, RoutineDocument, SavedRoutine } from './types'

function editableAssumptions(value: Record<string, unknown> | null) {
  // Retry receipts are server bookkeeping, not editable recommendation inputs.
  return Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => !['_save_receipts', '_save_request_id', '_save_payload_hash'].includes(key)))
}

const failure = 'Unable to load routines. Check your connection and database setup, then retry.'
export async function loadWorkspace(client: SupabaseClient, userId: string): Promise<{ profile: ProfileDraft | null; catalog: Exercise[]; routines: SavedRoutine[] }> {
  const results = await Promise.all([
    client.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    client.from('exercises').select('*').is('deprecated_at', null).order('name'),
    client.from('routines').select('*,routine_days(*,routine_exercises(*))').eq('user_id', userId).order('created_at', { ascending: false }),
  ])
  if (results.some(result => result.error)) throw new Error(failure)
  const [profile, catalog, routines] = results
  return {
    profile: profile.data ? normalizeProfile(profile.data) : null, catalog: catalog.data ?? [],
    routines: (routines.data ?? []).map(row => ({
      id: row.id, updated_at: row.updated_at, archived_at: row.archived_at,
      document: {
        name: row.name, goal: row.goal, origin_template_key: row.origin_template_key,
        recommendation_version: row.recommendation_version, assumptions: editableAssumptions(row.assumptions),
        days: [...row.routine_days].sort((a, b) => a.position - b.position).map(day => ({
          name: day.name, weekday: day.weekday,
          exercises: [...day.routine_exercises].sort((a, b) => a.position - b.position).map(item => ({
            exercise_id: item.exercise_id, target_sets: item.target_sets, rep_min: item.rep_min,
            rep_max: item.rep_max, rest_seconds: item.rest_seconds, notes: item.notes,
          })),
        })),
      },
    })),
  }
}

// One server transaction saves all three tables. UI success follows server confirmation.
export async function saveRoutine(client: SupabaseClient, id: string, document: RoutineDocument, requestId: string, expectedUpdatedAt: string | null): Promise<string> {
  const { data, error } = await client.rpc('fitness_save_routine', {
    p_id: id, p_document: document, p_request_id: requestId, p_expected_updated_at: expectedUpdatedAt,
  })
  if (error || typeof data !== 'string') {
    if (error?.code === 'PGRST202' || error?.code === '42883') throw new Error('Routine saving needs the reviewed Stage 3 SQL function. Review the migration guide before applying it in Supabase SQL Editor.')
    if (error?.code === '40001') throw new Error('This routine changed in another session. Reload routines before editing again; your unsaved form is still available here.')
    throw new Error('Routine was not saved. Check your connection and retry. Your form has been kept.')
  }
  return data
}

export async function archiveRoutine(client: SupabaseClient, userId: string, routine: SavedRoutine) {
  const { data, error } = await client.from('routines').update({ archived_at: new Date().toISOString() }).eq('user_id', userId).eq('id', routine.id).eq('updated_at', routine.updated_at).is('archived_at', null).select('id').single()
  if (error || !data) throw new Error('Routine was not archived. It may have changed in another session; reload and retry.')
}
