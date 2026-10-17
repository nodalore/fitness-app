import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { defaultProfile, equipmentOptions, validateProfile, weekdays, type ProfileDraft } from './profile'

export function ProfilePage() {
  const { session, loading, error, client } = useAuth()
  if (!client) return <section className="reading"><h1>Configure Supabase first</h1><p role="alert">Add the public settings to .env.local and restart the app.</p></section>
  if (loading) return <p role="status">Restoring your session…</p>
  if (error) return <section className="reading"><h1>Check your session</h1><p role="alert">{error}</p><Link to="/login">Sign in again</Link></section>
  if (!session) return <Navigate to="/login" replace />
  // A new component per account prevents showing another account's stale form.
  return <ProfileForm key={session.user.id} userId={session.user.id} />
}

function ProfileForm({ userId }: { userId: string }) {
  const { client, session } = useAuth()
  const [profile, setProfile] = useState<ProfileDraft>(defaultProfile)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!client) return
    let cancelled = false
    setLoading(true); setLoadError('')
    void client.from('profiles').select('display_name,goal,experience,available_weekdays,timeline_weeks,equipment,display_unit,timezone').eq('user_id', userId).maybeSingle().then(({ data, error }) => {
      if (cancelled) return
      if (error) setLoadError('Unable to load your profile. Check your connection and confirm the reviewed SQL migrations have been applied.')
      else setProfile(data ?? { ...defaultProfile, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      setLoading(false)
    }, () => {
      if (!cancelled) { setLoadError('Unable to load your profile. Check your connection and retry.'); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [client, userId, attempt])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || busy) return
    const validation = validateProfile(profile)
    if (validation) { setMessage(validation); return }
    setBusy(true); setMessage('')
    try {
      const { data, error } = await client.from('profiles').upsert({ ...profile, display_name: profile.display_name.trim(), user_id: userId }, { onConflict: 'user_id' }).select('user_id').single()
      setMessage(error || !data ? 'Profile was not saved. Check your connection and database setup, then retry.' : 'Profile saved to Supabase.')
    } catch { setMessage('Profile was not saved. Check your connection and retry.') }
    finally { setBusy(false) }
  }
  function toggle<T>(items: T[], value: T) { return items.includes(value) ? items.filter(item => item !== value) : [...items, value] }
  return <section className="profile-page"><p className="eyebrow">YOUR TRAINING JOURNAL / PROFILE</p><h1>A plan starts<br />with you.</h1><p className="intro">Save your preferences now. Routine recommendations will follow in Stage 3.</p><p className="account-email">Signed in as {session?.user.email}</p>{loading ? <p role="status">Loading your profile…</p> : loadError ? <div role="alert"><p>{loadError}</p><button onClick={() => setAttempt(attempt + 1)}>Retry loading</button></div> : <form onSubmit={save} onChange={() => setMessage('')} className="profile-form">
    <label>Display name<input value={profile.display_name} maxLength={80} autoComplete="nickname" onChange={e => setProfile({ ...profile, display_name: e.target.value })} /></label>
    <div className="form-columns"><label>Fitness goal<select value={profile.goal} onChange={e => setProfile({ ...profile, goal: e.target.value })}><option value="general_fitness">General fitness</option><option value="strength">Strength</option><option value="muscle_growth">Muscle growth</option></select></label><label>Training experience<select value={profile.experience} onChange={e => setProfile({ ...profile, experience: e.target.value })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label></div>
    <fieldset><legend>Available workout days</legend><div className="choice-grid">{weekdays.map((day, index) => <label key={day}><input type="checkbox" checked={profile.available_weekdays.includes(index)} onChange={() => setProfile({ ...profile, available_weekdays: toggle(profile.available_weekdays, index) })} />{day}</label>)}</div></fieldset>
    <fieldset><legend>Available equipment</legend><div className="choice-grid">{equipmentOptions.map(item => <label key={item}><input type="checkbox" checked={profile.equipment.includes(item)} onChange={() => setProfile({ ...profile, equipment: toggle(profile.equipment, item) })} />{item}</label>)}</div></fieldset>
    <div className="form-columns"><label>Review timeline (weeks)<input type="number" min={1} max={52} required value={profile.timeline_weeks} onChange={e => setProfile({ ...profile, timeline_weeks: Number(e.target.value) })} /></label><label>Weight units<select value={profile.display_unit} onChange={e => setProfile({ ...profile, display_unit: e.target.value })}><option value="kg">Kilograms (kg)</option><option value="lb">Pounds (lb)</option></select></label></div><p className="field-note">A review point, not a deadline for guaranteed results.</p>
    <label>Timezone<input required maxLength={100} value={profile.timezone} onChange={e => setProfile({ ...profile, timezone: e.target.value })} aria-describedby="timezone-help" /></label><p id="timezone-help" className="field-note">For example, America/New_York or UTC.</p>
    <button disabled={busy} type="submit">{busy ? 'Saving…' : 'Save profile'}</button><p role="status">{message}</p>
  </form>}</section>
}
