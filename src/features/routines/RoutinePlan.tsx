import { weekdays } from '../profile/profile'
import { ExerciseInfo } from './ExerciseInfo'
import { Badge } from '../../components/ui'
import type { Exercise, RoutineDocument } from './types'

// Native disclosures keep full prescriptions keyboard accessible without a long table.
export function RoutinePlan({ document, catalog }: { document: RoutineDocument; catalog: Exercise[] }) {
  return <div className="routine-plan">{document.days.map((day, index) => <details className="workout-card" key={index}>
    <summary><span className="workout-number">{String(index + 1).padStart(2, '0')}</span><span className="workout-title"><span>{day.name}</span><small>{day.weekday === null ? 'Flexible schedule' : weekdays[day.weekday]} · {day.exercises.length} {day.exercises.length === 1 ? 'exercise' : 'exercises'}</small></span><span className="disclosure-mark" aria-hidden="true">+</span></summary>
    <ol className="exercise-list">{day.exercises.map((item, itemIndex) => <li key={itemIndex}>
      {catalog.find(exercise => exercise.id === item.exercise_id) ? <ExerciseInfo exercise={catalog.find(exercise => exercise.id === item.exercise_id)!} /> : <h5>Library exercise unavailable</h5>}
      <div className="prescription-summary"><Badge>{item.target_sets} sets</Badge><Badge>{item.rep_min}–{item.rep_max} reps</Badge><Badge>{item.rest_seconds}s rest</Badge></div>
      {item.notes && <p>{item.notes}</p>}
    </li>)}</ol>
  </details>)}</div>
}
