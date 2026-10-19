import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { TodaysWorkout } from './TodaysWorkout'
import { WorkoutConflict, type WorkoutRepository, type SaveResult, type SavedWorkout } from './workoutRepository'
import { testCatalog, testDocument } from '../routines/testFixtures'
import { blankExercise } from '../routines/types'
const routine = { id: crypto.randomUUID(), dayIds: [crypto.randomUUID()], updated_at: '2026-10-18T00:00:00Z', archived_at: null, document: { ...testDocument, days: [{ name: 'My workout', weekday: null, exercises: [blankExercise('Hip thrust'), blankExercise('RDLs')] }] } }
beforeEach(() => localStorage.clear())
function backend() {
 const records = new Map<string,SavedWorkout>(), receipts = new Map<string,SaveResult>()
 let failNext = false
 const repo: WorkoutRepository = {
  cancel: vi.fn().mockImplementation(async id => { records.delete(id) }),
  load: vi.fn().mockImplementation(async () => structuredClone([...records.values()])),
  save: vi.fn().mockImplementation(async (draft, expected, request, finish) => {
    if (receipts.has(request)) return receipts.get(request)!
    const previous = records.get(draft.id)
    if (previous && previous.revision !== expected) throw new WorkoutConflict('Conflict')
    const result: SaveResult = { revision: (previous?.revision ?? 0) + 1, status: finish ? 'completed' : 'draft' }
    if (finish) records.delete(draft.id); else records.set(draft.id, { draft: structuredClone(draft), revision: result.revision })
    receipts.set(request,result)
    if (failNext) { failNext = false; throw new Error('Response lost. Retry saving.') }
    return result
  }),
 }
 const props = { routines: [routine], catalog: testCatalog, defaultUnit: 'kg' as const, persistence: { repository: repo, userId: 'test-account-a' } }
 return { props, records, repo, fail: () => { failNext = true } }
}
async function begin(user: ReturnType<typeof userEvent.setup>) {
 await waitFor(() => expect(screen.getByLabelText('Choose a saved routine')).toBeEnabled())
 await user.selectOptions(screen.getByLabelText('Choose a saved routine'),routine.id)
 await user.click(screen.getByRole('button',{name:'Day 1: My workout'}))
 await user.click(screen.getByRole('button',{name:/Hip thrust/}))
 await user.click(screen.getByRole('button',{name:'Add set'}))
 await user.type(screen.getByLabelText('Set 1 reps'),'10')
 await user.type(screen.getByLabelText('Set 1 weight'),'20')
}
test('autosaves actuals, resumes after refresh, and finishes a partial workout once with a frozen summary',async()=>{
 const state = backend(), user = userEvent.setup(), view = render(<TodaysWorkout {...state.props}/>); await begin(user)
 await screen.findByText('Saved'); expect(state.records.size).toBe(1)
 const original = structuredClone(routine)
 view.unmount(); render(<TodaysWorkout {...state.props}/>)
 await user.click(await screen.findByRole('button',{name:/Resume My workout/}))
 await user.click(screen.getByRole('button',{name:/Hip thrust/}))
 expect(screen.getByLabelText('Set 1 reps')).toHaveValue(10); expect(screen.getByLabelText('Set 1 weight')).toHaveValue(20)
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
 await user.click(screen.getByRole('button',{name:'Finish Workout'}))
 expect(screen.getByRole('region',{name:'Finish workout confirmation'})).toHaveTextContent('1 exercises · 1 performed sets')
 expect(screen.getByLabelText('Set 1 reps')).toBeDisabled()
 await user.dblClick(screen.getByRole('button',{name:'Confirm finish'}))
 await screen.findByText(/Workout finished · My workout/)
 expect(vi.mocked(state.repo.save).mock.calls.filter(call=>call[3])).toHaveLength(1)
 expect(state.records.size).toBe(0); expect(routine).toEqual(original)
})
test('incomplete explicitly added sets block Finish and remain editable after server autosave',async()=>{
 const state = backend(), user = userEvent.setup(); render(<TodaysWorkout {...state.props}/>); await begin(user)
 await user.click(screen.getByRole('button',{name:'Add set'})); await screen.findByText('Saved')
 await user.click(screen.getByRole('button',{name:'Finish Workout'}))
 expect(screen.getByRole('alert')).toHaveTextContent('Enter reps')
 expect(screen.queryByRole('button',{name:'Confirm finish'})).not.toBeInTheDocument()
 await user.click(screen.getByRole('button',{name:'Remove actual set 2'})); await screen.findByText('Saved')
 await user.click(screen.getByRole('button',{name:'Finish Workout'})); await user.click(screen.getByRole('button',{name:'Keep logging'}))
 expect(screen.getByLabelText('Set 1 reps')).toBeEnabled()
})
test('lost server response survives refresh and retries identical request before saving newer inputs',async()=>{
 const state = backend(), user = userEvent.setup(); state.fail(); const view = render(<TodaysWorkout {...state.props}/>); await begin(user)
 await screen.findByText('Not saved'); expect(state.records.size).toBe(1)
 const first = vi.mocked(state.repo.save).mock.calls[0]; view.unmount(); render(<TodaysWorkout {...state.props}/>)
 await user.click(await screen.findByRole('button',{name:/Resume My workout/})); await user.click(screen.getByRole('button',{name:'Retry saving'}))
 await screen.findByText('Saved')
 expect(vi.mocked(state.repo.save).mock.calls[1]).toEqual(first)
 expect(state.records.size).toBe(1)
})

