import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoutinePlan } from './RoutinePlan'
import { blankExercise } from './types'
import { testCatalog, testDocument } from './testFixtures'

test('saved plans display exact exercise names, aggregate ranges and notes without explanations or images', async () => {
  const {container}=render(<RoutinePlan document={testDocument} catalog={testCatalog} />)
  const card=screen.getByText('Full body').closest('details')!
  expect(card).not.toHaveAttribute('open');await userEvent.click(card.querySelector('summary')!)
  expect(screen.getByRole('heading',{name:'bodyweight-squat'})).toBeVisible()
  expect(screen.getByText('2 sets')).toBeVisible();expect(screen.getByText('8–12 reps')).toBeVisible();expect(screen.getByText('120s rest')).toBeVisible()
  expect(screen.getByText('Monday · 1 exercise')).toBeVisible()
  expect(container.querySelector('.exercise-info')).toBeNull();expect(screen.queryByRole('img')).not.toBeInTheDocument()
})
test('recommendation details are concise text only and one exercise explanation opens at a time', async () => {
  const document={...testDocument,days:[{...testDocument.days[0],exercises:[...testDocument.days[0].exercises,{...testDocument.days[0].exercises[0],exercise_id:testCatalog[1].id}]}]}
  const {container}=render(<RoutinePlan document={document} catalog={testCatalog} showDescriptions />)
  expect(screen.queryByText(/Bend at the hips/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Full body/ }))
  expect(screen.getAllByText(/^Equipment:/)).toHaveLength(2)
  await userEvent.click(screen.getByText('bodyweight-squat'))
  expect(screen.getByText('Bend at the hips and knees to lower into a squat, then stand.')).toBeVisible()
  await userEvent.click(screen.getByText('goblet-squat'))
  expect(container.querySelectorAll('.exercise-info[open]')).toHaveLength(1)
  expect(screen.queryByText(/Bend at the hips/)).not.toBeInTheDocument()
  expect(screen.getByText('Hold one dumbbell at chest height while squatting and standing.')).toBeVisible()
  expect(container.querySelector('img,svg:not(.icon),video,iframe')).toBeNull()
  expect(screen.queryByText(/photograph pending|Photo could/)).not.toBeInTheDocument()
})
test('unknown catalog records and unscheduled workouts stay readable without substitution', async () => {
  render(<RoutinePlan document={{...testDocument,days:[{...testDocument.days[0],weekday:null}]}} catalog={[]} />)
  await userEvent.click(screen.getByText('Full body'))
  expect(screen.getByRole('heading',{name:'Library exercise unavailable'})).toBeVisible()
  expect(screen.getByText('Flexible schedule · 1 exercise')).toBeVisible()
})
test('custom exercise names, per-set differences, NULL and zero remain readable without explanations',async()=>{
  const document={...testDocument,days:[{name:'Custom session',weekday:null,exercises:[{...blankExercise('My row'),planned_sets:[{reps:8,load_kg:0,entered_unit:'kg' as const},{reps:6,load_kg:20,entered_unit:'kg' as const},{reps:null,load_kg:null,entered_unit:'kg' as const}]}]}]}
  const {container}=render(<RoutinePlan document={document} catalog={testCatalog} expandedSessions />)
  expect(screen.getByRole('heading',{name:'My row'})).toBeVisible();expect(screen.getByText('0 kg')).toBeVisible();expect(screen.getByText('20 kg')).toBeVisible()
  expect(screen.getByText('8')).toBeVisible();expect(screen.getByText('6')).toBeVisible();expect(screen.getAllByText('Unset')).toHaveLength(2)
  expect(container.querySelector('.exercise-info,img')).toBeNull()
})

