import { useEffect, useRef } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router'

function Home() {
  return <>
    <section className="hero" aria-labelledby="home-title">
      <p className="eyebrow">YOUR TRAINING, ONE SESSION AT A TIME</p>
      <h1 id="home-title">Build a routine.<br />See your progress.</h1>
      <p className="intro">A simple place to plan your training, record what you lift, and understand how your workouts change over time.</p>
      <Link className="button" to="/about">Explore the approach <span aria-hidden="true">↗</span></Link>
    </section>
    <section aria-labelledby="journey-title">
      <div className="section-heading"><h2 id="journey-title">A clear path from plan to progress</h2><span>THE MVP PLAN</span></div>
      <div className="cards">
        <article><span className="number">01 / PLAN</span><h3>Find your starting point</h3><p>Routine suggestions will fit your goals, experience, available days, and equipment.</p></article>
        <article><span className="number">02 / TRAIN</span><h3>Make each session count</h3><p>Record exercises, sets, repetitions, and weights, with useful alternatives when you need a change.</p></article>
        <article><span className="number">03 / REFLECT</span><h3>Compare your workouts</h3><p>Look back at previous sessions and compare the same exercise over time.</p></article>
      </div>
    </section>
    <aside className="notice" aria-labelledby="status-title"><h2 id="status-title">The foundation is ready</h2><p>This is the Stage 1 preview. Accounts, routine recommendations, and workout saving will arrive in later stages. No workout data is collected here.</p></aside>
  </>
}

function About() {
  return <section className="reading">
    <p className="eyebrow">THE APPROACH</p><h1>Simple tools.<br />Thoughtful guidance.</h1>
    <p className="intro">Fitness App is being built around consistent training and an honest record of what you do.</p>
    <h2>Recommendations you can understand</h2><p>The MVP will use documented rules to suggest routines. You’ll be able to see why a routine fits, change it, and choose alternative exercises. No paid AI service is needed.</p>
    <h2>Your timeline is a review point</h2><p>Your chosen timeline will help you decide when to review your training. The app will not promise a particular result by a particular date.</p>
    <h2>Sources behind the plan</h2><p>These are the reference sources selected for the upcoming recommendation system. Detailed guidance and app assumptions will be documented as that system is implemented.</p>
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
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)
  useEffect(() => {
    document.title = `${pathname === '/' ? 'Home' : pathname === '/about' ? 'Our approach' : 'Page not found'} | Fitness App`
    if (previousPath.current !== pathname) {
      mainRef.current?.focus()
      previousPath.current = pathname
    }
  }, [pathname])

  return <div className="app">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="header"><Link className="brand" to="/" aria-label="Fitness App home"><span className="brand-mark" aria-hidden="true">F</span> Fitness App</Link><nav aria-label="Main navigation"><NavLink to="/" end>Home</NavLink><NavLink to="/about">Our approach</NavLink></nav></header>
    <main id="main" ref={mainRef} tabIndex={-1}><Routes><Route path="/" element={<Home />} /><Route path="/about" element={<About />} /><Route path="*" element={<NotFound />} /></Routes></main>
    <footer><span>Fitness App</span><span>Stage 1 · Frontend preview</span></footer>
  </div>
}
