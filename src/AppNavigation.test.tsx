import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router'
import { beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import App from './App'

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), session: { user: { id: 'user-a' } } as object | null }))
vi.mock('./features/auth/AuthProvider', () => ({ AuthProvider: ({ children }: { children: ReactNode }) => children, useAuth: () => ({ client: { auth: { signOut: mocks.signOut } }, session: mocks.session, loading: false, error: '' }) }))
vi.mock('./lib/supabase', () => ({ supabaseConfiguration: { ready: true } }))
vi.mock('./features/dashboard/DashboardPage', () => ({ DashboardPage: () => <h1>Your dashboard</h1> }))
vi.mock('./features/routines/RoutinesPage', () => ({ RoutinesPage: () => <><h1>Your routines</h1><section id="saved" tabIndex={-1}>Saved routines</section></> }))
beforeEach(() => { vi.clearAllMocks(); mocks.session = { user: { id: 'user-a' } }; mocks.signOut.mockResolvedValue({ error: null }) })

test('navigation distinguishes Discover from My routines and updates page focus', async () => {
  render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>)
  expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  await userEvent.click(screen.getByRole('link', { name: 'My routines' }))
  expect(screen.getByRole('link', { name: 'My routines' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Discover' })).not.toHaveAttribute('aria-current')
  expect(await screen.findByText('Saved routines')).toHaveFocus()
  expect(document.title).toBe('Routines | Fitness App')
})
test('redesigned shell preserves local-browser sign-out and errors', async () => {
  mocks.signOut.mockResolvedValue({ error: { message: 'network' } })
  render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>)
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to sign out')
})

test('main scrolling resets on navigation and browser history, and hashes reveal saved content', async () => {
  function Back() { const navigate = useNavigate(); return <button onClick={() => navigate(-1)}>Back</button> }
  render(<MemoryRouter initialEntries={['/dashboard']}><Back /><App /></MemoryRouter>)
  const main = screen.getByRole('main')
  main.scrollTop = 500
  await userEvent.click(screen.getByRole('link', { name: 'Discover' }))
  expect(main.scrollTop).toBe(0)
  main.scrollTop = 300
  await userEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(main.scrollTop).toBe(0)
  await userEvent.click(screen.getByRole('link', { name: 'My routines' }))
  expect(await screen.findByText('Saved routines')).toHaveFocus()
  expect(screen.queryByText('STAY CONSISTENT')).not.toBeInTheDocument()
})
