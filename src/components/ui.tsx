import type { ReactNode } from 'react'

export function Icon({ name, className = '' }: { name: 'grid' | 'compass' | 'layers' | 'user' | 'arrow' | 'strength'; className?: string }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    compass: <><circle cx="12" cy="12" r="9" /><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    strength: <><path d="m5 5 14 14M3 7l4-4M2 4l2-2m13 19 4-4m-1 5 2-2M3 11l8-8m2 18 8-8" /></>,
  }
  return <svg className={`icon ${className}`} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <header className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="intro">{description}</p>}</div>{action && <div className="heading-action">{action}</div>}</header>
}
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`panel ${className}`}>{children}</div>
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>
}
export function StatCard({ label, value, detail }: { label: string; value: ReactNode; detail: string }) {
  return <Panel className="stat-card"><span className="stat-label">{label}</span><strong>{value}</strong><span className="stat-detail">{detail}</span></Panel>
}
export function TrainingImage({ className = '', eager = false }: { className?: string; eager?: boolean }) {
  return <img className={`training-image ${className}`} src="/images/training-floor.webp" srcSet="/images/training-floor-small.webp 720w, /images/training-floor.webp 1440w" sizes="(max-width: 760px) 100vw, 60vw" width="1440" height="2160" alt="" loading={eager ? 'eager' : 'lazy'} />
}
