import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { PageHeading } from '../../components/ui'
import { useAuth } from '../auth/AuthProvider'
import { defaultProfile, detectTimezone, genderOptions, profilePatch, legacyFrequencySuggestion, normalizeProfile, validateProfileForm, type ProfileDraft } from './profile'

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
  const { client } = useAuth()
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
    const validation = validateProfileForm(profile)
    if (validation) { setMessage(validation); return }
    setBusy(true); setMessage('')
    try {
      const { data, error } = await client.from('profiles').upsert(profilePatch(profile, userId), { onConflict: 'user_id', defaultToNull: false }).select('user_id').single()
      setMessage(error?.code === 'PGRST204' || error?.code === '42703' ? 'Profile was not saved. The required gender field needs reviewed migration 006. Hosted installation requires your approval.' : error || !data ? 'Profile was not saved. Check your connection and database setup, then retry.' : 'Profile saved to Supabase.')
    } catch { setMessage('Profile was not saved. Check your connection and retry.') }
    finally { setBusy(false) }
  }
  return <section className="profile-page"><PageHeading eyebrow="PROFILE" title="Your profile" /><div className="profile-main">{loading ? <p role="status">Loading your profile…</p> : loadError ? <div role="alert"><p>{loadError}</p><button onClick={() => setAttempt(attempt + 1)}>Retry loading</button></div> : <form onSubmit={save} onChange={() => setMessage('')} className="profile-form">
    <fieldset disabled={busy} className="editor-fields">
    <label>Name<input value={profile.display_name} maxLength={80} autoComplete="nickname" onChange={e => setProfile({ ...profile, display_name: e.target.value })} /></label>
    <label>Gender<select required value={profile.gender ?? ''} onChange={e => setProfile({ ...profile, gender: e.target.value })}><option value="">Choose gender</option>{Object.entries(genderOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <div className="form-columns"><label>Fitness goal<select value={profile.goal} onChange={e => setProfile({ ...profile, goal: e.target.value })}><option value="general_fitness">General fitness</option><option value="strength">Strength</option><option value="muscle_growth">Muscle growth</option></select></label><label>Training experience<select value={profile.experience} onChange={e => setProfile({ ...profile, experience: e.target.value })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label></div>
    <label>Training days per week<select required value={profile.training_days_per_week ?? ''} onChange={e => setProfile({ ...profile, training_days_per_week: e.target.value ? Number(e.target.value) : null })}><option value="">Choose frequency</option>{[2,3,4,5,6].map(count => <option key={count} value={count}>{count} days per week</option>)}</select></label>
    {profile.training_days_per_week == null && <p className="field-note">{legacyFrequencySuggestion(profile) ? `Your previous availability suggests ${legacyFrequencySuggestion(profile)} days. Confirm your preferred frequency above.` : 'Choose 2–6 days. Your previous availability is preserved.'}</p>}
    <p className="field-note">Train on the days you choose. No fixed weekdays.</p>
    </fieldset>
    <button disabled={busy} type="submit">{busy ? 'Saving…' : 'Save profile'}</button><p role="status">{message}</p><Link className="text-link" to="/routines">Explore workout routines →</Link>
  </form>}</div></section>
}
