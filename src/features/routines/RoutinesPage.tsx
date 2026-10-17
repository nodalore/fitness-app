import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { weekdays } from '../profile/profile'
import { guidanceSources, recommendRoutines } from './recommendations'
import { archiveRoutine, loadWorkspace, saveRoutine } from './repository'
import { RoutineEditor } from './RoutineEditor'
import type { Exercise, RoutineDocument, SavedRoutine } from './types'

type Workspace = Awaited<ReturnType<typeof loadWorkspace>>
type Editing = { key: string; id: string; updatedAt: string | null; document: RoutineDocument }

export function RoutinesPage() {
  const { client, session, loading, error } = useAuth()
  if (!client) return <section className="reading"><h1>Configure Supabase first</h1><p>Add the public settings to .env.local and restart the app.</p></section>
  if (loading) return <p role="status">Restoring your session…</p>
  if (error) return <p role="alert">{error}</p>
  if (!session) return <Navigate to="/login" replace />
  return <RoutineWorkspace key={session.user.id} userId={session.user.id} />
}

function RoutineWorkspace({ userId }: { userId: string }) {
  const { client } = useAuth()
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<SavedRoutine | null>(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!client) return
    let active = true
    setError('')
    void loadWorkspace(client, userId).then(data => { if (active) setWorkspace(data) }).catch(() => {
      if (active) setError('Unable to load routines. Check your connection and database setup, then retry.')
    })
    return () => { active = false }
  }, [client, userId, reload])

  async function persist(document: RoutineDocument, requestId: string) {
    if (!client || !editing) return
    const id = await saveRoutine(client, editing.id, document, requestId, editing.updatedAt)
    setEditing(null)
    setNotice(id !== editing.id ? 'New routine version saved. The previous version was archived to preserve workout history.' : 'Routine saved to Supabase.')
    setReload(value => value + 1)
  }
  async function confirmArchive() {
    if (!client || !archiveTarget || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      await archiveRoutine(client, userId, archiveTarget)
      if (editing?.id === archiveTarget.id) setEditing(null)
      setArchiveTarget(null); setNotice('Routine archived. Its history is preserved.'); setReload(value => value + 1)
    } catch (error) { setError(error instanceof Error ? error.message : 'Routine was not archived. Please retry.') }
    finally { setBusy(false) }
  }
  function startEditing(document: RoutineDocument, routine?: SavedRoutine) {
    if (editing && !window.confirm('Discard the current unsaved routine edits?')) return
    setEditing({ key: crypto.randomUUID(), id: routine?.id ?? crypto.randomUUID(), updatedAt: routine?.updated_at ?? null, document })
    setNotice(''); setError('')
  }
  if (!workspace) return <section className="reading"><h1>Your routines</h1>{error ? <><p role="alert">{error}</p><button onClick={() => setReload(value => value + 1)}>Retry loading routines</button></> : <p role="status">Loading your training journal…</p>}</section>
  const { profile, catalog, routines } = workspace
  const recommendations = profile ? recommendRoutines(profile, catalog) : null
  const active = routines.filter(routine => !routine.archived_at)
  const archived = routines.filter(routine => routine.archived_at)
  return <section className="routines-page">
    <div className="routine-masthead"><div><p className="eyebrow">YOUR TRAINING JOURNAL / ROUTINES</p><h1>Make a plan.<br />Make it yours.</h1><p className="intro">A starting point based on your profile. Adjust it to fit the way you train.</p></div><div className="journal-stamp">PLAN / TRAIN / REPEAT</div></div>
    <p role="status" className="save-notice">{notice}</p>{error && <div role="alert"><p>{error}</p><button className="secondary-button" onClick={() => setReload(value => value + 1)}>Reload routines</button></div>}
    {!profile ? <p>Save your <Link to="/profile">fitness profile</Link> to get recommendations and create routines.</p> : <>
      <div className="section-heading"><h2>Suggested starting points</h2><Link to="/profile">Update your profile</Link></div>
      <p>Goal: {profile.goal.replaceAll('_', ' ')} · {profile.experience} · review after {profile.timeline_weeks} weeks. Your timeline is a review point, not a result guarantee.</p>
      {recommendations?.options.length === 0 && <div className="notice">{recommendations.limitations.map(item => <p key={item}>{item}</p>)}</div>}
      <div className="recommendation-list">{recommendations?.options.map((option, index) => <article key={option.key} className="recommendation">
        <span className="number">OPTION {String(index + 1).padStart(2, '0')}</span><h3>{option.document.name}</h3><p>{option.rationale}</p>
        <p>{option.document.days.map(day => weekdays[day.weekday!]).join(' / ')}</p>
        <details><summary>Review exercises & assumptions</summary><RoutinePlan document={option.document} catalog={catalog} /><ul>{option.cautions.map(item => <li key={item}>{item}</li>)}</ul><p>Primary-muscle sets per week (does not count secondary involvement): {Object.entries(option.weeklySets).map(([muscle, sets]) => `${muscle}: ${sets}`).join('; ')}.</p><p>For muscle growth, these are starting workloads and may be below higher-volume targets. Adjust gradually rather than chasing a fixed set count.</p></details>
        <button onClick={() => startEditing(option.document)}>Customize & save {option.document.name}</button>
      </article>)}</div>
      <div className="routine-divider"><h2>Your saved routines</h2><button className="secondary-button" onClick={() => startEditing({ name: 'My routine', goal: profile.goal, origin_template_key: null, recommendation_version: null, assumptions: { origin: 'custom' }, days: [{ name: 'Workout 1', weekday: profile.available_weekdays[0] ?? null, exercises: [] }] })}>Create a routine</button></div>
    </>}
    {active.length === 0 ? <p>No saved routines yet. Choose a starting point or create your own.</p> : <div className="saved-routines">{active.map(routine => <article key={routine.id} className="saved-routine"><div><h3>{routine.document.name}</h3><p>{routine.document.days.length} workout days · {routine.document.goal.replaceAll('_', ' ')}</p></div><div className="inline-actions">{profile && <button className="secondary-button" onClick={() => startEditing(routine.document, routine)}>Edit {routine.document.name}</button>}<button className="secondary-button" onClick={() => { setArchiveTarget(routine); setError('') }}>Archive {routine.document.name}</button></div><details><summary>View saved plan</summary><RoutinePlan document={routine.document} catalog={catalog} /></details></article>)}</div>}
    {archiveTarget && <fieldset className="archive-confirm"><legend>Archive {archiveTarget.document.name}?</legend><p>This removes it from active routines and preserves the plan and workout history.</p><div className="inline-actions"><button disabled={busy} onClick={confirmArchive}>{busy ? 'Archiving…' : 'Confirm archive'}</button><button disabled={busy} className="secondary-button" onClick={() => setArchiveTarget(null)}>Keep routine</button></div></fieldset>}
    {editing && profile && <RoutineEditor key={editing.key} initial={editing.document} catalog={catalog} profile={profile} onSave={persist} onCancel={() => { if (window.confirm('Discard these unsaved routine edits?')) setEditing(null) }} />}
    {archived.length > 0 && <details className="archived-routines"><summary>Archived routines ({archived.length})</summary>{archived.map(routine => <article key={routine.id}><h3>{routine.document.name}</h3><RoutinePlan document={routine.document} catalog={catalog} /></article>)}</details>}
    <aside className="method-notes"><h2>Why these recommendations?</h2><p>Versioned rules match your available days, experience, goal, and equipment. Full-body sessions are separated where feasible; experienced users with four days may choose an upper/lower split. Missing equipment coverage is explained instead of inventing exercises.</p><p>ACSM’s 2026 summary supports consistent, goal-specific resistance training. CDC guidance also includes aerobic activity; saving a routine does not mean you meet all activity recommendations. NSCA provides program-design context. Our exact sets, rep ranges, and rest periods are editable app defaults.</p><ul>{guidanceSources.map(source => <li key={source.url}><a href={source.url}>{source.title}</a></li>)}</ul><p>Choose a load you can control. No result is guaranteed within your chosen timeline. For pain or relevant medical limitations, seek qualified individual guidance.</p></aside>
  </section>
}

export function RoutinePlan({ document, catalog }: { document: RoutineDocument; catalog: Exercise[] }) {
  return <div className="routine-plan">{document.days.map((day, index) => <div key={index}><h4>{day.name} · {day.weekday === null ? 'Unscheduled' : weekdays[day.weekday]}</h4><div className="table-scroll"><table><caption className="sr-only">{day.name} exercise prescription</caption><thead><tr><th scope="col">Exercise</th><th scope="col">Sets</th><th scope="col">Reps</th><th scope="col">Rest</th></tr></thead><tbody>{day.exercises.map((item, itemIndex) => <tr key={itemIndex}><th scope="row">{catalog.find(exercise => exercise.id === item.exercise_id)?.name ?? 'Library exercise unavailable'}{item.notes && <small>{item.notes}</small>}</th><td>{item.target_sets}</td><td>{item.rep_min}–{item.rep_max}</td><td>{item.rest_seconds}s</td></tr>)}</tbody></table></div></div>)}</div>
}
