import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { Badge, Icon, PageHeading, TrainingImage } from '../../components/ui'
import { RoutinePlan } from './RoutinePlan'
import { guidanceSources, recommendRoutines } from './recommendations'
import { archiveRoutine, restoreRoutine, deleteRoutine, loadWorkspace, saveRoutine } from './repository'
import { RoutineEditor } from './RoutineEditor'
import { workoutRepository } from '../workouts/workoutRepository'
import { workoutRecovery } from '../workouts/workoutRecovery'
import { TodaysWorkout } from '../workouts/TodaysWorkout'
import type { RoutineDocument, SavedRoutine } from './types'

type Workspace = Awaited<ReturnType<typeof loadWorkspace>>
type Editing = { key: string; id: string; updatedAt: string | null; document: RoutineDocument }

export function RoutinesPage() {
  const { hash } = useLocation()
  const { client, session, loading, error } = useAuth()
  if (!client) return <section className="reading"><h1>Temporarily unavailable</h1><p>Please try again later.</p></section>
  if (loading) return <p role="status">Restoring your session…</p>
  if (error) return <p role="alert">{error}</p>
  if (!session) return <Navigate to="/login" replace />
  return <RoutineWorkspace key={`${session.user.id}-${hash === '#saved' ? 'saved' : 'discover'}`} userId={session.user.id} />
}

