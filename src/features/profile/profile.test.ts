import { defaultProfile, validateProfile } from './profile'

test('default profile is valid', () => expect(validateProfile(defaultProfile)).toBeNull())
test.each([
  { available_weekdays: [] }, { available_weekdays: [7] }, { timeline_weeks: 0 }, { timeline_weeks: 1.5 },
  { timeline_weeks: 53 }, { goal: 'unrecognized' }, { experience: 'unrecognized' },
  { equipment: [] }, { equipment: ['unrecognized'] }, { display_unit: 'stone' },
  { timezone: 'not/a/timezone' }, { display_name: 'x'.repeat(81) },
])('invalid profile input is rejected: %j', change => {
  expect(validateProfile({ ...defaultProfile, ...change })).toEqual(expect.any(String))
})

test.each([1, 7, 2.5, NaN])('invalid explicit training frequency %s is rejected', count => {
  expect(validateProfile({ ...defaultProfile, training_days_per_week: count }, true)).toContain('2–6')
})
test('legacy profiles remain readable but require explicit frequency before saving', () => {
  expect(validateProfile({ ...defaultProfile, training_days_per_week: null })).toBeNull()
  expect(validateProfile({ ...defaultProfile, training_days_per_week: null }, true)).toContain('2–6')
})
