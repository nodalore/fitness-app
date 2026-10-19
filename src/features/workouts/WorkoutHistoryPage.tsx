import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Icon, PageHeading } from '../../components/ui'
import { useAuth } from '../auth/AuthProvider'
import { loadWorkoutHistory, type HistoryWorkout } from './workoutHistoryRepository'

const dateLabel = (date: string) => new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
const weightLabel = (weight: number | null, unit: string) => weight === null ? '—' : `${Number(weight.toFixed(6))} ${unit}`
export function WorkoutHistoryPage() {
  const { client, session, loading, error } = useAuth()
  if (loading) return <p role="status">Restoring your session…</p>
  if (error) return <p role="alert">{error}</p>
  if (!client) return <p role="alert">Workout History is unavailable right now. Please try again later.</p>
  if (!session) return <Navigate to="/login" replace />
  return <History key={session.user.id} client={client} userId={session.user.id} />
}
function History({ client, userId }: { client: SupabaseClient; userId: string }) {
  const [page, setPage] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [data, setData] = useState<{ workouts: HistoryWorkout[]; hasMore: boolean } | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<HistoryWorkout | null>(null)
  const detailHeading = useRef<HTMLHeadingElement>(null)
  const lastCard = useRef<string | null>(null)
  useEffect(() => {
    let active = true
    setData(null); setError('')
    void loadWorkoutHistory(client, userId, page).then(result => { if (active) setData(result) }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [client, userId, page, attempt])
  useEffect(() => { if (selected) detailHeading.current?.focus() }, [selected])
  function close() { setSelected(null); requestAnimationFrame(() => (lastCard.current ? document.getElementById(lastCard.current) : null)?.focus()) }
  return <section className="history-page">
    <PageHeading eyebrow="YOUR TRAINING" title="Workout History" action={<Link className="text-link" to="/routines#saved">Today’s Workout <Icon name="arrow" /></Link>} />
    {selected ? <>
      <button className="text-button" onClick={close}><Icon name="arrow-left" />All workouts</button>
      <header className="history-detail-heading"><p className="eyebrow"><time dateTime={selected.date}>{dateLabel(selected.date)}</time></p><h2 ref={detailHeading} tabIndex={-1}>{selected.sessionName}</h2>{selected.routineName && <p>{selected.routineName}</p>}<p className="field-note">{selected.exerciseCount} exercises · {selected.setCount} sets</p></header>
      {selected.exercises.map(exercise => <section className={`history-exercise ${exercise.disposition !== 'performed' ? 'history-inactive' : ''}`} key={exercise.id} aria-label={exercise.name}>
        <div className="history-exercise-heading"><h3>{exercise.name}</h3>{exercise.disposition !== 'performed' && <span className="badge">{exercise.disposition === 'unperformed' ? 'Not performed' : exercise.disposition === 'removed' ? 'Removed' : 'Skipped'}</span>}</div>
        {exercise.sourceName && exercise.sourceName !== exercise.name && <p className="field-note">Replaced {exercise.sourceName}</p>}
        {exercise.sets.length > 0 && <table className="history-sets"><caption className="sr-only">{exercise.name} performed sets</caption><thead><tr><th scope="col">Set</th><th scope="col">Weight</th><th scope="col">Reps</th></tr></thead><tbody>{exercise.sets.map(set => <tr key={set.id}><th scope="row">{set.number}</th><td>{weightLabel(set.weight, set.unit)}</td><td>{set.reps}</td></tr>)}</tbody></table>}
      </section>)}
    </> : <>
      {error ? <div><p role="alert">{error}</p><button onClick={() => setAttempt(value => value + 1)}>Retry loading history</button></div> : !data ? <p role="status">Loading workout history…</p> : <>
        {!data.workouts.length ? <div className="panel empty-state"><h2>No completed workouts yet</h2><p>Finished workouts will appear here.</p><Link className="button" to="/routines#saved">Go to Today’s Workout</Link></div> : <div className="history-list">{data.workouts.map(workout => <button className="history-card" id={`history-${workout.id}`} key={workout.id} onClick={event => { lastCard.current = event.currentTarget.id; setSelected(workout) }}>
          <time dateTime={workout.date}>{dateLabel(workout.date)}</time><span className="history-card-name">{workout.sessionName}</span>{workout.routineName && <span className="history-routine">{workout.routineName}</span>}<span className="history-counts">{workout.exerciseCount} exercises · {workout.setCount} sets</span><Icon name="arrow" className="history-card-arrow" />
        </button>)}</div>}
        {(page > 0 || data.hasMore) && <nav className="history-pagination" aria-label="Workout history pages"><button className="secondary-button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Newer workouts</button><button className="secondary-button" disabled={!data.hasMore} onClick={() => setPage(value => value + 1)}>Older workouts</button></nav>}
      </>}
    </>}
  </section>
}
