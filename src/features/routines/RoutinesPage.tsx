import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { Badge, Icon, PageHeading } from '../../components/ui'
import { RoutinePlan } from './RoutinePlan'
import { weekdays } from '../profile/profile'
import { guidanceSources, recommendRoutines } from './recommendations'
import { archiveRoutine, loadWorkspace, saveRoutine } from './repository'
import { RoutineEditor } from './RoutineEditor'
import type { RoutineDocument, SavedRoutine } from './types'

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
  const { hash } = useLocation()
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

  useEffect(() => {
    if (!workspace || !hash) return
    const target = document.getElementById(hash.slice(1))
    target?.scrollIntoView?.({ behavior: 'instant' }); target?.focus()
  }, [workspace, hash])

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
    <PageHeading eyebrow="ROUTINES" title={<>Get <em>stronger.</em></>} description="Choose your plan. Own your training." /><nav className="section-tabs" aria-label="Routine sections"><a href="#discover">Discover</a><a href="#saved">My routines</a></nav>
    <p role="status" className="save-notice">{notice}</p>{error && <div role="alert"><p>{error}</p><button className="secondary-button" onClick={() => setReload(value => value + 1)}>Reload routines</button></div>}
    {!profile ? <p>Save your <Link to="/profile">fitness profile</Link> to get recommendations and create routines.</p> : <>
      <div className="section-heading" id="discover" tabIndex={-1}><h2>Recommended</h2><Link to="/profile">Edit profile</Link></div>
      <p>{profile.goal.replaceAll('_', ' ')} · {profile.experience} · {profile.timeline_weeks}-week review</p>
      {recommendations?.options.length === 0 && <div className="notice">{recommendations.limitations.map(item => <p key={item}>{item}</p>)}</div>}
      <div className="recommendation-list">{recommendations?.options.map((option, index) => <article key={option.key} className="recommendation">
        <div className="recommendation-art"><Icon name="strength" /><span className="number">PLAN {String(index + 1).padStart(2, '0')}</span></div><div className="recommendation-body"><Badge>{option.document.days.length} workouts / week</Badge><h3>{option.document.name}</h3>
        <p>{option.document.days.map(day => weekdays[day.weekday!]).join(' / ')}</p>
        <details><summary>Plan details</summary><p>{option.rationale}</p><RoutinePlan document={option.document} catalog={catalog} /><ul>{option.cautions.map(item => <li key={item}>{item}</li>)}</ul><p>Weekly sets by primary muscle (secondary muscles excluded): {Object.entries(option.weeklySets).map(([muscle, sets]) => `${muscle}: ${sets}`).join('; ')}.</p><p>Starting volume may be below higher-volume muscle-growth targets. Build gradually.</p></details>
        <button aria-label={`Customize & save ${option.document.name}`} onClick={() => startEditing(option.document)}>Customize</button></div>
      </article>)}</div>
      <div className="routine-divider" id="saved" tabIndex={-1}><h2>My routines</h2><button className="secondary-button" onClick={() => startEditing({ name: 'My routine', goal: profile.goal, origin_template_key: null, recommendation_version: null, assumptions: { origin: 'custom' }, days: [{ name: 'Workout 1', weekday: null, exercises: [] }] })}>Create routine</button></div>
    </>}
    {active.length === 0 ? <p>No saved routines yet. Choose a plan or build one.</p> : <div className="saved-routines">{active.map(routine => <article key={routine.id} className="saved-routine"><div><h3>{routine.document.name}</h3><p>{routine.document.days.length} workouts · {routine.document.goal.replaceAll('_', ' ')}</p></div><div className="inline-actions">{profile && <button className="secondary-button" aria-label={`Edit ${routine.document.name}`} onClick={() => startEditing(routine.document, routine)}>Edit</button>}<button className="secondary-button" aria-label={`Archive ${routine.document.name}`} onClick={() => { setArchiveTarget(routine); setError('') }}>Archive</button></div><details><summary>View plan</summary><RoutinePlan document={routine.document} catalog={catalog} /></details></article>)}</div>}
    {archiveTarget && <fieldset className="archive-confirm"><legend>Archive {archiveTarget.document.name}?</legend><p>Moves this plan to Archived. Workout history stays intact.</p><div className="inline-actions"><button disabled={busy} onClick={confirmArchive}>{busy ? 'Archiving…' : 'Confirm archive'}</button><button disabled={busy} className="secondary-button" onClick={() => setArchiveTarget(null)}>Keep routine</button></div></fieldset>}
    {editing && profile && <RoutineEditor key={editing.key} initial={editing.document} catalog={catalog} profile={profile} onSave={persist} onCancel={() => { if (window.confirm('Discard these unsaved routine edits?')) setEditing(null) }} />}
    {archived.length > 0 && <details className="archived-routines"><summary>Archived routines ({archived.length})</summary>{archived.map(routine => <article key={routine.id}><h3>{routine.document.name}</h3><RoutinePlan document={routine.document} catalog={catalog} /></article>)}</details>}
    <aside className="method-notes"><h2>Training principles</h2><p>Plans match your goal, experience, equipment, and available days. Full-body sessions are spaced where possible. Experienced lifters may get an upper/lower split. Equipment gaps are flagged.</p><p>ACSM and NSCA inform the guidance. Sets, reps, and rest are adjustable app defaults. CDC guidance also includes aerobic activity, which this app does not track.</p><ul>{guidanceSources.map(source => <li key={source.url}><a href={source.url}>{source.title}</a></li>)}</ul><p>Control the load. Results are not guaranteed by your review date. For pain or medical limitations, seek qualified guidance.</p></aside>
  </section>
}
