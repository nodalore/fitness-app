import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { loadWorkspace } from '../routines/repository'
import { Badge, Icon, PageHeading, Panel, StatCard, TrainingImage } from '../../components/ui'

type Workspace = Awaited<ReturnType<typeof loadWorkspace>>
export function DashboardPage() {
  const { client, session, loading, error } = useAuth()
  if (loading) return <p role="status">Restoring your session…</p>
  if (!client) return <section className="reading"><h1>Your training space</h1><p>Configure Supabase to access your dashboard.</p><Link to="/">Back to home</Link></section>
  if (error) return <p role="alert">{error}</p>
  if (!session) return <Navigate to="/login" replace />
  return <Dashboard key={session.user.id} userId={session.user.id} />
}
function Dashboard({ userId }: { userId: string }) {
  const { client } = useAuth()
  const [data, setData] = useState<Workspace | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!client) return
    let active = true
    setError(false)
    void loadWorkspace(client, userId).then(result => { if (active) setData(result) }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [client, userId, attempt])
  if (error) return <section className="reading"><h1>Your training space</h1><p role="alert">Unable to load your dashboard. Check your connection and retry.</p><button onClick={() => setAttempt(value => value + 1)}>Retry loading dashboard</button></section>
  if (!data) return <p role="status">Loading your training space…</p>
  const { profile, routines } = data
  const active = routines.filter(routine => !routine.archived_at)
  return <section className="dashboard-page">
    <PageHeading eyebrow="DASHBOARD" title={<>Build <em>strength.</em></>} description={profile?.display_name ? `Welcome back, ${profile.display_name}.` : 'Set your goal. Build your plan.'} action={<Link className="button secondary-button" to="/profile"><Icon name="user" /> Profile</Link>} />
    <div className="dashboard-hero"><TrainingImage eager /><div className="photo-shade" /><div className="dashboard-hero-copy"><Badge>YOUR TRAINING</Badge><h2>Get <em>focused.</em></h2><p>Pick a plan. Make it yours.</p><Link className="button" to={profile ? '/routines' : '/profile'}>{profile ? 'Find a plan' : 'Set up profile'}<Icon name="arrow" /></Link></div><span className="photo-caption">STAY CONSISTENT</span></div>
    <div className="stats-grid"><StatCard label="Goal" value={profile ? profile.goal.replaceAll('_', ' ') : 'Choose a goal'} detail={profile ? profile.experience : 'Set up your profile'} /><StatCard label="Active plans" value={String(active.length).padStart(2, '0')} detail="Your saved routines" /><StatCard label="Review" value={profile ? `${profile.timeline_weeks} weeks` : 'Not set'} detail="No guaranteed results" /></div>
    <div className="dashboard-bottom"><section><div className="section-heading"><div><p className="eyebrow">YOUR PLANS</p><h2>My routines</h2></div><Link to="/routines#saved">View all <span aria-hidden="true">↗</span></Link></div>
      {active.length ? <div className="dashboard-plans">{active.slice(0, 3).map(routine => <Link className="dashboard-plan" key={routine.id} to="/routines#saved"><span className="plan-icon"><Icon name="strength" /></span><span><strong>{routine.document.name}</strong><small>{routine.document.days.length} workouts · {routine.document.goal.replaceAll('_', ' ')}</small></span><Icon name="arrow" /></Link>)}</div> : <Panel className="empty-state"><Icon name="layers" /><h3>Build your plan.</h3><p>No saved routines yet.</p><Link to="/routines">Find a routine →</Link></Panel>}
    </section><Panel className="guidance-card"><span className="eyebrow">THE BASICS</span><h2>Train <em>smart.</em></h2><p>Know your plan. Control your reps.</p><Link to="/about">Training guide <span aria-hidden="true">↗</span></Link><p className="field-note">Workout logging: coming later.</p></Panel></div>
  </section>
}
