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
