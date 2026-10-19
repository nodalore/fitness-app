import type { WorkoutDraft } from './workoutDraft'
import { WorkoutConflict, type SavedWorkout, type WorkoutRepository } from './workoutRepository'
type Pending = { draft: WorkoutDraft; revision: number | null; request: string; finish: boolean }
export type Recovery = { draft: WorkoutDraft; revision: number | null; pending: Pending | null; dirty: boolean; cancelRequested?: boolean }
export type RecoveryCache = { read(): Recovery[]; put(entry: Recovery): void; remove(id: string): void }
export type SyncState = { draft: WorkoutDraft | null; status: 'loading' | 'idle' | 'saving' | 'saved' | 'error' | 'conflict'; error: string; resumable: SavedWorkout[]; finished: WorkoutDraft | null; finishing: boolean; cancelling: boolean; cancelRequested: boolean }
// One in-flight request. Later edits remain queued; a failed payload is never
// changed before retrying its request ID, even if the first response was lost.
export class WorkoutSync {
  private state: SyncState = { draft: null, status: 'loading', error: '', resumable: [], finished: null, finishing: false, cancelling: false, cancelRequested: false }
  private listeners = new Set<() => void>()
  private revision: number | null = null
  private pending: Pending | null = null
  private dirty = false
  private busy = false
  private generation = 0
  private closed = false
  private timer: ReturnType<typeof setTimeout> | undefined
  constructor(private repository: WorkoutRepository, private cache: RecoveryCache) {}
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private patch(change: Partial<SyncState>) { if (this.closed) return; this.state = { ...this.state, ...change }; this.listeners.forEach(fn => fn()) }
  private remember() {
    if (!this.state.draft) return
    try {
      if (!this.dirty && !this.pending && !this.state.cancelRequested) this.cache.remove(this.state.draft.id)
      else this.cache.put({ draft: this.state.draft, revision: this.revision, pending: this.pending, dirty: this.dirty, cancelRequested: this.state.cancelRequested })
    } catch { this.patch({ error: 'Changes cannot be kept on this device right now. Keep this page open until saving is confirmed.' }) }
  }
  activate() { this.closed = false }
  async load() {
    try {
      const saved = await this.repository.load()
      const recovered = this.cache.read()
      this.patch({ status: 'idle', error: '', resumable: [...recovered.map(entry => ({ draft: entry.draft, revision: entry.revision ?? 0 })), ...saved.filter(entry => !recovered.some(local => local.draft.id === entry.draft.id))] })
    } catch (error) { this.patch({ status: 'error', error: (error as Error).message, resumable: this.cache.read().map(entry => ({ draft: entry.draft, revision: entry.revision ?? 0 })) }) }
  }
  start(draft: WorkoutDraft) {
    if (this.busy || this.state.draft || this.state.cancelRequested) return
    this.revision = null; this.pending = null; this.dirty = true
    this.patch({ draft, status: 'saving', error: '', finished: null }); this.remember(); this.schedule()
  }
  resume(saved: SavedWorkout) {
    if (this.busy || this.state.draft || this.state.cancelRequested) return
    const local = this.cache.read().find(entry => entry.draft.id === saved.draft.id)
    this.revision = local ? local.revision : saved.revision; this.pending = local?.pending ?? null; this.dirty = local?.dirty ?? false
    this.patch({ draft: structuredClone(local?.draft ?? saved.draft), status: local?.cancelRequested || this.dirty || this.pending ? 'error' : 'saved', error: local?.cancelRequested ? 'Cancellation could not be confirmed. Retry cancellation.' : this.dirty || this.pending ? 'You have unsaved changes. Retry saving.' : '', finishing: this.pending?.finish ?? false, finished: null, cancelRequested: local?.cancelRequested ?? false, cancelling: false })
  }
  // A cancellation marker must be persisted before issuing the RPC. If its
  // response is lost, refresh resumes cancellation, never the old autosave.
  async cancel() {
    if (this.closed || !this.state.draft || this.state.finishing || this.state.cancelling) return
    clearTimeout(this.timer)
    const id = this.state.draft.id
    ++this.generation // Ignore all results/errors from pre-cancellation autosaves.
    this.busy = false
    this.patch({ cancelling: true, cancelRequested: true, status: 'saving', error: '' })
    this.remember()
    try {
      await this.repository.cancel(id)
      if (this.closed) return
      this.pending = null; this.dirty = false; this.revision = null
      let storageError = ''
      try { this.cache.remove(id) } catch { storageError = 'Workout canceled, but device recovery could not be cleared.' }
      this.patch({ draft: null, status: 'idle', error: storageError, finished: null, cancelling: false, cancelRequested: false, resumable: this.state.resumable.filter(item => item.draft.id !== id) })
    } catch (error) {
      if (this.closed) return
      // A definite ownership/completed refusal is not an ambiguous network loss.
      this.patch({ cancelling: false, cancelRequested: !(error instanceof WorkoutConflict), status: error instanceof WorkoutConflict ? 'conflict' : 'error', error: (error as Error).message })
      this.remember()
    }
  }
  change(draft: WorkoutDraft) {
    if (this.state.finishing || this.state.cancelRequested || !this.state.draft) return
    this.dirty = true; this.patch({ draft, error: ['error','conflict'].includes(this.state.status) ? this.state.error : '' }); this.remember()
    if (!['error','conflict'].includes(this.state.status)) { this.patch({ status: 'saving' }); this.schedule() }
  }
  private schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => { void this.flush() }, 400) }
  async flush(finish = false) {
    clearTimeout(this.timer)
    if (this.closed || this.busy || !this.state.draft || this.state.status === 'conflict' || this.state.cancelRequested) return
    if (finish) this.patch({ finishing: true })
    if (!this.pending && !this.dirty && !finish) return
    const generation = this.generation
    this.busy = true; this.patch({ status: 'saving', error: '' })
    try {
      while (!this.closed && (this.pending || this.dirty || finish)) {
        if (!this.pending) {
          this.pending = { draft: structuredClone(this.state.draft!), revision: this.revision, request: crypto.randomUUID(), finish }
          this.dirty = false
        }
        this.remember()
        const sent = this.pending
        const result = await this.repository.save(sent.draft, sent.revision, sent.request, sent.finish)
        if (this.closed || generation !== this.generation) return
        this.revision = result.revision; this.pending = null
        if (result.status === 'completed') {
          try { this.cache.remove(sent.draft.id) } catch { /* server completion is confirmed */ }
          this.patch({ draft: null, finished: sent.draft, finishing: false, status: 'saved', resumable: this.state.resumable.filter(item => item.draft.id !== sent.draft.id) }); this.dirty = false; return
        }
        this.remember()
        // An earlier autosave can precede a finish request; finish the newest draft.
        if (sent.finish) throw new Error('Finishing could not be confirmed. Retry.')
        if (!this.dirty && !finish) break
      }
      this.patch({ status: 'saved', error: '' })
    } catch (error) {
      if (this.closed || generation !== this.generation) return
      this.patch({ status: error instanceof WorkoutConflict ? 'conflict' : 'error', error: (error as Error).message })
      this.remember()
    } finally { if (generation === this.generation) this.busy = false }
  }
  async leave() {
    if (this.busy || this.state.finishing || this.state.cancelRequested) return
    await this.flush()
    if (this.state.status !== 'saved') return
    this.patch({ draft: null, status: 'idle' }); await this.load()
  }
  canSaveIndependent() { return this.state.status === 'conflict' && !this.state.cancelRequested && this.revision === null && !!this.state.draft?.routineId }
  async saveIndependent() {
    if (!this.canSaveIndependent() || this.busy) return
    // Resolve a lost first acknowledgement before detaching anything. A real
    // existing server session must be reloaded, never recreated under a new ID.
    try {
      const saved = await this.repository.load()
      if (saved.some(item => item.draft.id === this.state.draft!.id)) { this.patch({ error: 'This workout is already saved. Load the saved workout before continuing.' }); return }
      const draft = { ...this.state.draft!, routineId: null, routineDayId: null, routineVersion: null }
      this.pending = null; this.dirty = true
      this.patch({ draft, status: 'saving', error: '', finishing: false }); this.remember(); await this.flush()
    } catch (error) { this.patch({ error: (error as Error).message }) }
  }
  async reload() {
    // Keep the recovery copy until the user explicitly chooses the server version.
    if (this.busy || this.state.cancelRequested) return
    try {
      const saved = await this.repository.load()
      const remote = saved.find(item => item.draft.id === this.state.draft?.id)
      if (!remote) { this.patch({ error: 'No saved unfinished workout was found. Your changes are kept on this device.' }); return }
      this.revision = remote.revision; this.pending = null; this.dirty = false; this.cache.remove(remote.draft.id)
      this.patch({ draft: remote.draft, status: 'saved', error: '', finishing: false });
    } catch (error) { this.patch({ error: (error as Error).message }) }
  }
  close() { this.closed = true; clearTimeout(this.timer); this.listeners.clear() }
}
