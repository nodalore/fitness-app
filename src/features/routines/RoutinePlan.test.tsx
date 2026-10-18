import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoutinePlan } from './RoutinePlan'
import { testCatalog, testDocument } from './testFixtures'

test('workout cards disclose the complete saved prescription and notes', async () => {
  render(<RoutinePlan document={testDocument} catalog={testCatalog} />)
  const card = screen.getByText('Full body').closest('details')!
  expect(card).not.toHaveAttribute('open')
  await userEvent.click(card.querySelector('summary')!)
  expect(card).toHaveAttribute('open')
  expect(screen.getByText('bodyweight-squat')).toBeVisible()
  expect(screen.getByText('2 sets')).toBeVisible()
  expect(screen.getByText('8–12 reps')).toBeVisible()
  expect(screen.getByText('120s rest')).toBeVisible()
  expect(screen.getByText('Monday · 1 exercise')).toBeVisible()
})
test('unavailable exercise records and unscheduled workouts stay readable', async () => {
  render(<RoutinePlan document={{ ...testDocument, days: [{ ...testDocument.days[0], weekday: null }] }} catalog={[]} />)
  await userEvent.click(screen.getByText('Full body'))
  expect(screen.getByRole('heading', { name: 'Library exercise unavailable' })).toBeVisible()
  expect(screen.getByText('Flexible schedule · 1 exercise')).toBeVisible()
})


test('each exercise arrow reveals technique, equipment, loading and an original schematic', async () => {
  render(<RoutinePlan document={testDocument} catalog={testCatalog} />)
  await userEvent.click(screen.getByText('Full body'))
  await userEvent.click(screen.getByText('bodyweight-squat'))
  expect(screen.getByRole('img', { name: 'squat movement schematic' })).toBeVisible()
  expect(screen.getByText('Controlled movement.')).toBeVisible()
  expect(screen.getByText('Bodyweight reps; no external load assumed.')).toBeVisible()
})