function RoutineWorkspace({ userId }: { userId: string }) {
  const { client } = useAuth()
  const { hash } = useLocation()
  const workoutRepo = useMemo(() => client ? workoutRepository(client, userId) : null, [client, userId])
  const savedView = hash === '#saved'
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState(false)
  const acceptance = useRef<{ id: string; request: string } | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SavedRoutine | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const deleteTitleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { deleteTitleRef.current?.focus() }, [deleteTarget])
  const [activeWorkoutRoutineId, setActiveWorkoutRoutineId] = useState<string | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<SavedRoutine | null>(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!client) return
    let active = true
    setError('')
    void loadWorkspace(client, userId).then(data => { if (active) setWorkspace(data) }).catch(() => {
      if (active) setError('Unable to load routines. Check your connection and retry.')
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
    setEditing(null); setPreview(false); acceptance.current = null
    setNotice(id !== editing.id ? 'New routine version saved. The previous version was archived to preserve workout history.' : 'Routine saved.')
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
  async function restore(routine: SavedRoutine) {
    if (!client || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      await restoreRoutine(client, userId, routine)
      setNotice('Routine restored. Available under Active routines.'); setReload(value => value + 1)
    } catch (error) { setError(error instanceof Error ? error.message : 'Routine was not restored. Please retry.') }
    finally { setBusy(false) }
  }
  async function confirmDelete() {
    if (!client || !deleteTarget || busy) return
    if (activeWorkoutRoutineId === deleteTarget.id || workoutRecovery(userId).read().some(entry => entry.draft.routineId === deleteTarget.id)) {
      setDeleteError('This routine has an unfinished workout on this device. Finish or cancel it before deleting. Your progress is kept.'); return
    }
    setBusy(true); setDeleteError(''); setNotice('')
    try {
      await deleteRoutine(client, userId, deleteTarget)
      const deletedId = deleteTarget.id
      setWorkspace(current => current ? { ...current, routines: current.routines.filter(routine => routine.id !== deletedId) } : current)
      setDeleteTarget(null); setNotice('Routine permanently deleted.'); setReload(value => value + 1)
    } catch (error) { setDeleteError(error instanceof Error ? error.message : 'Routine was not deleted. Please retry.') }
    finally { setBusy(false) }
  }
  function requestDelete(routine: SavedRoutine) {
    setPreview(false); acceptance.current = null; setArchiveTarget(null)
    setDeleteError(''); setError(''); setNotice(''); setDeleteTarget(routine)
  }
  function startEditing(document: RoutineDocument, routine?: SavedRoutine) {
    setPreview(false); setArchiveTarget(null); setDeleteTarget(null); setDeleteError(''); acceptance.current = null
    setEditing({ key: crypto.randomUUID(), id: routine?.id ?? crypto.randomUUID(), updatedAt: routine?.updated_at ?? null, document: structuredClone(document) })
    setNotice(''); setError('')
  }
  function cancel() { setDeleteTarget(null); setDeleteError(''); setArchiveTarget(null); setEditing(null); setPreview(false); acceptance.current = null; setError(''); setNotice('') }
  async function accept(document: RoutineDocument) {
    if (!client || busy) return
    acceptance.current ??= { id: crypto.randomUUID(), request: crypto.randomUUID() }
    setBusy(true); setError(''); setNotice('')
    try {
      await saveRoutine(client, acceptance.current.id, document, acceptance.current.request, null)
      cancel(); setNotice('Routine saved. Available under My routines.'); setReload(value => value+1)
    } catch (error) { setError(error instanceof Error ? error.message : 'Routine was not saved. Retry when connected.') }
    finally { setBusy(false) }
  }
  if (!workspace) return <section className="reading"><h1>Your routines</h1>{error ? <><p role="alert">{error}</p><button onClick={() => setReload(value => value + 1)}>Retry loading routines</button></> : <p role="status">Loading your training journal…</p>}</section>
  const { profile, catalog, routines } = workspace
  const recommendations = !savedView && profile ? recommendRoutines(profile, catalog) : null
  const active = routines.filter(routine => !routine.archived_at)
  const archived = routines.filter(routine => routine.archived_at)
  return <section className="routines-page">
    <PageHeading eyebrow="ROUTINES / YOUR TRAINING SYSTEM" title={savedView ? <>My <em>routines.</em></> : <>Discover your <em>next routine.</em></>} />
    <p role="status" className="save-notice">{notice}</p>{error && <div role="alert"><p>{error}</p>{!preview && <button className="secondary-button" onClick={() => setReload(value => value + 1)}>Reload routines</button>}</div>}
    {savedView && <div id="saved" tabIndex={-1} hidden={Boolean(editing)}><TodaysWorkout onActiveRoutineChange={setActiveWorkoutRoutineId} persistence={workoutRepo ? { repository: workoutRepo, userId } : undefined} routines={routines} catalog={catalog} defaultUnit={profile?.display_unit === 'lb' ? 'lb' : 'kg'} /></div>}
    {editing ? <RoutineEditor key={editing.key} initial={editing.document} catalog={catalog} profile={profile} editingExisting={editing.updatedAt !== null} onSave={persist} onCancel={cancel} /> : <>
      <div className="routine-toolbar"><Link className="text-link" to={savedView ? "/routines" : "/routines#saved"}>{savedView ? "Discover routines" : "My routines"}<Icon name="arrow" /></Link><button className="secondary-button" disabled={busy} onClick={() => { setPreview(false); acceptance.current = null; startEditing({ name: '', goal: profile?.goal ?? 'general_fitness', origin_template_key: null, recommendation_version: null, assumptions: { origin: 'custom' }, days: [{ name: '', weekday: null, exercises: [] }] }) }}>Create My Own Routine</button></div>
      {!savedView && <>
      <div className="section-heading" id="discover" tabIndex={-1}><h2>Recommended</h2><Link to="/profile">Edit profile</Link></div>
      {!profile ? <p>Save your <Link to="/profile">fitness profile</Link> for a recommendation. You can create your own now.</p> : recommendations?.options.length === 0 ? <p>{recommendations.limitations.join(' ')}</p> : recommendations?.options[0] && (() => {
        const option = recommendations.options[0]
        return <article className={`recommendation matched-plan ${preview ? 'is-preview' : ''}`}>
          <div className="recommendation-body"><div className="recommendation-context"><div><div className="plan-overline"><span className="number">01 / YOUR MATCH</span><Badge>{option.document.days.length} sessions / week</Badge></div><h3>{option.document.name}</h3>
            <p>{profile.experience} · {profile.goal.replaceAll('_',' ')}</p>
            </div><TrainingImage className="recommendation-photo" /></div>
            {!preview ? <button className="secondary-button" onClick={() => { setDeleteTarget(null); setDeleteError(''); setArchiveTarget(null); setPreview(true); setError(''); setNotice('') }}>Open routine <Icon name="arrow" /></button> : <>
              <p className="field-note">Equipment availability is unknown. Targets are yours to set.</p>
              <RoutinePlan document={option.document} catalog={catalog} showDescriptions />
              <div className="inline-actions"><button disabled={busy} onClick={() => accept(option.document)}>{busy ? 'Saving routine…' : 'Use This Routine'}</button><button disabled={busy} className="secondary-button" onClick={() => startEditing(option.document)}>Customize</button><button disabled={busy} className="secondary-button" onClick={cancel}>Cancel</button></div>
              <details className="match-notes"><summary>Why this match</summary><p>{option.rationale}</p>{option.cautions.map(item => <p key={item}>{item}</p>)}<p>{String(option.document.assumptions.recovery)}</p><Link to="/about">A note from the creator</Link></details>
            </>}
          </div>
        </article>
      })()}
      </>}
      {savedView && <>
      <div className="routine-divider"><h2>Active routines <span className="number">/ {String(active.length).padStart(2,'0')}</span></h2></div>
      {active.length === 0 ? <p>No active routines yet.</p> : <div className="saved-routines">{active.map(routine => <article key={routine.id} className="saved-routine"><h3>{routine.document.name}</h3><p>{routine.document.days.length} sessions · {routine.document.goal.replaceAll('_',' ')}</p><div className="inline-actions"><button disabled={busy} className="secondary-button" aria-label={`Edit ${routine.document.name}`} onClick={() => { setPreview(false); startEditing(routine.document, routine) }}>Edit</button><button disabled={busy} className="secondary-button" aria-label={`Archive ${routine.document.name}`} onClick={() => { setPreview(false); acceptance.current = null; setDeleteTarget(null); setDeleteError(''); setArchiveTarget(routine); setError('') }}>Archive</button><button disabled={busy} className="secondary-button" aria-label={`Delete ${routine.document.name}`} onClick={() => requestDelete(routine)}>Delete</button></div><details><summary>View plan</summary><RoutinePlan document={routine.document} catalog={catalog} /></details></article>)}</div>}
      {deleteTarget && <section className="delete-confirm" role="alertdialog" aria-modal="false" aria-labelledby="delete-title" aria-describedby="delete-description">
        <h3 id="delete-title" ref={deleteTitleRef} tabIndex={-1}>Permanently delete {deleteTarget.document.name}?</h3><p id="delete-description">This permanently removes the routine and its planned targets. Completed Workout History will be kept. Finish or cancel unfinished workouts first. This cannot be undone.</p>
        <div className="inline-actions"><button disabled={busy} className="danger-button" onClick={confirmDelete}>{busy ? 'Deleting…' : 'Delete permanently'}</button><button disabled={busy} className="secondary-button" onClick={() => { setDeleteTarget(null); setDeleteError('') }}>Keep routine</button></div>
        {deleteError && <p role="alert">{deleteError}</p>}
      </section>}
      {archiveTarget && <fieldset className="archive-confirm"><legend>Archive {archiveTarget.document.name}?</legend><p>Workout history stays intact.</p><div className="inline-actions"><button disabled={busy} onClick={confirmArchive}>{busy ? 'Archiving…' : 'Confirm archive'}</button><button disabled={busy} className="secondary-button" onClick={() => setArchiveTarget(null)}>Keep routine</button></div></fieldset>}
      {archived.length > 0 && <details className="archived-routines"><summary>Archived routines ({archived.length})</summary>{archived.map(routine => <article key={routine.id}><h3>{routine.document.name}</h3><div className="inline-actions"><button disabled={busy} className="secondary-button" aria-label={`Restore ${routine.document.name}`} onClick={() => void restore(routine)}>Restore</button><button disabled={busy} className="secondary-button" aria-label={`Delete ${routine.document.name}`} onClick={() => requestDelete(routine)}>Delete</button></div><RoutinePlan document={routine.document} catalog={catalog} /></article>)}</details>}
      </>}
      {!savedView && <details className="method-notes"><summary>Training principles & sources</summary><p>One app match from goal, experience and frequency. Choose your loads and targets; planned sets are not performed workouts.</p><ul>{guidanceSources.map(source => <li key={source.url}><a href={source.url}>{source.title}</a></li>)}</ul></details>}
    </>}
  </section>
}
