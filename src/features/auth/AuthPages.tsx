import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useAuth } from './AuthProvider'

function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  const { client } = useAuth()
  return <section className="account-layout"><div className="account-intro"><p className="eyebrow">FITNESS APP / TRAINING JOURNAL</p><h1>{title}</h1><p>Your account is the home for your training record. Start with a profile. Build your routine when you’re ready.</p><span className="journal-stamp">PERSONAL RECORD · VOL. 01</span></div><div className="account-panel">{client ? children : <p role="alert">Account access is unavailable right now. Please try again later.</p>}</div></section>
}

export function LoginPage() {
  const { client, session, loading } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  if (!loading && session) return <Navigate to="/profile" replace />
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || busy) return
    const form = new FormData(event.currentTarget)
    setBusy(true); setMessage('')
    try {
      const { error } = await client.auth.signInWithPassword({ email: String(form.get('email')).trim(), password: String(form.get('password')) })
      if (error) setMessage('Sign-in failed. Check your email and password, and confirm your email before signing in.')
      else navigate('/profile', { replace: true })
    } catch { setMessage('Unable to sign in. Check your connection and try again.') }
    finally { setBusy(false) }
  }
  return <AuthFrame title="Welcome back."><h2>Sign in</h2><form onSubmit={submit}><EmailField /><PasswordField /><button disabled={busy || loading} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button><p role="alert">{message}</p></form><Link to="/auth/forgot-password">Forgot your password?</Link><p>New here? <Link to="/register">Create an account</Link></p></AuthFrame>
}

export function RegisterPage() {
  const { client } = useAuth()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || busy) return
    const form = new FormData(event.currentTarget)
    setBusy(true); setMessage('')
    try {
      const { error } = await client.auth.signUp({
        email: String(form.get('email')).trim(), password: String(form.get('password')),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      setMessage(error ? 'Unable to register. Check your details and try again later.' : 'Check your email for a confirmation link. If you already have an account, sign in or reset your password.')
    } catch { setMessage('Unable to register. Check your connection and try again.') }
    finally { setBusy(false) }
  }
  return <AuthFrame title="Make a start."><h2>Create your account</h2><p>Confirm your email before signing in. Use at least 12 characters for your password.</p><form onSubmit={submit}><EmailField /><PasswordField newPassword /><button type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button><p role="status">{message}</p></form><p>Already registered? <Link to="/login">Sign in</Link></p></AuthFrame>
}

export function ForgotPasswordPage() {
  const { client } = useAuth()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || busy) return
    const email = String(new FormData(event.currentTarget).get('email')).trim()
    setBusy(true); setMessage('')
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/reset-password` })
      setMessage(error ? 'Unable to request a reset. Try again later.' : 'If an account matches that address, you’ll receive a password-reset email. Open it in this browser.')
    } catch { setMessage('Unable to request a reset. Check your connection and try again.') }
    finally { setBusy(false) }
  }
  return <AuthFrame title="A fresh start."><h2>Reset your password</h2><form onSubmit={submit}><EmailField /><button disabled={busy}>{busy ? 'Requesting…' : 'Send reset email'}</button><p role="status">{message}</p></form><Link to="/login">Back to sign in</Link></AuthFrame>
}

export function ResetPasswordPage() {
  const { client, session, loading } = useAuth()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [message, setMessage] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!client || !session || busy) return
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password'))
    if (password !== form.get('confirm_password')) { setMessage('The passwords do not match.'); return }
    setBusy(true); setMessage('')
    try {
      const { error } = await client.auth.updateUser({ password })
      if (error) setMessage('Unable to update your password. Request a new reset email and try again.')
      else { setDone(true); setMessage('Password updated. You can continue to your profile.') }
    } catch { setMessage('Unable to update your password. Check your connection and try again.') }
    finally { setBusy(false) }
  }
  return <AuthFrame title="Turn the page."><h2>Choose a new password</h2>{loading ? <p role="status">Checking your reset link…</p> : !session ? <p role="alert">This link is missing, expired, or was opened in a different browser. <Link to="/auth/forgot-password">Request a new reset email</Link>.</p> : done ? <><p role="status">{message}</p><Link to="/profile">Go to profile</Link></> : <form onSubmit={submit}><PasswordField newPassword /><label>Confirm password<input name="confirm_password" type="password" autoComplete="new-password" minLength={12} required /></label><button disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button><p role="alert">{message}</p></form>}</AuthFrame>
}

export function CallbackPage() {
  const { session, loading, error } = useAuth()
  const [linkError] = useState(() => new URLSearchParams(window.location.search).has('error') || new URLSearchParams(window.location.hash.slice(1)).has('error'))
  useEffect(() => {
    // Do not leave auth codes/errors in browser history after SDK initialization.
    if (!loading) window.history.replaceState(null, '', window.location.pathname)
  }, [loading])
  return <AuthFrame title="You’re nearly there."><h2>Email confirmation</h2>{loading ? <p role="status">Checking your confirmation link…</p> : linkError || error ? <p role="alert">Unable to confirm this link. It may have expired. Try signing in or requesting another confirmation.</p> : session ? <><p role="status">You’re signed in.</p><Link to="/profile">Continue to your profile</Link></> : <p>Email confirmation may have completed. <Link to="/login">Sign in</Link>. If you opened the link in another browser, return to the browser where you registered.</p>}</AuthFrame>
}

export function EmailField() {
  return <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
}
function PasswordField({ newPassword = false }: { newPassword?: boolean }) {
  return <label>Password<input name="password" type="password" autoComplete={newPassword ? 'new-password' : 'current-password'} minLength={newPassword ? 12 : 1} required /></label>
}
