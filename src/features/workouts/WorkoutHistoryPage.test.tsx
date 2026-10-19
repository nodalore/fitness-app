import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { WorkoutHistoryPage } from './WorkoutHistoryPage'
import { historyWorkout } from './workoutHistoryRepository'
import { historyFixture } from './historyTestFixtures'
const mocks = vi.hoisted(() => ({ load: vi.fn(), auth: { client: {} as object | null, session: { user: { id: 'a' } } as { user: { id: string } } | null, loading: false, error: '' } }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => mocks.auth }))
vi.mock('./workoutHistoryRepository', async original => ({ ...await original<typeof import('./workoutHistoryRepository')>(), loadWorkoutHistory: mocks.load }))
const completed = () => historyWorkout(historyFixture())
function Page() { return <MemoryRouter><Routes><Route path="/" element={<WorkoutHistoryPage />} /><Route path="/login" element={<p>Sign in first</p>} /></Routes></MemoryRouter> }
beforeEach(() => { vi.clearAllMocks(); mocks.auth.session = { user: { id:'a' } }; mocks.auth.loading = false; mocks.auth.error = ''; mocks.load.mockResolvedValue({ workouts: [completed()], hasMore:false }) })
test('opens read-only actuals in original order, with units, replacements, extras and skipped status', async () => {
  render(<Page />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading workout history')
  const card = await screen.findByRole('button', { name: /Glutes and Hammies/ })
  expect(card).toHaveTextContent('3 exercises · 4 sets')
  await userEvent.click(card)
  expect(screen.getByRole('heading', { name:'Glutes and Hammies' })).toHaveFocus()
  expect(screen.getAllByRole('heading', { level:3 }).map(el => el.textContent)).toEqual(['Hip Thrust','Cable pull-through','Lunges','Extra calf raises'])
  const hip = within(screen.getByRole('region', { name:'Hip Thrust' }))
  expect(hip.getByRole('cell', { name:'180 lb' })).toBeVisible()
  expect(hip.getByRole('cell', { name:'60 kg' })).toBeVisible()
  expect(hip.getAllByRole('row')).toHaveLength(3)
  expect(screen.getByText('Replaced RDLs')).toBeVisible()
  expect(within(screen.getByRole('region', { name:'Lunges' })).getByText('Skipped')).toBeVisible()
  expect(within(screen.getByRole('region', { name:'Lunges' })).queryByRole('table')).not.toBeInTheDocument()
  expect(screen.getByRole('cell', { name:'0 lb' })).toBeVisible()
  expect(screen.getByRole('cell', { name:'—' })).toBeVisible()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name:'All workouts' }))
  await waitFor(() => expect(screen.getByRole('button', { name:/Glutes and Hammies/ })).toHaveFocus())
  expect(mocks.load).toHaveBeenCalledTimes(1)
})
test('empty history links to today; failed loads show a retry and recover', async () => {
  mocks.load.mockRejectedValueOnce(new Error('Unable to load workout history.')).mockResolvedValue({ workouts:[],hasMore:false })
  render(<Page />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load')
  await userEvent.click(screen.getByRole('button', { name:'Retry loading history' }))
  expect(await screen.findByRole('heading', { name:'No completed workouts yet' })).toBeVisible()
  expect(screen.getByRole('link', { name:'Go to Today’s Workout' })).toHaveAttribute('href','/routines#saved')
})
test('older/newer pages load independently and the end is disabled', async () => {
  mocks.load.mockResolvedValueOnce({workouts:[completed()],hasMore:true}).mockResolvedValue({workouts:[{...completed(),id:'older',sessionName:'Older session'}],hasMore:false})
  render(<Page />)
  await screen.findByRole('button', {name:/Glutes and Hammies/})
  expect(screen.getByRole('button',{name:'Newer workouts'})).toBeDisabled()
  await userEvent.click(screen.getByRole('button',{name:'Older workouts'}))
  await screen.findByRole('button',{name:/Older session/})
  expect(mocks.load.mock.calls[1][2]).toBe(1)
  expect(screen.getByRole('button',{name:'Older workouts'})).toBeDisabled()
})
test('account change hides old results immediately and ignores stale responses', async () => {
  let resolve!: (value: unknown) => void
  mocks.load.mockReturnValueOnce(new Promise(done => { resolve = done })).mockResolvedValueOnce({workouts:[],hasMore:false})
  const view = render(<Page />)
  mocks.auth.session = {user:{id:'b'}}; view.rerender(<Page />)
  await screen.findByText('No completed workouts yet')
  await act(async () => resolve({workouts:[completed()],hasMore:false}))
  expect(screen.queryByText('Glutes and Hammies')).not.toBeInTheDocument()
  expect(mocks.load.mock.calls[1][1]).toBe('b')
  mocks.auth.session=null;view.rerender(<Page />)
  expect(await screen.findByText('Sign in first')).toBeVisible()
})
test('remount fetches persisted completed data again', async () => {
  const view=render(<Page />);await screen.findByRole('button',{name:/Glutes and Hammies/});view.unmount()
  render(<Page />);await userEvent.click(await screen.findByRole('button',{name:/Glutes and Hammies/}))
  expect(screen.getByRole('cell',{name:'180 lb'})).toBeVisible();expect(mocks.load).toHaveBeenCalledTimes(2)
})
