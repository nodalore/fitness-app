import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router'
import { supabaseConfiguration } from './lib/supabase'
import { AuthProvider, useAuth } from './features/auth/AuthProvider'
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage, CallbackPage } from './features/auth/AuthPages'
import { ProfilePage } from './features/profile/ProfilePage'
import { Icon, TrainingImage } from './components/ui'

const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then(module => ({ default: module.DashboardPage })))
const RoutinesPage = lazy(() => import('./features/routines/RoutinesPage').then(module => ({ default: module.RoutinesPage })))

function Home() {
  return <>
    <section className="hero" aria-labelledby="home-title"><TrainingImage eager /><div className="hero-content">
      <p className="eyebrow">YOUR TRAINING, STAY CONSISTENT</p>
      <h1 id="home-title">Build a routine.<br /><em>Make it yours.</em></h1>
      <p className="intro">A thoughtful place to plan your training. Find your starting point, build a routine, and make consistency your own.</p>
      <Link className="button" to="/about">Explore the approach <span aria-hidden="true">↗</span></Link>
    </div></section>
    <section aria-labelledby="journey-title">
      <div className="section-heading"><h2 id="journey-title">A clear path from plan to progress</h2><span>A LITTLE STRUCTURE. MORE POSSIBILITY.</span></div>
      <div className="cards">
        <article><span className="number">01 / PLAN</span><h3>Find your starting point</h3><p>Routine suggestions will fit your goals, experience, available days, and equipment.</p></article>
        <article><span className="number">02 / TRAIN</span><h3>Make each session count</h3><p>Record exercises, sets, repetitions, and weights, with useful alternatives when you need a change.</p></article>
        <article><span className="number">03 / REFLECT</span><h3>Compare your workouts</h3><p>Look back at previous sessions and compare the same exercise over time.</p></article>
      </div>
    </section>
    <aside className="notice" aria-labelledby="status-title"><h2 id="status-title">The foundation is ready</h2><p>Create an account, save your profile, and explore your routine options. Workout logging arrives in a later stage.</p><p role="status">{supabaseConfiguration.ready ? 'Supabase configuration loaded. Sign in to access your profile.' : supabaseConfiguration.message}</p></aside>
  </>
}

function About() {
  return <section className="reading">
    <p className="eyebrow">THE APPROACH</p><h1>Simple tools.<br />Thoughtful guidance.</h1>
    <p className="intro">Fitness App is being built around consistent training and an honest record of what you do.</p>
    <h2>Recommendations you can understand</h2><p>The app uses documented rules to suggest routines. You can see why a routine fits and customize its exercise prescription. No paid AI service is needed.</p>
    <h2>Your timeline is a review point</h2><p>Your chosen timeline will help you decide when to review your training. The app will not promise a particular result by a particular date.</p>
    <h2>Sources behind the plan</h2><p>Our current recommendations use these sources alongside clearly labeled app defaults. Review the guidance and assumptions included with each routine.</p>
    <ul className="sources">
      <li><a href="https://acsm.org/education-resources/pronouncements-scientific-communications/position-stands/">ACSM position stands</a><p>Including the 2026 resistance-training position stand for healthy adults.</p></li>
      <li><a href="https://www.cdc.gov/physical-activity-basics/guidelines/adults.html">CDC adult physical activity guidance</a></li>
      <li><a href="https://www.nsca.com/education/articles/ptq/time-efficient-training/">NSCA: Time-Efficient Training</a></li>
    </ul>
    <Link className="text-link" to="/">Back to home <span aria-hidden="true">→</span></Link>
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
  const { pathname, hash } = useLocation()
  const { session } = useAuth()
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)
  useEffect(() => {
    const titles: Record<string, string> = { '/': 'Home', '/about': 'Our approach', '/login': 'Sign in', '/register': 'Create account', '/dashboard': 'Dashboard', '/profile': 'Profile', '/routines': 'Routines', '/auth/forgot-password': 'Reset password', '/auth/reset-password': 'New password', '/auth/callback': 'Email confirmation' }
    document.title = `${titles[pathname] ?? 'Page not found'} | Fitness App`
    if (previousPath.current !== pathname) {
      mainRef.current?.focus()
      previousPath.current = pathname
    }
  }, [pathname])

  useEffect(() => {
    if (!hash) return
    const target = document.getElementById(hash.slice(1))
    target?.scrollIntoView?.({ behavior: 'instant' })
    target?.focus()
  }, [pathname, hash])
  const links = session ? [
    { to: '/dashboard', label: 'Dashboard', icon: 'grid' as const },
    { to: '/routines', label: 'Discover', icon: 'compass' as const },
    { to: '/routines#saved', label: 'My routines', icon: 'layers' as const },
    { to: '/profile', label: 'Profile', icon: 'user' as const },
  ] : []
  return <div className={`app ${session ? 'has-account' : ''}`}>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="header"><Link className="brand" to={session ? '/dashboard' : '/'} aria-label="Fitness App home"><span className="brand-mark" aria-hidden="true"><Icon name="strength" /></span> Fitness App<span className="brand-dot">.</span></Link><nav aria-label="Main navigation">{!session && <NavLink to="/" end>Home</NavLink>}<NavLink to="/about">Our approach</NavLink><AccountNavigation /></nav></header>
    {session && <aside className="app-sidebar"><p className="eyebrow">TRAINING</p><nav aria-label="Your training">{links.map(link => <Link key={link.to} to={link.to} aria-current={`${pathname}${hash}` === link.to ? 'page' : undefined}><Icon name={link.icon} /><span>{link.label}</span></Link>)}</nav><div className="sidebar-note"><span className="eyebrow">STAY CONSISTENT</span><p>Show up.<br />Put in the work.</p><Link to="/about">Training guide ↗</Link></div></aside>}
    <main id="main" ref={mainRef} tabIndex={-1}><Routes><Route path="/" element={<Home />} /><Route path="/about" element={<About />} /><Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} /><Route path="/auth/forgot-password" element={<ForgotPasswordPage />} /><Route path="/auth/reset-password" element={<ResetPasswordPage />} /><Route path="/auth/callback" element={<CallbackPage />} /><Route path="/dashboard" element={<Suspense fallback={<p role="status">Loading dashboard…</p>}><DashboardPage /></Suspense>} /><Route path="/profile" element={<ProfilePage />} /><Route path="/routines" element={<Suspense fallback={<p role="status">Loading routines…</p>}><RoutinesPage /></Suspense>} /><Route path="*" element={<NotFound />} /></Routes></main>
    <footer><span>Fitness App</span><span>Stage 3 · Routine planning</span></footer>
  </div>
}
