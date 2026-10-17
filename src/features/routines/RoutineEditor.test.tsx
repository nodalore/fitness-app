import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { RoutineEditor } from './RoutineEditor'
import { testCatalog, testDocument, testProfile } from './testFixtures'

test('edits and saves a prescription with the routine document', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  const user = userEvent.setup()
  render(<RoutineEditor initial={testDocument} catalog={testCatalog} profile={testProfile} onSave={save} onCancel={() => {}} />)
  await user.clear(screen.getByLabelText('Routine name'))
  await user.type(screen.getByLabelText('Routine name'), 'Custom strength')
  await user.clear(screen.getByLabelText('Workout 1, exercise 1: Sets'))
  await user.type(screen.getByLabelText('Workout 1, exercise 1: Sets'), '3')
  await user.click(screen.getByRole('button', { name: 'Save routine' }))
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Custom strength', days: [expect.objectContaining({ exercises: [expect.objectContaining({ target_sets: 3 })] })] }), expect.any(String))
})

test('failed saves preserve edits and retries reuse the request token', async () => {
  const save = vi.fn().mockRejectedValue(new Error('Routine was not saved. Please retry.'))
  const user = userEvent.setup()
  render(<RoutineEditor initial={testDocument} catalog={testCatalog} profile={testProfile} onSave={save} onCancel={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Save routine' }))
  expect(screen.getByRole('alert')).toHaveTextContent('not saved')
  expect(screen.getByLabelText('Routine name')).toHaveValue(testDocument.name)
  await user.click(screen.getByRole('button', { name: 'Save routine' }))
  expect(save.mock.calls[0][1]).toBe(save.mock.calls[1][1])
  await user.clear(screen.getByLabelText('Routine name'))
  await user.type(screen.getByLabelText('Routine name'), 'A different plan')
  await user.click(screen.getByRole('button', { name: 'Save routine' }))
  expect(save.mock.calls[2][1]).not.toBe(save.mock.calls[0][1])
})

test('days and exercises can be added, reordered, and removed', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  const user = userEvent.setup()
  render(<RoutineEditor initial={testDocument} catalog={testCatalog} profile={testProfile} onSave={save} onCancel={() => {}} />)
  await user.click(screen.getByRole('button', { name: 'Add workout day' }))
  await user.click(screen.getByRole('button', { name: 'Add exercise to workout 2' }))
  await user.click(screen.getAllByRole('button', { name: 'Move workout up' })[1])
  expect(screen.getByLabelText('Workout 1 name')).toHaveValue('Workout 2')
  await user.click(screen.getAllByRole('button', { name: 'Remove workout' })[1])
  await user.click(screen.getByRole('button', { name: 'Add exercise to workout 1' }))
  await user.click(screen.getAllByRole('button', { name: 'Move exercise up' })[1])
  await user.click(screen.getAllByRole('button', { name: 'Remove exercise' })[1])
  await user.click(screen.getByRole('button', { name: 'Save routine' }))
  expect(save.mock.calls[0][0].days).toHaveLength(1)
  expect(save.mock.calls[0][0].days[0].exercises).toHaveLength(1)
})

test('a day without exercises is explained before any save request', async () => {
  const save = vi.fn()
  render(<RoutineEditor initial={{ ...testDocument, days: [{ ...testDocument.days[0], exercises: [] }] }} catalog={testCatalog} profile={testProfile} onSave={save} onCancel={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Save routine' }))
  expect(save).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('1–20 exercises')
})


test('selecting a different exercise uses its recommended rest and rep defaults', async () => {
  render(<RoutineEditor initial={testDocument} catalog={testCatalog} profile={testProfile} onSave={async () => {}} onCancel={() => {}} />)
  await userEvent.selectOptions(screen.getByLabelText('Workout 1, exercise 1', { exact: true }), testCatalog[10].id)
  expect(screen.getByLabelText('Workout 1, exercise 1: Rest seconds')).toHaveValue(60)
  expect(screen.getByLabelText('Workout 1, exercise 1: Minimum reps')).toHaveValue(8)
})
