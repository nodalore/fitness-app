import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'
import { testDocument, testProfile } from '../routines/testFixtures'

const mocks = vi.hoisted(() => ({ load: vi.fn(), client: {}, user: 'user-a' as string | null }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ client: mocks.client, session: mocks.user ? { user: { id: mocks.user } } : null, loading: false, error: '' }) }))
vi.mock('../routines/repository', () => ({ loadWorkspace: mocks.load }))
const saved = { id: 'routine-a', updated_at: 'version', archived_at: null, document: testDocument }
const workspace = () => ({ profile: { ...testProfile, display_name: 'Alex' }, catalog: [], routines: [saved, { ...saved, id: 'archived', archived_at: '2026-01-01', document: { ...testDocument, name: 'Archived plan' } }] })
beforeEach(() => { vi.clearAllMocks(); mocks.user = 'user-a'; mocks.load.mockResolvedValue(workspace()) })
function routing() { return <MemoryRouter initialEntries={['/dashboard']}><Routes><Route path="/dashboard" element={<DashboardPage />} /><Route path="/login" element={<h1>Sign in required</h1>} /></Routes></MemoryRouter> }

test('signed-out dashboard never requests private data', () => {
  mocks.user = null
  render(routing())
  expect(screen.getByRole('heading', { name: 'Sign in required' })).toBeVisible()
  expect(mocks.load).not.toHaveBeenCalled()
})
test('dashboard uses actual saved preferences and active plans, with no logging actions', async () => {
  render(routing())
  expect(await screen.findByText(/Welcome back, Alex/)).toBeVisible()
  expect(screen.getByText('01')).toBeVisible()
  expect(screen.getByRole('link', { name: /My training plan/ })).toHaveAttribute('href', '/routines#saved')
  expect(screen.queryByText('Archived plan')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /start workout/i })).not.toBeInTheDocument()
  expect(mocks.load).toHaveBeenCalledWith(mocks.client, 'user-a')
})
test('new accounts get a profile link and an honest empty library', async () => {
  mocks.load.mockResolvedValue({ profile: null, catalog: [], routines: [] })
  render(routing())
  expect(await screen.findByRole('link', { name: 'Set up profile' })).toHaveAttribute('href', '/profile')
  expect(screen.getByText(/No saved routines yet/)).toBeVisible()
})
test('failed dashboard loads offer a working retry', async () => {
  mocks.load.mockRejectedValueOnce(new Error('network'))
  render(routing())
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load')
  await userEvent.click(screen.getByRole('button', { name: 'Retry loading dashboard' }))
  expect(await screen.findByText(/Welcome back, Alex/)).toBeVisible()
})
test('account changes clear all previous dashboard data while loading', async () => {
  const page = render(routing())
  await screen.findByText(/Welcome back, Alex/)
  mocks.user = 'user-b'
  mocks.load.mockReturnValue(new Promise(() => {}))
  page.rerender(routing())
  expect(screen.queryByText(/Welcome back, Alex/)).not.toBeInTheDocument()
  expect(screen.queryByText('My training plan')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Loading your training space')
})
