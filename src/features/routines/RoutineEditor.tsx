import { useRef, useState, type FormEvent } from 'react'
import { weekdays, type ProfileDraft } from '../profile/profile'
import { compatible, prescription } from './recommendations'
import { validateRoutine } from './routineValidation'
import type { Exercise, Prescription, RoutineDayDraft, RoutineDocument } from './types'

type Props = {
  initial: RoutineDocument; catalog: Exercise[]; profile: ProfileDraft;
  onSave: (document: RoutineDocument, requestId: string) => Promise<void>; onCancel: () => void;
}
export function RoutineEditor({ initial, catalog, profile, onSave, onCancel }: Props) {
  const [document, setDocument] = useState(() => structuredClone(initial))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const retry = useRef<{ json: string; requestId: string } | null>(null)
  function changeDay(index: number, next: RoutineDayDraft) {
    setDocument({ ...document, days: document.days.map((day, i) => i === index ? next : day) })
  }
  function changeExercise(dayIndex: number, index: number, patch: Partial<Prescription>) {
    const day = document.days[dayIndex]
    changeDay(dayIndex, { ...day, exercises: day.exercises.map((item, i) => i === index ? { ...item, ...patch } : item) })
  }
  function move<T>(list: T[], index: number, offset: number) {
    const next = [...list]
    ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
    return next
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const validation = validateRoutine(document, catalog)
    if (validation) { setError(validation); return }
    const json = JSON.stringify(document)
    if (retry.current?.json !== json) retry.current = { json, requestId: crypto.randomUUID() }
    setBusy(true); setError('')
    try { await onSave(document, retry.current!.requestId) }
    catch (error) { setError(error instanceof Error ? error.message : 'Routine was not saved. Retry when your connection is available.') }
    finally { setBusy(false) }
  }
  return <section className="routine-editor" aria-labelledby="editor-title">
    <p className="eyebrow">PLAN WORKSHOP</p><h2 id="editor-title">Edit your routine</h2>
    <p>Adjust the starting prescription to fit your training. Rest is in seconds. Choosing another exercise resets its prescription to the suggested defaults. A routine with logged sessions is saved as a new version to preserve history.</p>
    <form onSubmit={submit} onChange={() => setError('')}>
      <fieldset disabled={busy} className="editor-fields"><legend className="sr-only">Routine details</legend>
        <div className="form-columns"><label>Routine name<input required maxLength={100} value={document.name} onChange={event => setDocument({ ...document, name: event.target.value })} /></label>
          <label>Routine goal<select value={document.goal} onChange={event => setDocument({ ...document, goal: event.target.value })}><option value="general_fitness">General fitness</option><option value="strength">Strength</option><option value="muscle_growth">Muscle growth</option></select></label></div>
        {document.days.map((day, dayIndex) => <fieldset key={dayIndex} className="day-editor"><legend>Workout {dayIndex + 1}</legend>
          <div className="form-columns"><label>Workout {dayIndex + 1} name<input required maxLength={100} value={day.name} onChange={event => changeDay(dayIndex, { ...day, name: event.target.value })} /></label>
            <label>Workout {dayIndex + 1} weekday<select value={day.weekday ?? ''} onChange={event => changeDay(dayIndex, { ...day, weekday: event.target.value === '' ? null : Number(event.target.value) })}><option value="">Unscheduled</option>{weekdays.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label></div>
          <div className="inline-actions"><button type="button" className="secondary-button" disabled={dayIndex === 0} onClick={() => setDocument({ ...document, days: move(document.days, dayIndex, -1) })}>Move workout up</button><button type="button" className="secondary-button" onClick={() => setDocument({ ...document, days: document.days.filter((_, index) => index !== dayIndex) })}>Remove workout</button></div>
          {day.exercises.map((item, exerciseIndex) => {
            const exercise = catalog.find(entry => entry.id === item.exercise_id)
            const label = `Workout ${dayIndex + 1}, exercise ${exerciseIndex + 1}`
            return <div className="exercise-editor" key={exerciseIndex}>
              <label>{label}<select value={item.exercise_id} onChange={event => {
                const chosen = catalog.find(entry => entry.id === event.target.value)!
                changeExercise(dayIndex, exerciseIndex, prescription(chosen, profile))
              }}>{catalog.map(entry => <option key={entry.id} value={entry.id}>{entry.name}{compatible(entry, profile) ? '' : ' · other equipment'}</option>)}</select></label>
              <p className="exercise-note">{exercise?.technique_notes} {exercise && !compatible(exercise, profile) ? 'This exercise needs equipment not selected in your profile.' : ''}</p>
              <div className="prescription-fields">{([
                ['Sets', 'target_sets', 10], ['Minimum reps', 'rep_min', 100], ['Maximum reps', 'rep_max', 100], ['Rest seconds', 'rest_seconds', 900],
              ] as const).map(([name, field, max]) => <label key={field}>{name}<input aria-label={`${label}: ${name}`} type="number" min={1} max={max} step={1} required value={item[field]} onChange={event => changeExercise(dayIndex, exerciseIndex, { [field]: Number(event.target.value) })} /></label>)}</div>
              <label>Exercise notes<textarea aria-label={`${label}: Notes`} maxLength={2000} value={item.notes} onChange={event => changeExercise(dayIndex, exerciseIndex, { notes: event.target.value })} /></label>
              <div className="inline-actions"><button type="button" className="secondary-button" disabled={exerciseIndex === 0} onClick={() => changeDay(dayIndex, { ...day, exercises: move(day.exercises, exerciseIndex, -1) })}>Move exercise up</button><button type="button" className="secondary-button" onClick={() => changeDay(dayIndex, { ...day, exercises: day.exercises.filter((_, index) => index !== exerciseIndex) })}>Remove exercise</button></div>
            </div>
          })}
          <button type="button" className="secondary-button" disabled={!catalog.length || day.exercises.length >= 20} onClick={() => {
            const exercise = catalog.find(entry => compatible(entry, profile)) ?? catalog[0]
            changeDay(dayIndex, { ...day, exercises: [...day.exercises, prescription(exercise, profile)] })
          }}>Add exercise to workout {dayIndex + 1}</button>
        </fieldset>)}
        <div className="inline-actions"><button type="button" className="secondary-button" disabled={document.days.length >= 7} onClick={() => setDocument({ ...document, days: [...document.days, { name: `Workout ${document.days.length + 1}`, weekday: null, exercises: [] }] })}>Add workout day</button><button type="submit">{busy ? 'Saving routine…' : 'Save routine'}</button><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button></div>
      </fieldset>
      <p role="alert">{error}</p>
    </form>
  </section>
}
