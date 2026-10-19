import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, vi } from 'vitest'
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
  mocks.maybeSingle.mockResolvedValue({ data: { ...defaultProfile, display_name: 'Saved name', gender: 'prefer_not_to_say' }, error: null })
  mocks.single.mockResolvedValue({ data: { user_id: 'test-user-a' }, error: null })
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle })
  mocks.upsert.mockReturnValue({ select: () => ({ single: mocks.single }) })
  mocks.from.mockReturnValue({ select: () => ({ eq: mocks.eq }), upsert: mocks.upsert })
})
afterEach(() => vi.restoreAllMocks())

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
  const name = await screen.findByLabelText('Name')
  expect(name).toHaveValue('Saved name')
  expect(mocks.eq).toHaveBeenCalledWith('user_id', 'test-user-a')
  await user.clear(name); await user.type(name, 'New name')
  await user.click(screen.getByRole('button', { name: 'Save profile' }))
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'test-user-a', display_name: 'New name' }), { onConflict: 'user_id', defaultToNull: false })
  expect(screen.getByRole('status')).toHaveTextContent('Profile saved.')
})

test('missing tables show an actionable load error and retry succeeds', async () => {
  mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: '42P01' } })
  page()
  expect(await screen.findByRole('alert')).toHaveTextContent('Check your connection and retry')
  expect(screen.queryByRole('button', { name: 'Save profile' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
  expect(await screen.findByLabelText('Name')).toHaveValue('Saved name')
})

test('save failures never claim success', async () => {
  mocks.single.mockResolvedValue({ data: null, error: { code: '42501' } })
  page()
  await screen.findByLabelText('Name')
  await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
  expect(screen.getByRole('status')).toHaveTextContent('Profile was not saved')
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled()
})

test('a second mount loads data again rather than relying on a local form cache', async () => {
  const first = page()
  await screen.findByLabelText('Name')
  first.unmount()
  mocks.maybeSingle.mockResolvedValue({ data: { ...defaultProfile, display_name: 'Reloaded name' }, error: null })
  page()
  expect(await screen.findByLabelText('Name')).toHaveValue('Reloaded name')
  expect(mocks.maybeSingle).toHaveBeenCalledTimes(2)
})

test('empty profile starts with editable defaults', async () => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
  page()
  await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue(''))
  expect(screen.getByLabelText('Fitness goal')).toHaveValue('general_fitness')
})


test.each(['existing', 'new'])('%s profiles save the detected timezone without asking the user', async kind => {
  const options = Intl.DateTimeFormat().resolvedOptions()
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ ...options, timeZone: 'Pacific/Auckland' })
  mocks.maybeSingle.mockResolvedValue({ data: kind === 'new' ? null : { ...defaultProfile, gender: 'woman', timezone: 'America/New_York' }, error: null })
  page()
  await screen.findByLabelText('Name')
  expect(screen.queryByLabelText(/timezone/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/For example, America/)).not.toBeInTheDocument()
  await userEvent.selectOptions(screen.getByLabelText('Gender'), 'prefer_not_to_say')
  await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ timezone: 'Pacific/Auckland', user_id: 'test-user-a' }), { onConflict: 'user_id', defaultToNull: false })
  expect(screen.getByRole('status')).toHaveTextContent('Profile saved.')
})

test('profile saving falls back to UTC if browser timezone detection is unavailable', async () => {
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(() => { throw new Error('Unavailable') })
  page()
  await screen.findByLabelText('Name')
  await userEvent.selectOptions(screen.getByLabelText('Gender'), 'prefer_not_to_say')
  await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ timezone: 'UTC' }), { onConflict: 'user_id', defaultToNull: false })
  expect(screen.getByRole('status')).toHaveTextContent('Profile saved.')
})

test('legacy profile frequency is suggested without changing old weekdays or saving automatically', async () => {
  mocks.maybeSingle.mockResolvedValue({ data: { ...defaultProfile, gender: 'man', training_days_per_week: null, available_weekdays: [1, 3, 5] }, error: null })
  page()
  const frequency = await screen.findByLabelText('Training days per week')
  expect(frequency).toHaveValue('')
  expect(screen.getByText(/previous availability suggests 3/)).toBeVisible()
  expect(screen.queryByRole('checkbox', { name: 'Monday' })).not.toBeInTheDocument()
  expect(mocks.upsert).not.toHaveBeenCalled()
  await userEvent.selectOptions(frequency, '4')
  await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ training_days_per_week: 4 }), expect.any(Object))
})
test('missing frequency migration is explained and never claims a successful save', async () => {
  mocks.single.mockResolvedValue({ data: null, error: { code: 'PGRST204' } })
  page()
  await screen.findByLabelText('Name')
  await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
  expect(screen.getByRole('status')).toHaveTextContent('Profile could not be saved')
  expect(screen.getByLabelText('Name')).toHaveValue('Saved name')
})

test('legacy gender is unselected and required, with only five editable fields', async () => {
  mocks.maybeSingle.mockResolvedValue({ data: { ...defaultProfile, gender: null }, error: null })
  page()
  const gender = await screen.findByLabelText('Gender')
  expect(gender).toHaveValue('')
  expect(gender).toBeRequired()
  expect(screen.getAllByRole('combobox')).toHaveLength(4)
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
  expect(mocks.upsert).not.toHaveBeenCalled()
  await userEvent.selectOptions(gender, 'prefer_not_to_say')
  await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
  const patch = mocks.upsert.mock.calls[0][0]
  expect(Object.keys(patch).sort()).toEqual(['user_id','display_name','gender','goal','experience','training_days_per_week','timezone'].sort())
})
