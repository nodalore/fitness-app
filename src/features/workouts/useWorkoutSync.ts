import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { WorkoutSync, type SyncState } from './WorkoutSync'
import type { WorkoutRepository } from './workoutRepository'
import { workoutRecovery } from './workoutRecovery'
export type WorkoutPersistence = { repository: WorkoutRepository; userId: string }
const empty: SyncState = { draft: null, status: 'idle', error: '', resumable: [], finished: null, finishing: false, cancelling: false, cancelRequested: false }
const noSubscribe = () => () => {}
const getEmpty = () => empty
export function useWorkoutSync(persistence?: WorkoutPersistence) {
  const sync = useMemo(() => persistence ? new WorkoutSync(persistence.repository, workoutRecovery(persistence.userId)) : null, [persistence?.repository, persistence?.userId])
  const state = useSyncExternalStore(sync?.subscribe ?? noSubscribe, sync?.getSnapshot ?? getEmpty)
  useEffect(() => { if (!sync) return; sync.activate(); void sync.load(); return () => sync.close() }, [sync])
  return { sync, state }
}
