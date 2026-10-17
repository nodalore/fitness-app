import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import { beforeEach, vi } from 'vitest'
import { RoutinesPage } from './RoutinesPage'
import { testCatalog, testDocument, testProfile } from './testFixtures'

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), archive: vi.fn(), client: {}, user: 'user-a' as string | null }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ client: mocks.client, session: mocks.user ? { user: { id: mocks.user } } : null, loading: false, error: '' }) }))
vi.mock('./repository', () => ({ loadWorkspace: mocks.load, saveRoutine: mocks.save, archiveRoutine: mocks.archive }))
const saved = { id: 'routine-a', updated_at: '2026-01-01', archived_at: null, document: testDocument }
const workspace = () => ({ profile: testProfile, catalog: testCatalog, routines: [saved] })
beforeEach(() => {
  vi.clearAllMocks(); mocks.user = 'user-a'
  mocks.load.mockResolvedValue(workspace()); mocks.save.mockResolvedValue('routine-a'); mocks.archive.mockResolvedValue(undefined)
})
function routing() {
  return <MemoryRouter initialEntries={['/routines']}><Routes><Route path="/routines" element={<RoutinesPage />} /><Route path="/login" element={<h1>Please sign in</h1>} /></Routes></MemoryRouter>
}
function page() { return render(routing()) }

test('signed-out users cannot load routine data', () => {
  mocks.user = null
  page()
  expect(screen.getByRole('heading', { name: 'Please sign in' })).toBeVisible()
  expect(mocks.load).not.toHaveBeenCalled()
})

test('recommendation selection opens the full prescription and saves through the repository', async () => {
  page()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /Customize & save Full body · standard/ }))
  expect(screen.getByRole('heading', { name: 'Edit your routine' })).toBeVisible()
  expect(screen.getByLabelText('Workout 1, exercise 1: Minimum reps')).toHaveValue(8)
  expect(screen.getByLabelText('Workout 1, exercise 1: Rest seconds')).toHaveValue(120)
  await user.click(screen.getByRole('button', { name: 'Save routine' }))
  expect(mocks.save).toHaveBeenCalledWith(mocks.client, expect.any(String), expect.objectContaining({ origin_template_key: 'full-body-standard' }), expect.any(String), null)
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit your routine' })).not.toBeInTheDocument())
  expect(mocks.load).toHaveBeenCalledTimes(2)
})

test('custom creation and existing-routine editing are available', async () => {
  const user = userEvent.setup()
  page()
  await user.click(await screen.findByRole('button', { name: 'Edit My training plan' }))
  expect(screen.getByLabelText('Routine name')).toHaveValue(testDocument.name)
  await user.click(screen.getByRole('button', { name: 'Save routine' }))
  expect(mocks.save).toHaveBeenCalledWith(mocks.client, saved.id, expect.any(Object), expect.any(String), saved.updated_at)
  await user.click(screen.getByRole('button', { name: 'Create a routine' }))
  expect(screen.getByLabelText('Routine name')).toHaveValue('My routine')
})

test('archive requires confirmation, preserves records, and reloads from Supabase', async () => {
  const user = userEvent.setup()
  page()
  await user.click(await screen.findByRole('button', { name: 'Archive My training plan' }))
  expect(mocks.archive).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Confirm archive' }))
  expect(mocks.archive).toHaveBeenCalledWith(mocks.client, 'user-a', saved)
  expect(screen.getByRole('status')).toHaveTextContent('Routine archived')
  expect(mocks.load).toHaveBeenCalledTimes(2)
})

test('load failures are actionable and retryable', async () => {
  mocks.load.mockRejectedValueOnce(new Error('network'))
  page()
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load routines')
  await userEvent.click(screen.getByRole('button', { name: 'Retry loading routines' }))
  expect(await screen.findByRole('heading', { name: 'Your saved routines' })).toBeVisible()
})

test('remounting reloads saved routines instead of reading an in-browser cache', async () => {
  const first = page()
  await screen.findByRole('heading', { name: 'My training plan' })
  first.unmount()
  mocks.load.mockResolvedValue({ ...workspace(), routines: [{ ...saved, document: { ...testDocument, name: 'Reloaded saved plan' } }] })
  page()
  expect(await screen.findByRole('heading', { name: 'Reloaded saved plan' })).toBeVisible()
  expect(mocks.load).toHaveBeenCalledTimes(2)
})

test('missing fitness profile links to setup and does not generate default recommendations', async () => {
  mocks.load.mockResolvedValue({ ...workspace(), profile: null })
  page()
  expect(await screen.findByRole('link', { name: 'fitness profile' })).toHaveAttribute('href', '/profile')
  expect(screen.queryByText('Suggested starting points')).not.toBeInTheDocument()
})


test('switching accounts clears the previous account’s routines before the new load completes', async () => {
  const result = page()
  await screen.findByRole('heading', { name: 'My training plan' })
  mocks.user = 'user-b'
  mocks.load.mockReturnValue(new Promise(() => {}))
  result.rerender(routing())
  expect(screen.queryByRole('heading', { name: 'My training plan' })).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Loading your training journal')
  expect(mocks.load).toHaveBeenLastCalledWith(mocks.client, 'user-b')
})