test('custom bodyweight is an explicit choice; missing weighted load cannot finish or masquerade as valid history',async()=>{
 const state=backend(),user=userEvent.setup();render(<TodaysWorkout {...state.props}/>);await begin(user)
 await user.clear(screen.getByLabelText('Set 1 weight'));await screen.findByText('Saved')
 await user.click(screen.getByRole('button',{name:'Finish Workout'}))
 expect(screen.getByRole('alert')).toHaveTextContent('Enter weight')
 expect(screen.queryByRole('button',{name:'Confirm finish'})).not.toBeInTheDocument()
 await user.selectOptions(screen.getByLabelText('Exercise weight entry'),'bodyweight');await screen.findByText('Saved')
 await user.click(screen.getByRole('button',{name:'Finish Workout'}))
 expect(screen.getByRole('button',{name:'Confirm finish'})).toBeVisible()
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
 expect(vi.mocked(state.repo.save).mock.calls.at(-1)?.[0].exercises[0]).toMatchObject({loadingMode:'bodyweight',sets:[expect.objectContaining({reps:10,loadKg:null})]})
})

test('Keep Workout preserves the draft; confirmed cancellation removes only the workout and returns to selection',async()=>{
 const state=backend(),user=userEvent.setup(),original=structuredClone(routine);render(<TodaysWorkout {...state.props}/>);await begin(user)
 await screen.findByText('Saved')
 await user.click(screen.getByRole('button',{name:'Cancel Workout'}))
 expect(screen.getByRole('region',{name:'Cancel workout confirmation'})).toHaveTextContent('Cancel this workout? All sets and changes recorded in this session will be discarded. Your saved routine will not be affected.')
 expect(state.repo.cancel).not.toHaveBeenCalled();expect(screen.getByLabelText('Set 1 reps')).toBeDisabled()
 await user.click(screen.getByRole('button',{name:'Keep Workout'}))
 expect(screen.getByLabelText('Set 1 reps')).toHaveValue(10);expect(screen.getByLabelText('Set 1 weight')).toHaveValue(20)
 expect(state.records.size).toBe(1)
 await user.click(screen.getByRole('button',{name:'Cancel Workout'}));await user.click(screen.getByRole('button',{name:'Yes, Cancel Workout'}))
 await waitFor(()=>expect(screen.getByLabelText('Choose a saved routine')).toHaveValue(''))
 expect(state.records.size).toBe(0);expect(state.repo.cancel).toHaveBeenCalledTimes(1);expect(routine).toEqual(original)
 expect(screen.queryByRole('button',{name:'Finish Workout'})).not.toBeInTheDocument()
})
test('failed cancellation keeps recovery and disables further logging until an explicit cancellation retry succeeds',async()=>{
 const state=backend(),user=userEvent.setup();vi.mocked(state.repo.cancel).mockRejectedValueOnce(new Error('Cancel Workout is unavailable right now.'))
 render(<TodaysWorkout {...state.props}/>);await begin(user);await screen.findByText('Saved')
 await user.click(screen.getByRole('button',{name:'Cancel Workout'}));await user.click(screen.getByRole('button',{name:'Yes, Cancel Workout'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('Cancel Workout is unavailable')
 expect(screen.getByLabelText('Set 1 reps')).toHaveValue(10);expect(screen.getByLabelText('Set 1 reps')).toBeDisabled()
 expect(screen.getByRole('button',{name:'Keep Workout'})).toBeDisabled();expect(state.records.size).toBe(1)
 await user.click(screen.getByRole('button',{name:'Retry cancellation'}))
 await waitFor(()=>expect(screen.getByLabelText('Choose a saved routine')).toBeEnabled());expect(state.records.size).toBe(0)
})
