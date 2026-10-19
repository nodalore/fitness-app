import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router'
import { AuthProvider, useAuth } from './features/auth/AuthProvider'
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage, CallbackPage } from './features/auth/AuthPages'
import { ProfilePage } from './features/profile/ProfilePage'
import { Icon, TrainingImage } from './components/ui'

const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then(module => ({ default: module.DashboardPage })))
const RoutinesPage = lazy(() => import('./features/routines/RoutinesPage').then(module => ({ default: module.RoutinesPage })))

const WorkoutHistoryPage = lazy(() => import('./features/workouts/WorkoutHistoryPage').then(module => ({ default: module.WorkoutHistoryPage })))

function Home() {
  return <section className="hero landing-hero" aria-labelledby="home-title">
    <TrainingImage eager />
    <div className="hero-content">
      <h1 id="home-title">Make your training <em>easier.</em></h1>
      <Link className="button landing-action" to="/about">Explore our approach <Icon name="arrow" /></Link>
    </div>
  </section>
}

function About() {
  return <section className="creator-note" aria-labelledby="creator-title">
    <h1 id="creator-title">A Note From the Creator</h1>
    <div className="creator-letter">
      <p className="creator-greeting">Hi there! 👋</p>
      <p>I created Fitness App to make staying organized with your workouts a little easier.</p>
      <p>Whether you're just getting started or have been training for years, this app is designed to help you create your own workout routines, keep track of your exercises, weights, and reps, and look back at your progress over time.</p>
      <p>If you're not sure where to begin, Fitness App can also suggest a training routine based on your personal goals and experience.</p>
      <p>I'm continuously working to make the app better, and there are more exciting features on the way! Your feedback is always welcome, so if you have any suggestions, ideas, or run into an issue, feel free to reach out at <a href="mailto:nodaloree@gmail.com">nodaloree@gmail.com</a>.</p>
      <p>Thank you for giving Fitness App a try! I hope it helps make your fitness journey a little more organized, consistent, and enjoyable.</p>
      <div className="creator-signature"><p>With love,</p><p>Lorena</p></div>
    </div>
    <Link className="text-link" to="/">Back to home <Icon name="arrow" /></Link>
  </section>
}

function NotFound() {
  return <section className="reading"><p className="eyebrow">404</p><h1>Page not found</h1><p>That address isn’t part of Fitness App.</p><Link className="button" to="/">Back to home</Link></section>
}

export default function App() {
  return <AuthProvider><AppShell /></AuthProvider>
}

function AccountNavigation() {
  const { client, session, loading } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function logout() {
    if (!client || busy) return
    setBusy(true); setError('')
    try {
      const { error } = await client.auth.signOut({ scope: 'local' })
      if (error) setError('Unable to sign out. Please retry.')
    } catch { setError('Unable to sign out. Check your connection and retry.') }
    finally { setBusy(false) }
  }
  return <>{loading ? <span role="status">Checking session…</span> : session ? <><span className="account-indicator"><span aria-hidden="true" /> Your private space</span><button className="logout-button" onClick={logout} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button></> : <NavLink to="/login">Sign in</NavLink>}{error && <span role="alert">{error}</span>}</>
}

function AppShell() {
  const { pathname, hash, key } = useLocation()
  const { session } = useAuth()
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)
  useEffect(() => {
    const titles: Record<string, string> = { '/': 'Home', '/about': 'Our approach', '/login': 'Sign in', '/register': 'Create account', '/dashboard': 'Dashboard', '/history': 'Workout History', '/profile': 'Profile', '/routines': 'Routines', '/auth/forgot-password': 'Reset password', '/auth/reset-password': 'New password', '/auth/callback': 'Email confirmation' }
    document.title = `${titles[pathname] ?? 'Page not found'} | Fitness App`
    if (previousPath.current !== pathname) {
      mainRef.current?.focus()
      previousPath.current = pathname
    }
  }, [pathname])

  useEffect(() => {
    if (!hash) {
      if (mainRef.current) mainRef.current.scrollTop = 0
      return
    }
    const reveal = () => {
      const target = document.getElementById(hash.slice(1))
      if (!target) return false
      target.scrollIntoView?.({ behavior: 'instant' })
      target.focus({ preventScroll: true })
      return true
    }
    if (reveal()) return
    // Lazy route content may not have mounted when the location changes.
    const observer = new MutationObserver(() => { if (reveal()) observer.disconnect() })
    if (mainRef.current) observer.observe(mainRef.current, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [pathname, hash, key])
  const links = session ? [
    { to: '/dashboard', label: 'Dashboard', icon: 'grid' as const },
    { to: '/routines', label: 'Discover', icon: 'compass' as const },
    { to: '/routines#saved', label: 'My routines', icon: 'layers' as const },
    { to: '/history', label: 'Workout History', icon: 'history' as const },
    { to: '/profile', label: 'Profile', icon: 'user' as const },
  ] : []
  return <div className={`app ${session ? 'has-account' : ''}`}>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="header"><Link className="brand" to="/" aria-label="Fitness App home"><span className="brand-mark" aria-hidden="true"><Icon name="strength" /></span> Fitness App<span className="brand-dot">.</span></Link><nav aria-label="Main navigation">{!session && <NavLink to="/" end>Home</NavLink>}<NavLink to="/about">Our approach</NavLink><AccountNavigation /></nav></header>
    {session && <aside className="app-sidebar"><p className="eyebrow">TRAINING</p><nav aria-label="Your training">{links.map(link => <Link key={link.to} to={link.to} aria-current={`${pathname}${hash}` === link.to ? 'page' : undefined}><Icon name={link.icon} /><span>{link.label}</span></Link>)}</nav></aside>}
    <main id="main" ref={mainRef} tabIndex={-1}><Routes><Route path="/" element={<Home />} /><Route path="/about" element={<About />} /><Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} /><Route path="/auth/forgot-password" element={<ForgotPasswordPage />} /><Route path="/auth/reset-password" element={<ResetPasswordPage />} /><Route path="/auth/callback" element={<CallbackPage />} /><Route path="/dashboard" element={<Suspense fallback={<p role="status">Loading dashboard…</p>}><DashboardPage /></Suspense>} /><Route path="/profile" element={<ProfilePage />} /><Route path="/routines" element={<Suspense fallback={<p role="status">Loading routines…</p>}><RoutinesPage /></Suspense>} /><Route path="/history" element={<Suspense fallback={<p role="status">Loading workout history…</p>}><WorkoutHistoryPage /></Suspense>} /><Route path="*" element={<NotFound />} /></Routes><footer><span>© 2026 Fitness App.</span></footer></main>
  </div>
}