const splitDocument = { ...testDocument, days: ['Upper A', 'Lower A', 'Upper B', 'Lower B'].map((name, index) => ({
  ...testDocument.days[0], name, exercises: [{ ...testDocument.days[0].exercises[0], exercise_id: testCatalog[index].id }],
})) }
test('recommendation sessions start collapsed, switch exclusively, and stay open through rerenders', async () => {
  const user = userEvent.setup()
  const { container, rerender } = render(<RoutinePlan document={splitDocument} catalog={testCatalog} showDescriptions />)
  const sessions = screen.getByRole('group', { name: 'Workout sessions' })
  expect(within(sessions).getAllByRole('button')).toHaveLength(4)
  expect(container.querySelector('.session-panel')).toBeNull()
  await user.click(screen.getByRole('button', { name: /Upper A/ }))
  expect(screen.getByRole('region', { name: 'Upper A' })).toBeVisible()
  expect(screen.getByText(testCatalog[0].name)).toBeVisible()
  expect(screen.queryByText(testCatalog[3].name)).not.toBeInTheDocument()
  rerender(<RoutinePlan document={structuredClone(splitDocument)} catalog={testCatalog} showDescriptions />)
  expect(screen.getByRole('region', { name: 'Upper A' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: /Lower B/ }))
  expect(screen.queryByRole('region', { name: 'Upper A' })).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Lower B' })).toBeVisible()
  expect(screen.queryByText(testCatalog[0].name)).not.toBeInTheDocument()
  expect(screen.getByText(testCatalog[3].name)).toBeVisible()
  expect(within(sessions).getAllByRole('button', { expanded: true })).toHaveLength(1)
  expect(container.querySelectorAll('.session-panel')).toHaveLength(1)
})
test('the current session closes with its card or X and reopening resets exercise details', async () => {
  const user = userEvent.setup()
  const { container } = render(<RoutinePlan document={splitDocument} catalog={testCatalog} showDescriptions />)
  const card = screen.getByRole('button', { name: /Upper A/ })
  await user.click(card)
  await user.click(screen.getByText(testCatalog[0].name))
  expect(container.querySelector('.exercise-info[open]')).not.toBeNull()
  await user.click(card)
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
  expect(card).toHaveAttribute('aria-expanded', 'false')
  await user.click(card)
  expect(container.querySelector('.exercise-info[open]')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Close Upper A' }))
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
  expect(card).toHaveAttribute('aria-expanded', 'false')
})

test('Hip Thrust explanation and long notes stay hidden until requested and close independently of the session', async () => {
  const hip = { ...testCatalog[2], id: 'hip-thrust', slug: 'dumbbell-hip-thrust', name: 'Hip Thrust' }
  const note = 'Keep the bench stable and the dumbbell secured throughout each repetition.'
  const document = { ...testDocument, days: [{ ...testDocument.days[0], exercises: [
    { ...testDocument.days[0].exercises[0], exercise_id: hip.id, notes: note },
    { ...testDocument.days[0].exercises[0], exercise_id: testCatalog[0].id },
  ] }] }
  const original = structuredClone(document), user = userEvent.setup()
  const { container } = render(<RoutinePlan document={document} catalog={[...testCatalog, hip]} showDescriptions />)
  const explanation = 'Support your upper back on a bench and raise your hips with a dumbbell across the hip crease.'
  await user.click(screen.getByRole('button', { name: /Full body/ }))
  expect(screen.queryByText(explanation)).not.toBeInTheDocument(); expect(screen.queryByText(note)).not.toBeInTheDocument()
  await user.click(screen.getByText('Hip Thrust'))
  expect(screen.getByText(explanation)).toBeVisible(); expect(screen.getByText(note)).toBeVisible()
  await user.click(screen.getByText('Hip Thrust'))
  expect(screen.queryByText(explanation)).not.toBeInTheDocument(); expect(screen.queryByText(note)).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Full body' })).toBeVisible()
  await user.click(screen.getByText('Hip Thrust')); await user.click(screen.getByText('bodyweight-squat'))
  expect(screen.queryByText(explanation)).not.toBeInTheDocument(); expect(container.querySelectorAll('.exercise-info[open]')).toHaveLength(1)
  expect(document).toEqual(original)
})
test('saved exercise notes are collapsed and remain available without changing prescriptions', async () => {
  const note = 'A long personal note that should not crowd the saved routine preview.'
  const document = { ...testDocument, days: [{ ...testDocument.days[0], exercises: [{ ...testDocument.days[0].exercises[0], notes: note }] }] }
  render(<RoutinePlan document={document} catalog={testCatalog} expandedSessions />)
  expect(screen.getByText(note)).not.toBeVisible()
  await userEvent.click(screen.getByText('Exercise notes'))
  expect(screen.getByText(note)).toBeVisible(); expect(screen.getByText('8–12 reps')).toBeVisible()
  await userEvent.click(screen.getByText('Exercise notes')); expect(screen.getByText(note)).not.toBeVisible()
})

 test.each([true, false])('empty planned targets have no badge or empty summary (recommendation: %s)', async showDescriptions => {
  const initial = { ...structuredClone(testDocument), days: [{ ...testDocument.days[0], exercises: [blankExercise('', testCatalog[0].id)] }] }
  const before = structuredClone(initial)
  const { container } = render(<RoutinePlan document={initial} catalog={testCatalog} showDescriptions={showDescriptions} expandedSessions />)
  if (showDescriptions) {
    await userEvent.click(screen.getByRole('button', { name: /Full body/ }))
    expect(screen.getByText(/^Equipment:/)).toBeVisible()
    await userEvent.click(screen.getByText(testCatalog[0].name))
    expect(screen.getByText('Bend at the hips and knees to lower into a squat, then stand.')).toBeVisible()
  } else expect(screen.getByRole('heading', { name: testCatalog[0].name })).toBeVisible()
  expect(screen.queryByText('Targets unset')).not.toBeInTheDocument()
  expect(container.querySelector('.prescription-summary')).toBeNull()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(initial).toEqual(before)
  expect(initial.days[0].exercises[0].planned_sets).toEqual([])
 })
