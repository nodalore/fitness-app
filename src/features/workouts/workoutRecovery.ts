import type { Recovery, RecoveryCache } from './WorkoutSync'
import { actualSetError } from './workoutDraft'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function valid(entry: Recovery): boolean {
  const draft = entry?.draft
  return draft && uuid.test(draft.id) && typeof draft.routineName === 'string' && typeof draft.sessionName === 'string'
    && Array.isArray(draft.exercises) && draft.exercises.length <= 20
    && draft.exercises.every(e => uuid.test(e.id) && typeof e.name === 'string' && Array.isArray(e.sets) && e.sets.length <= 10 && e.sets.every(s => uuid.test(s.id) && ['kg','lb'].includes(s.unit) && actualSetError(s) === null))
    && (entry.cancelRequested === undefined || typeof entry.cancelRequested === 'boolean')
    && typeof entry.dirty === 'boolean' && (entry.dirty || !!entry.pending || entry.cancelRequested === true)
    && (entry.revision === null || Number.isSafeInteger(entry.revision))
    && (!entry.pending || (uuid.test(entry.pending.request) && entry.pending.draft?.id === draft.id && typeof entry.pending.finish === 'boolean' && valid({ draft: entry.pending.draft, revision: entry.pending.revision, pending: null, dirty: true })))
}
// Recovery only: no tokens, credentials or other accounts' keys are inspected.
export function workoutRecovery(userId: string, storage: () => Storage = () => localStorage): RecoveryCache {
  const key = `fitness-workout-recovery-v1:${userId}`
  function read(): Recovery[] {
    try {
      const raw = storage().getItem(key)
      if (!raw || raw.length > 4194304) return []
      const data = JSON.parse(raw)
      return Array.isArray(data) ? data.filter(valid) : []
    } catch { return [] }
  }
  return {
    read,
    put(entry) { const entries = read().filter(item => item.draft.id !== entry.draft.id); storage().setItem(key, JSON.stringify([...entries, entry])) },
    remove(id) { const entries = read().filter(item => item.draft.id !== id); if (entries.length) storage().setItem(key, JSON.stringify(entries)); else storage().removeItem(key) },
  }
}
