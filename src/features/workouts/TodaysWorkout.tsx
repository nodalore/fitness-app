import { useEffect, useRef, useState, type Dispatch, type SetStateAction, type FormEvent } from 'react'
import type { Exercise, SavedRoutine } from '../routines/types'
import { actualSetError, finishError, createWorkout, emptyActualSet, poundsPerKg, type ActualSet, type WorkoutDraft, type WorkoutExercise } from './workoutDraft'

import { useWorkoutSync, type WorkoutPersistence } from './useWorkoutSync'

type Props = { routines: SavedRoutine[]; catalog: Exercise[]; defaultUnit: 'kg' | 'lb'; persistence?: WorkoutPersistence }
export function TodaysWorkout({ routines, catalog, defaultUnit, persistence }: Props) {
  const [routineId, setRoutineId] = useState('')
  const [localDraft, setLocalDraft] = useState<WorkoutDraft | null>(null)
  const { sync, state } = useWorkoutSync(persistence)
  const draft = sync ? state.draft : localDraft
  const setDraft: Dispatch<SetStateAction<WorkoutDraft | null>> = update => {
    if (!sync) { setLocalDraft(update); return }
    const next = typeof update === 'function' ? update(sync.getSnapshot().draft) : update
    if (next) { if (draft) sync.change(next); else sync.start(next) }
  }
  const [finishPreview, setFinishPreview] = useState(false)
  const [reloadPreview, setReloadPreview] = useState(false)
  const [independentPreview, setIndependentPreview] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [composer, setComposer] = useState<{ replacing: string | null; name: string; exerciseId: string | null } | null>(null)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [discard, setDiscard] = useState(false)
  const sessionTitle = useRef<HTMLHeadingElement>(null)
  useEffect(() => { sessionTitle.current?.focus({ preventScroll: true }) }, [draft?.id])
  const active = routines.filter(routine => !routine.archived_at)
  const routine = active.find(item => item.id === routineId)
  function updateExercise(id: string, change: Partial<WorkoutExercise> | ((item: WorkoutExercise) => Partial<WorkoutExercise>)) {
    setDraft(current => current && ({ ...current, exercises: current.exercises.map(item => item.id === id ? { ...item, ...(typeof change === 'function' ? change(item) : change) } : item) }))
    setDirty(true); setError('')
  }
  function updateSet(exercise: WorkoutExercise, id: string, patch: Partial<ActualSet>) {
    const set = { ...exercise.sets.find(item => item.id === id)!, ...patch }
    const validation = actualSetError(set)
    if (validation) { setError(validation); return }
    updateExercise(exercise.id, current => ({ sets: current.sets.map(item => item.id === id ? set : item) }))
  }
  function reset() { if (sync) {
    if (composer) { setError('Add or cancel the exercise you are entering before choosing another session.'); return }
    void sync.leave().then(() => { if (!sync.getSnapshot().draft) { setComposer(null); setOpenId(null); setError(''); setDirty(false) } }); return
  } setDraft(null); setOpenId(null); setComposer(null); setError(''); setDirty(false); setDiscard(false) }
  function addExercise(event: FormEvent) {
    event.preventDefault()
    if (!draft || !composer) return
    const name = composer.name.trim()
    if (!name || name.length > 100) { setError('Enter an exercise name of 1–100 characters.'); return }
    const entry = catalog.find(item => item.id === composer.exerciseId)
    if (composer.replacing) {
      setOpenId(composer.replacing)
      updateExercise(composer.replacing, { name, exerciseId: entry?.id ?? null, loadingMode: entry?.loading_mode ?? null, skipped: false, sets: [] })
    } else {
      const exercise: WorkoutExercise = { id: crypto.randomUUID(), name, exerciseId: entry?.id ?? null, loadingMode: entry?.loading_mode ?? null, source: null, skipped: false, sets: [] }
      setDraft({ ...draft, exercises: [...draft.exercises, exercise] }); setOpenId(exercise.id); setDirty(true)
    }
    setComposer(null); setError('')
  }
  const logged = draft?.exercises.filter(item => !item.skipped && !item.removed).flatMap(item => item.sets).length ?? 0
  const composerForm = composer && <form className="today-composer" onSubmit={addExercise}>
        <h4>{composer.replacing ? 'Replace for today' : 'Additional exercise'}</h4>
        <label>Today's exercise name<input autoFocus maxLength={100} value={composer.name} onChange={event => { setComposer({ ...composer, name: event.target.value, exerciseId: null }); setDirty(true); setError('') }} /></label>
        <details><summary>Choose from library</summary><label>Workout library exercise<select value={composer.exerciseId ?? ''} onChange={event => { const entry = catalog.find(item => item.id === event.target.value); if (entry) { setComposer({ ...composer, name: entry.name, exerciseId: entry.id }); setDirty(true) } }}><option value="">Select exercise</option>{catalog.filter(item => !item.deprecated_at).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></details>
        <div className="inline-actions"><button type="submit">{composer.replacing ? 'Replace for today' : 'Add to workout'}</button><button type="button" className="secondary-button" onClick={() => { setComposer(null); setError('') }}>Cancel exercise</button></div>
      </form>
  return <section className="todays-workout" aria-labelledby="today-title">
    <div className="today-heading"><div><p className="eyebrow">TRAIN / TODAY</p><h2 id="today-title">Today's Workout</h2></div>{draft && <span className="number">{logged} {logged === 1 ? 'set' : 'sets'} logged</span>}</div>
    {sync ? <div className="workout-save-state" aria-live="polite"><span>{({ loading: 'Loading unfinished workouts…', idle: 'Ready', saving: 'Saving…', saved: 'Saved to Supabase', error: 'Not saved', conflict: 'Save conflict' })[state.status]}</span>{['error','conflict'].includes(state.status) && <button type="button" className="text-button" onClick={() => draft ? state.status === 'conflict' ? setReloadPreview(true) : void sync.flush() : void sync.load()}>{state.status === 'conflict' ? 'Review server version' : 'Retry saving'}</button>}</div> : <p className="field-note">Local draft only · leaving this page or refreshing clears it.</p>}
    {state.error && <p role="alert">{state.error}</p>}
    {sync?.canSaveIndependent() && <button type="button" className="text-button" onClick={() => setIndependentPreview(true)}>Save captured workout independently</button>}
    {independentPreview && <div className="today-discard"><p>Save this workout without a routine link? Its captured names and actual sets will be kept.</p><button type="button" onClick={() => { setIndependentPreview(false); void sync?.saveIndependent() }}>Save captured workout</button><button type="button" className="secondary-button" onClick={() => setIndependentPreview(false)}>Keep my draft</button></div>}
    {state.finished && <p className="workout-finished">Workout finished · {state.finished.sessionName}. Saved to Supabase.</p>}
    {reloadPreview && <div className="today-discard"><p>Load the server version? Your unsent recovery copy is kept until you confirm.</p><button type="button" onClick={() => { void sync?.reload(); setReloadPreview(false) }}>Load server version</button><button type="button" className="secondary-button" onClick={() => setReloadPreview(false)}>Keep my draft</button></div>}
    {!draft ? <>
      {sync && state.resumable.length > 0 && <div className="resume-workouts"><h3>Unfinished workouts</h3>{state.resumable.map(item => <button key={item.draft.id} type="button" className="secondary-button" onClick={() => { sync.resume(item); setOpenId(null); setError('') }}>Resume {item.draft.sessionName}<small>{item.draft.routineName}</small></button>)}</div>}
      <fieldset className="editor-fields" disabled={Boolean(sync && ['loading','error','conflict'].includes(state.status))}>
      {active.length === 0 ? <p>Save a routine to start today's workout.</p> : <label>Choose a saved routine<select value={routine?.id ?? ''} onChange={event => { setRoutineId(event.target.value); setError('') }}><option value="">Select routine</option>{active.map(item => <option key={item.id} value={item.id}>{item.document.name}</option>)}</select></label>}
      {routine && <div className="today-session-grid" role="group" aria-label="Choose today's session">{routine.document.days.map((day, index) => <button type="button" className="secondary-button today-session" aria-label={`Day ${index + 1}: ${day.name}`} key={index} onClick={() => { setDraft(createWorkout(routine, index, catalog)); setOpenId(null); setDirty(false) }}><span className="number">Day {index + 1}</span><span>{day.name}<small>{day.exercises.length} exercises</small></span><span aria-hidden="true">↗</span></button>)}</div>}
      </fieldset>
    </> : <>
      <fieldset className="editor-fields" disabled={Boolean(state.finishing || finishPreview)}>
      <div className="today-context"><div><span className="field-note">{draft.routineName} · Day {draft.dayPosition + 1}</span><h3 ref={sessionTitle} tabIndex={-1}>{draft.sessionName}</h3></div><button type="button" className="text-button" disabled={Boolean(sync && state.status === 'saving')} onClick={() => sync ? reset() : dirty ? setDiscard(true) : reset()}>{sync ? 'Save & choose session' : 'Change session'}</button></div>
      {discard && <div className="today-discard" role="group" aria-label="Discard workout draft"><p>Discard today's unsaved changes?</p><button type="button" className="secondary-button" onClick={reset}>Discard workout</button><button type="button" className="text-button" onClick={() => setDiscard(false)}>Keep logging</button></div>}
      <ol className="today-exercises">{draft.exercises.filter(item => !item.removed).map((exercise, index) => <li key={exercise.id} className={`today-exercise ${exercise.skipped ? 'is-skipped' : ''}`}>
        <button type="button" className="today-exercise-toggle" aria-expanded={openId === exercise.id} aria-controls={`today-${exercise.id}`} onClick={() => { setOpenId(openId === exercise.id ? null : exercise.id); setError('') }}><span className="number">{String(index + 1).padStart(2, '0')}</span><span>{exercise.name}<small>{exercise.skipped ? 'Skipped today' : `${exercise.sets.length} ${exercise.sets.length === 1 ? 'set' : 'sets'} logged`}</small></span><span aria-hidden="true">{openId === exercise.id ? '−' : '+'}</span></button>
        {openId === exercise.id && <div id={`today-${exercise.id}`} className="today-exercise-body">
          {!exercise.skipped && <>
            {exercise.loadingMode === 'per_implement' && <p className="field-note">Weight per dumbbell / implement.</p>}
            <table className="actual-sets"><caption className="sr-only">Actual performance for {exercise.name}</caption><thead><tr><th scope="col">Set</th><th scope="col">Weight</th><th scope="col">Reps</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead><tbody>{exercise.sets.map((set, setIndex) => <tr key={set.id}>
              <th scope="row">{setIndex + 1}</th>
              <td><div className="actual-weight"><input type="number" inputMode="decimal" min={0} max={set.unit === 'lb' ? 10000 * poundsPerKg : 10000} step="any" aria-label={`Set ${setIndex + 1} weight`} placeholder="—" value={set.loadKg === null ? '' : Number((set.loadKg * (set.unit === 'lb' ? poundsPerKg : 1)).toFixed(6))} onChange={event => updateSet(exercise, set.id, { loadKg: event.target.value === '' ? null : Number(event.target.value) / (set.unit === 'lb' ? poundsPerKg : 1) })} /><select aria-label={`Set ${setIndex + 1} weight unit`} value={set.unit} onChange={event => updateSet(exercise, set.id, { unit: event.target.value as ActualSet['unit'] })}><option value="kg">kg</option><option value="lb">lb</option></select></div></td>
              <td><input type="number" inputMode="numeric" min={1} max={100} step={1} aria-label={`Set ${setIndex + 1} reps`} placeholder="—" value={set.reps ?? ''} onChange={event => updateSet(exercise, set.id, { reps: event.target.value === '' ? null : Number(event.target.value) })} /></td>
              <td><button type="button" className="text-button" aria-label={`Remove actual set ${setIndex + 1}`} onClick={() => updateExercise(exercise.id, current => ({ sets: current.sets.filter(item => item.id !== set.id) }))}>×</button></td>
            </tr>)}</tbody></table>
            {exercise.sets.length === 0 && <p className="field-note">Add a set to record what you performed.</p>}
            <button type="button" className="secondary-button" disabled={exercise.sets.length >= 10} onClick={() => updateExercise(exercise.id, current => ({ sets: [...current.sets, emptyActualSet(current.sets.at(-1)?.unit ?? defaultUnit)] }))}>Add set</button>
          </>}
          <div className="compact-actions today-adjust"><button type="button" className="text-button" onClick={() => { setComposer({ replacing: exercise.id, name: '', exerciseId: null }); setError('') }}>Replace exercise</button><button type="button" className="text-button" onClick={() => updateExercise(exercise.id, current => ({ skipped: !current.skipped }))}>{exercise.skipped ? 'Restore exercise' : 'Skip today'}</button><button type="button" className="text-button" onClick={() => { setDraft({ ...draft, exercises: draft.exercises.map(item => item.id === exercise.id ? { ...item, removed: true } : item) }); setOpenId(null); setComposer(null); setDirty(true); setError('') }}>Remove today</button></div>
          {composer?.replacing === exercise.id && <><p className="field-note">Replacement starts with no logged sets. The saved routine stays unchanged.</p>{composerForm}</>}
        </div>}
      </li>)}</ol>
      {!composer && <button type="button" className="secondary-button" disabled={draft.exercises.length >= 20} onClick={() => { setComposer({ replacing: null, name: '', exerciseId: null }); setError('') }}>Add exercise today</button>}
      {composer && (!composer.replacing || openId !== composer.replacing) && composerForm}
      </fieldset>
      {sync ? <div className="workout-finish-bar"><button type="button" disabled={state.finishing || state.status !== 'saved'} onClick={() => { if (composer) { setError('Add or cancel the exercise you are entering before finishing.'); return } const issue = finishError(draft); if (issue) { setError(issue); return } setError(''); setFinishPreview(true) }}>Finish Workout</button></div> : <p className="field-note">Actual performance only · not saved to Supabase yet.</p>}
      {finishPreview && <section className="today-discard" aria-label="Finish workout confirmation"><h3>Finish {draft.sessionName}?</h3><p>{draft.exercises.filter(item => !item.skipped && !item.removed && item.sets.length).length} exercises · {logged} performed sets</p><p className="field-note">Completed workouts are read-only.</p><button type="button" disabled={state.finishing} onClick={() => { setFinishPreview(false); void sync?.flush(true) }}>{state.finishing ? 'Finishing…' : 'Confirm finish'}</button><button type="button" className="secondary-button" disabled={state.finishing} onClick={() => setFinishPreview(false)}>Keep logging</button></section>}

    </>}
    {error && <p role="alert">{error}</p>}
  </section>
}
