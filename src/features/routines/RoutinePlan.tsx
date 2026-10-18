import { useId, useState } from 'react'
import { weekdays } from '../profile/profile'
import { ExerciseInfo } from './ExerciseInfo'
import { Badge } from '../../components/ui'
import type { Exercise, RoutineDocument } from './types'

// Recommendations share one session panel; saved plans retain native disclosures.
export function RoutinePlan({ document, catalog, expandedSessions = false, showDescriptions = false }: { document: RoutineDocument; catalog: Exercise[]; expandedSessions?: boolean; showDescriptions?: boolean }) {
  const [openExercise, setOpenExercise] = useState<string | null>(null)
  const [openSession, setOpenSession] = useState<number | null>(null)
  const panelId = useId()
  function selectSession(index: number | null) {
    setOpenSession(index)
    setOpenExercise(null)
  }
  const sessionTitle = (day: RoutineDocument['days'][number], index: number) => <><span className="workout-number">{String(index + 1).padStart(2, '0')}</span><span className="workout-title"><span>{day.name}</span><small>{day.weekday === null ? 'Flexible schedule' : weekdays[day.weekday]} · {day.exercises.length} {day.exercises.length === 1 ? 'exercise' : 'exercises'}</small></span></>
  const exercises = (day: RoutineDocument['days'][number], index: number) => (
    <ol className="exercise-list">{day.exercises.map((item, itemIndex) => <li key={itemIndex}>
      {showDescriptions && catalog.find(exercise => exercise.id === item.exercise_id) ? <ExerciseInfo exercise={catalog.find(exercise => exercise.id === item.exercise_id)!} open={openExercise === `${index}-${itemIndex}`} onOpenChange={open => setOpenExercise(open ? `${index}-${itemIndex}` : null)} /> : <h5>{item.custom_exercise_name ?? catalog.find(exercise => exercise.id === item.exercise_id)?.name ?? 'Library exercise unavailable'}</h5>}
      <div className="prescription-summary">{item.planning_mode === 'per_set' ? item.planned_sets.length ? <table className="target-table"><caption>Planned targets</caption><thead><tr><th>Set</th><th>Reps</th><th>Weight</th></tr></thead><tbody>{item.planned_sets.map((set,i) => <tr key={i}><td>{i+1}</td><td>{set.reps ?? 'Unset'}</td><td>{set.load_kg == null ? 'Unset' : `${Number((set.load_kg * (set.entered_unit === 'lb' ? 2.20462262185 : 1)).toFixed(2))} ${set.entered_unit}`}</td></tr>)}</tbody></table> : <Badge>Targets unset</Badge> : <><Badge>{item.target_sets} sets</Badge><Badge>{item.rep_min}–{item.rep_max} reps</Badge><Badge>{item.rest_seconds}s rest</Badge></>}</div>
      {item.notes && item.notes !== catalog.find(exercise => exercise.id === item.exercise_id)?.technique_notes && <p>{item.notes}</p>}
    </li>)}</ol>
  )
  if (showDescriptions) return <div className="routine-plan">
    <div className="recommendation-sessions" role="group" aria-label="Workout sessions">{document.days.map((day, index) => <button type="button" className="session-card" key={index} aria-expanded={openSession === index} aria-controls={openSession === index ? panelId : undefined} onClick={() => selectSession(openSession === index ? null : index)}>
      {sessionTitle(day, index)}<span aria-hidden="true">{openSession === index ? '−' : '+'}</span>
    </button>)}</div>
    {openSession !== null && <section className="session-panel" id={panelId} aria-labelledby={`${panelId}-title`}>
      <div className="session-panel-heading"><h4 id={`${panelId}-title`}>{document.days[openSession].name}</h4><button type="button" className="text-button" aria-label={`Close ${document.days[openSession].name}`} onClick={() => selectSession(null)}>×</button></div>
      {exercises(document.days[openSession], openSession)}
    </section>}
  </div>
  return <div className="routine-plan">{document.days.map((day, index) => <details className="workout-card" key={index} open={expandedSessions || undefined}>
    <summary>{sessionTitle(day, index)}<span className="disclosure-mark" aria-hidden="true">+</span></summary>
    {exercises(day, index)}
  </details>)}</div>
}
