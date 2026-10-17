import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { ProfilePage } from './ProfilePage'
import { defaultProfile } from './profile'

const mocks = vi.hoisted(() => ({ from: vi.fn(), maybeSingle: vi.fn(), upsert: vi.fn(), single: vi.fn(), eq: vi.fn() }))
const state = vi.hoisted(() => ({ session: { user: { id: 'test-user-a', email: 'a@example.test' } } as { user: { id: string; email: string } } | null, loading: false, error: '' }))
const client = { from: mocks.from }
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ ...state, client }) }))
beforeEach(() => {
  vi.clearAllMocks()
  state.session = { user: { id: 'test-user-a', email: 'a@example.test' } }
  state.loading = false; state.error = ''
  mocks.maybeSingle.mockResolvedValue({ data: { ...defaultProfile, display_name: 'Saved name' }, error: null })
  mocks.single.mockResolvedValue({ data: { user_id: 'test-user-a' }, error: null })
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle })
  mocks.upsert.mockReturnValue({ select: () => ({ single: mocks.single }) })
  mocks.from.mockReturnValue({ select: () => ({ eq: mocks.eq }), upsert: mocks.upsert })
})
function page() {
  return render(<MemoryRouter initialEntries={['/profile']}><Routes><Route path="/profile" element={<ProfilePage />} /><Route path="/login" element={<h1>Sign in required</h1>} /></Routes></MemoryRouter>)
}

test('signed-out visitors are redirected without requesting profile data', () => {
  state.session = null
  page()
  expect(screen.getByRole('heading', { name: 'Sign in required' })).toBeVisible()
  expect(mocks.from).not.toHaveBeenCalled()
})

test('loads the current account’s saved profile and writes only its own user ID', async () => {
  page()
  const user = userEvent.setup()
  const name = await screen.findByLabelText('Display name')
  expect(name).toHaveValue('Saved name')
  expect(mocks.eq).toHaveBeenCalledWith('user_id', 'test-user-a')
  await user.clear(name); await user.type(name, 'New name')
  await user.click(screen.getByRole('button', { name: 'Save profile' }))
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'test-user-a', display_name: 'New name' }), { onConflict: 'user_id' })
  expect(screen.getByRole('status')).toHaveTextContent('Profile saved to Supabase.')
})

test('missing tables show an actionable load error and retry succeeds', async () => {
  mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: '42P01' } })
  page()
  expect(await screen.findByRole('alert')).toHaveTextContent('SQL migrations')
  expect(screen.queryByRole('button', { name: 'Save profile' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
  expect(await screen.findByLabelText('Display name')).toHaveValue('Saved name')
})

test('save failures never claim success', async () => {
  mocks.single.mockResolvedValue({ data: null, error: { code: '42501' } })
  page()
  await screen.findByLabelText('Display name')
  await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
  expect(screen.getByRole('status')).toHaveTextContent('Profile was not saved')
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled()
})

test('a second mount loads data again rather than relying on a local form cache', async () => {
  const first = page()
  await screen.findByLabelText('Display name')
  first.unmount()
  mocks.maybeSingle.mockResolvedValue({ data: { ...defaultProfile, display_name: 'Reloaded name' }, error: null })
  page()
  expect(await screen.findByLabelText('Display name')).toHaveValue('Reloaded name')
  expect(mocks.maybeSingle).toHaveBeenCalledTimes(2)
})

test('empty profile starts with editable defaults', async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
  page()
  await waitFor(() => expect(screen.getByLabelText('Display name')).toHaveValue(''))
  expect(screen.getByLabelText('Fitness goal')).toHaveValue('general_fitness')
})
