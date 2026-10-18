import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { Badge, PageHeading, Panel, TrainingImage } from '../../components/ui'
import { useAuth } from '../auth/AuthProvider'
import { defaultProfile, detectTimezone, equipmentOptions, equipmentDetails, legacyFrequencySuggestion, normalizeProfile, validateProfile, type ProfileDraft } from './profile'

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
    void client.from('profiles').select('*').eq('user_id', userId).maybeSingle().then(({ data, error }) => {
      if (cancelled) return
      if (error) setLoadError('Unable to load your profile. Check your connection and confirm the reviewed SQL migrations have been applied.')
      else setProfile(data ? normalizeProfile(data) : { ...defaultProfile, timezone: detectTimezone() })
      setLoading(false)
    }, () => {
      if (!cancelled) { setLoadError('Unable to load your profile. Check your connection and retry.'); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [client, userId, attempt])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || busy) return
    // Refresh on every save, including existing profiles and browser zone changes.
    const profileToSave = { ...profile, timezone: detectTimezone() }
    const validation = validateProfile(profileToSave, true)
    if (validation) { setMessage(validation); return }
    setBusy(true); setMessage('')
    try {
      const { data, error } = await client.from('profiles').upsert({ ...profileToSave, display_name: profile.display_name.trim(), user_id: userId }, { onConflict: 'user_id' }).select('user_id').single()
      setMessage(error?.code === 'PGRST204' || error?.code === '42703' ? 'Profile was not saved. The frequency update needs migration 004. Review docs/STAGE_3_REFINEMENT.md before applying SQL.' : error || !data ? 'Profile was not saved. Check your connection and database setup, then retry.' : 'Profile saved to Supabase.')
    } catch { setMessage('Profile was not saved. Check your connection and retry.') }
    finally { setBusy(false) }
  }
  function toggle<T>(items: T[], value: T) { return items.includes(value) ? items.filter(item => item !== value) : [...items, value] }
  return <section className="profile-page"><PageHeading eyebrow="THE FOUNDATION / PROFILE" title={<>Your training.<br /><em>Your way.</em></>} description="A few details. A more personal starting point." /><div className="profile-layout"><aside className="profile-aside"><div className="profile-photo"><TrainingImage eager /><Badge>BUILT AROUND YOU</Badge></div><Panel><h2>Make room for<br />what matters.</h2><p>Your preferences guide your routine recommendations. Update them whenever life changes.</p><p className="account-email">Signed in as {session?.user.email}</p><Link to="/routines">Explore your routines ↗</Link></Panel></aside><div className="profile-main">{loading ? <p role="status">Loading your profile…</p> : loadError ? <div role="alert"><p>{loadError}</p><button onClick={() => setAttempt(attempt + 1)}>Retry loading</button></div> : <form onSubmit={save} onChange={() => setMessage('')} className="profile-form">
    <h2 className="form-section-title">A little about you</h2><label>Display name<input value={profile.display_name} maxLength={80} autoComplete="nickname" onChange={e => setProfile({ ...profile, display_name: e.target.value })} /></label>
    <div className="form-columns"><label>Fitness goal<select value={profile.goal} onChange={e => setProfile({ ...profile, goal: e.target.value })}><option value="general_fitness">General fitness</option><option value="strength">Strength</option><option value="muscle_growth">Muscle growth</option></select></label><label>Training experience<select value={profile.experience} onChange={e => setProfile({ ...profile, experience: e.target.value })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label></div>
    <label>Training days per week<select required value={profile.training_days_per_week ?? ''} onChange={e => setProfile({ ...profile, training_days_per_week: e.target.value ? Number(e.target.value) : null })}><option value="">Choose frequency</option>{[2,3,4,5,6].map(count => <option key={count} value={count}>{count} days per week</option>)}</select></label>
    {profile.training_days_per_week == null && <p className="field-note">{legacyFrequencySuggestion(profile) ? `Your previous availability suggests ${legacyFrequencySuggestion(profile)} days. Confirm your preferred frequency above.` : 'Choose 2–6 days. Your previous availability is preserved.'}</p>}
    <p className="field-note">Train on the days you choose. No fixed weekdays.</p>
    <fieldset><legend>Available equipment</legend><div className="choice-grid">{equipmentOptions.map(item => <label key={item}><input type="checkbox" checked={profile.equipment.includes(item)} onChange={() => setProfile({ ...profile, equipment: toggle(profile.equipment, item) })} />{item}</label>)}</div></fieldset>
    <fieldset><legend>Gym equipment & support</legend><p className="field-note">Select only what you can use. Specific machines are not assumed.</p><div className="choice-grid">{Object.entries(equipmentDetails).map(([key, label]) => <label key={key}><input type="checkbox" checked={(profile.equipment_details ?? []).includes(key)} onChange={() => setProfile({ ...profile, equipment_details: toggle(profile.equipment_details ?? [], key) })} />{label}</label>)}</div></fieldset>
    <div className="form-columns"><label>Review timeline (weeks)<input type="number" min={1} max={52} required value={profile.timeline_weeks} onChange={e => setProfile({ ...profile, timeline_weeks: Number(e.target.value) })} /></label><label>Weight units<select value={profile.display_unit} onChange={e => setProfile({ ...profile, display_unit: e.target.value })}><option value="kg">Kilograms (kg)</option><option value="lb">Pounds (lb)</option></select></label></div><p className="field-note">A review point, not a deadline for guaranteed results.</p>
    <button disabled={busy} type="submit">{busy ? 'Saving…' : 'Save profile'}</button><p role="status">{message}</p><Link className="text-link" to="/routines">Explore workout routines →</Link>
  </form>}</div></div></section>
}
