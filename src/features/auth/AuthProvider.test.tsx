import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, vi } from 'vitest'
import App from '../../App'
import { AuthProvider, useAuth } from './AuthProvider'

const mock = vi.hoisted(() => ({
  getSession: vi.fn(), unsubscribe: vi.fn(), signOut: vi.fn(),
  listener: undefined as undefined | ((event: string, session: unknown) => void),
}))
vi.mock('../../lib/supabase', () => ({
  supabaseConfiguration: { ready: true },
  getSupabaseClient: () => client,
}))
const client = { auth: {
  getSession: mock.getSession,
  onAuthStateChange: (callback: typeof mock.listener) => { mock.listener = callback; return { data: { subscription: { unsubscribe: mock.unsubscribe } } } },
  signOut: mock.signOut,
} }
function Probe() {
  const { loading, session, error } = useAuth()
  return <p>{loading ? 'Loading session' : error || (session ? 'Signed in' : 'Signed out')}</p>
}
beforeEach(() => {
  vi.clearAllMocks(); mock.listener = undefined
  mock.getSession.mockResolvedValue({ data: { session: { user: { id: 'synthetic-user' } } }, error: null })
  mock.signOut.mockImplementation(async () => { mock.listener?.('SIGNED_OUT', null); return { error: null } })
})

test('restores a session and removes it on sign-out events', async () => {
  const result = render(<AuthProvider><Probe /></AuthProvider>)
  expect(await screen.findByText('Signed in')).toBeVisible()
  act(() => mock.listener?.('SIGNED_OUT', null))
  expect(screen.getByText('Signed out')).toBeVisible()
  result.unmount()
  expect(mock.unsubscribe).toHaveBeenCalledTimes(1)
})

test('a stale restoration result cannot undo a newer sign-out event', async () => {
  let resolve: (value: unknown) => void = () => {}
  mock.getSession.mockReturnValue(new Promise(done => { resolve = done }))
  render(<AuthProvider><Probe /></AuthProvider>)
  act(() => mock.listener?.('SIGNED_OUT', null))
  await act(async () => resolve({ data: { session: { user: { id: 'synthetic-user' } } }, error: null }))
  expect(screen.getByText('Signed out')).toBeVisible()
})

test('logout uses the SDK and removes the private navigation link', async () => {
  render(<MemoryRouter><App /></MemoryRouter>)
  expect(await screen.findByRole('link', { name: 'Profile' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(mock.signOut).toHaveBeenCalledWith({ scope: 'local' })
  expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Sign in' })).toBeVisible()
})

test('restoration network errors do not create an authenticated session', async () => {
  mock.getSession.mockRejectedValue(new Error('network'))
  render(<AuthProvider><Probe /></AuthProvider>)
  expect(await screen.findByText(/Unable to restore your session/)).toBeVisible()
})
