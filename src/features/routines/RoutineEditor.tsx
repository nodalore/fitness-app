import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ProfileDraft } from '../profile/profile'
import { validateExercise, validateRoutine } from './routineValidation'
import { blankExercise, type Exercise, type PerSetPrescription, type Prescription, type RoutineDayDraft, type RoutineDocument, type PlannedSet } from './types'

type Props = {
  initial: RoutineDocument; catalog: Exercise[]; profile?: ProfileDraft | null; editingExisting?: boolean;
  onSave: (document: RoutineDocument, requestId: string) => Promise<void>; onCancel: () => void;
}
type EditorDay = {
  day: RoutineDayDraft;
  // This input buffer is not a routine exercise until Add Exercise or Save.
  composer: PerSetPrescription;
  selected: number | null;
}
const LB_PER_KG = 2.20462262185
const hasInput = (item: PerSetPrescription) => Boolean(item.exercise_id || item.custom_exercise_name || item.notes || item.planned_sets.length)

export function RoutineEditor({ initial, catalog, profile, editingExisting = false, onSave, onCancel }: Props) {
  const [document, setDocument] = useState(() => structuredClone(initial))
  const [days, setDays] = useState<EditorDay[]>(() => initial.days.map(day => ({
    day: structuredClone(day), composer: blankExercise(), selected: day.exercises.length ? 0 : null,
  })))
  const [dayIndex, setDayIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true })
    const main = titleRef.current?.closest('main')
    if (main) main.scrollTop = 0
  }, [])
  const retry = useRef<{ json: string; requestId: string } | null>(null)
  const current = days[dayIndex]
  const { day, selected, composer } = current
  const item = selected === null ? composer : day.exercises[selected]
  const selectedExercise = item.exercise_id ? catalog.find(entry => entry.id === item.exercise_id) : null
  const unit: 'kg' | 'lb' = profile?.display_unit === 'lb' ? 'lb' : 'kg'
  const nameOf = (item: Prescription) => item.exercise_id
    ? catalog.find(entry => entry.id === item.exercise_id)?.name ?? 'Library exercise unavailable'
    : item.custom_exercise_name ?? ''

  function updateCurrent(next: EditorDay) { setDays(days.map((entry, i) => i === dayIndex ? next : entry)) }
  function changeDay(patch: Partial<RoutineDayDraft>) { updateCurrent({ ...current, day: { ...day, ...patch } }) }
  function changeExercise(next: Prescription) {
    if (selected === null) updateCurrent({ ...current, composer: next as PerSetPrescription })
    else changeDay({ exercises: day.exercises.map((entry, i) => i === selected ? next : entry) })
  }
  function changeSet(index: number, patch: Partial<PlannedSet>) {
    if (item.planning_mode !== 'per_set') return
    changeExercise({ ...item, planned_sets: item.planned_sets.map((entry, i) => i === index ? { ...entry, ...patch } : entry) })
  }
  function moveExercise(offset: number) {
    if (selected === null) return
    const exercises = [...day.exercises]
    ;[exercises[selected], exercises[selected + offset]] = [exercises[selected + offset], exercises[selected]]
    updateCurrent({ ...current, day: { ...day, exercises }, selected: selected + offset })
  }
  function addExercise() {
    const validation = validateExercise(item, catalog)
    if (validation) { setError(validation); return }
    if (selected !== null) {
      // Existing entries are edited in place in the local draft, never appended again.
      updateCurrent({ ...current, selected: null })
    } else {
      if (day.exercises.length >= 20) { setError('Use at most 20 exercises per day.'); return }
      updateCurrent({ ...current, day: { ...day, exercises: [...day.exercises, structuredClone(composer)] }, composer: blankExercise(), selected: null })
    }
    setError('')
  }
  function removeExercise() {
    if (selected === null) return
    const exercises = day.exercises.filter((_, i) => i !== selected)
    updateCurrent({ ...current, day: { ...day, exercises }, selected: exercises.length ? Math.min(selected, exercises.length - 1) : null })
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    // Save includes a last typed exercise, but never a pristine empty input buffer.
    const ready: RoutineDocument = { ...document, days: days.map(({ day, composer }) => ({
      ...day, exercises: hasInput(composer) ? [...day.exercises, composer] : [...day.exercises],
    })) }
    const validation = validateRoutine(ready, catalog)
    if (validation) { setError(validation); return }
    const json = JSON.stringify(ready)
    if (retry.current?.json !== json) retry.current = { json, requestId: crypto.randomUUID() }
    setBusy(true); setError('')
    try { await onSave(structuredClone(ready), retry.current!.requestId) }
    catch (error) { setError(error instanceof Error ? error.message : 'Routine was not saved. Your draft is kept.') }
    finally { setBusy(false) }
  }

  return <section className="routine-editor focused-editor" aria-labelledby="editor-title">
    <p className="eyebrow">PLAN BUILDER</p><h2 id="editor-title" ref={titleRef} tabIndex={-1}>{editingExisting ? 'Edit routine' : 'Build your routine'}</h2>
    <p className="field-note">Planned targets only · no completed workouts</p>
    {editingExisting && <p className="field-note">Changes update this routine. Plans linked to workout history are saved as a new version; the original stays archived.</p>}
    <form onSubmit={submit} onChange={() => setError('')}>
      <fieldset disabled={busy} className="editor-fields"><legend className="sr-only">Routine details</legend>
        <label>Routine name<input maxLength={100} value={document.name} onChange={e => setDocument({ ...document, name: e.target.value })} /></label>
        <div className="session-switcher" role="group" aria-label="Day selection">{days.map((_, index) => <button key={index} type="button" aria-pressed={dayIndex === index} className="secondary-button" onClick={() => { setDayIndex(index); setError('') }}>Day {index + 1}</button>)}</div>
        <div className="session-workspace">
          <label>Workout/session name<input maxLength={100} placeholder="e.g., Back and Biceps" value={day.name} onChange={e => changeDay({ name: e.target.value })} /></label>
          <div className="compact-actions"><button type="button" className="text-button" disabled={dayIndex === 0} onClick={() => {
            const next = [...days]; [next[dayIndex - 1], next[dayIndex]] = [next[dayIndex], next[dayIndex - 1]]
            setDays(next); setDayIndex(dayIndex - 1)
          }}>Move day up</button><button type="button" className="text-button" disabled={days.length === 1} onClick={() => { setDays(days.filter((_, i) => i !== dayIndex)); setDayIndex(Math.max(0, dayIndex - 1)) }}>Remove day</button></div>
          {day.exercises.length > 0 && <ol className="exercise-outline" aria-label="Added exercises">{day.exercises.map((entry, index) => <li key={index}><button className="text-button" type="button" aria-pressed={selected === index} onClick={() => updateCurrent({ ...current, selected: index })}><span className="number">{String(index + 1).padStart(2, '0')}</span>{nameOf(entry)}</button></li>)}</ol>}
          <div className="active-exercise" key={`${dayIndex}-${selected ?? 'composer'}`}>
            <h3 className="exercise-form-title">Exercise {(selected ?? day.exercises.length) + 1}</h3>
            {item.planning_mode !== 'per_set' && <p className="field-note">Changing this exercise clears its saved range. Leave it unchanged to preserve the original targets.</p>}
            <label>Exercise name<input maxLength={100} value={nameOf(item)} onChange={e => {
              if (item.planning_mode === 'per_set') changeExercise({ ...item, exercise_id: null, custom_exercise_name: e.target.value })
              else changeExercise({ ...blankExercise(e.target.value), notes: item.notes })
            }} /></label>
            <details className="catalog-picker"><summary>Choose from library</summary><label>Library exercise<select value={item.exercise_id ?? ''} onChange={e => { if (e.target.value) changeExercise({ ...blankExercise('', e.target.value), notes: item.notes }) }}><option value="">Select explicitly</option>{catalog.filter(entry => !entry.deprecated_at || entry.id === item.exercise_id).map(entry => <option key={entry.id} value={entry.id}>{entry.name}{entry.deprecated_at ? ' (retired)' : ''}</option>)}</select></label></details>
            {selectedExercise?.loading_mode === 'per_implement' && <p className="field-note">Planned weight is per dumbbell / implement.</p>}
            {selectedExercise?.slug.startsWith('band-') && <p className="field-note">Describe the band and setup in notes; leave weight unset.</p>}
            {item.planning_mode === 'per_set' ? <>
              <label>Number of sets<input type="number" min={0} max={10} step={1} value={item.planned_sets.length} onChange={e => {
                const count = Math.max(0, Math.min(10, Number(e.target.value)))
                if (!Number.isInteger(count)) return
                changeExercise({ ...item, planned_sets: Array.from({ length: count }, (_, i) => item.planned_sets[i] ?? { reps: null, load_kg: null, entered_unit: unit }) })
              }} /></label>
              <div className="planned-sets">{item.planned_sets.map((set, index) => <div className="planned-set" key={index}>
                <span className="set-number">{String(index + 1).padStart(2, '0')}</span>
                <label>Reps<input aria-label={`Set ${index + 1} reps`} type="number" min={1} max={100} step={1} placeholder="Unset" value={set.reps ?? ''} onChange={e => changeSet(index, { reps: e.target.value === '' ? null : Number(e.target.value) })} /></label>
                <label>Planned weight<input aria-label={`Set ${index + 1} planned weight`} type="number" min={0} max={set.entered_unit === 'lb' ? 22046.2262185 : 10000} step="any" placeholder="Unset" value={set.load_kg == null ? '' : Number((set.load_kg * (set.entered_unit === 'lb' ? LB_PER_KG : 1)).toFixed(6))} onChange={e => changeSet(index, { load_kg: e.target.value === '' ? null : Number(e.target.value) / (set.entered_unit === 'lb' ? LB_PER_KG : 1) })} /></label>
                <label className="set-unit">Unit<select aria-label={`Set ${index + 1} unit`} value={set.entered_unit} onChange={e => changeSet(index, { entered_unit: e.target.value as 'kg' | 'lb' })}><option value="kg">kg</option><option value="lb">lb</option></select></label>
                <button type="button" className="text-button" aria-label={`Remove set ${index + 1}`} onClick={() => changeExercise({ ...item, planned_sets: item.planned_sets.filter((_, i) => i !== index) })}>×</button>
              </div>)}</div>
              <button type="button" className="secondary-button" disabled={item.planned_sets.length >= 10} onClick={() => changeExercise({ ...item, planned_sets: [...item.planned_sets, { reps: null, load_kg: null, entered_unit: unit }] })}>Add Set</button>
            </> : <div className="legacy-targets"><p>Saved range: {item.target_sets} sets · {item.rep_min}–{item.rep_max} reps · {item.rest_seconds}s rest</p><p className="field-note">Kept unchanged. Switching to per-set targets clears this range; enter your own targets.</p><button className="secondary-button" type="button" onClick={() => changeExercise({ ...blankExercise('', item.exercise_id), notes: item.notes })}>Set individual targets</button></div>}
            <details><summary>Exercise notes</summary><label>Notes<textarea maxLength={2000} value={item.notes} onChange={e => changeExercise({ ...item, notes: e.target.value })} /></label></details>
            {selected !== null && <div className="compact-actions"><button type="button" className="text-button" disabled={selected === 0} onClick={() => moveExercise(-1)}>Move exercise up</button><button type="button" className="text-button" disabled={selected === day.exercises.length - 1} onClick={() => moveExercise(1)}>Move exercise down</button><button type="button" className="text-button" onClick={removeExercise}>Remove exercise</button></div>}
          </div>
          <div className="inline-actions"><button className="secondary-button" type="button" disabled={selected === null && day.exercises.length >= 20} onClick={addExercise}>{selected === null ? 'Add Exercise' : 'Done Editing Exercise'}</button>
            {selected !== null && hasInput(composer) && <button type="button" className="text-button" onClick={() => updateCurrent({ ...current, selected: null })}>Continue unfinished exercise</button>}
            <button type="button" className="secondary-button" disabled={days.length >= 7} onClick={() => { setDays([...days, { day: { name: '', weekday: null, exercises: [] }, composer: blankExercise(), selected: null }]); setDayIndex(days.length); setError('') }}>Add Day</button></div>
        </div>
        <div className="editor-save-bar"><button type="submit">{busy ? 'Saving routine…' : editingExisting ? 'Save Changes' : 'Save Routine'}</button><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button></div>
      </fieldset><p role="alert">{error}</p>
    </form>
  </section>
}
