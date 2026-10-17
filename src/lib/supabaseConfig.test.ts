import { readSupabaseConfiguration } from './supabaseConfig'

const url = 'https://example.supabase.co'
const key = 'sb_publishable_example_public_test_key'

test.each([
  [undefined, undefined],
  [url, ''],
  [' ', key],
])('missing configuration is reported without crashing', (projectUrl, publishableKey) => {
  expect(readSupabaseConfiguration(projectUrl, publishableKey)).toMatchObject({ ready: false })
})

test('accepts and trims a public project URL and publishable key', () => {
  expect(readSupabaseConfiguration(` ${url} `, ` ${key} `)).toEqual({ ready: true, url, publishableKey: key })
})

test.each([
  'not-a-url',
  'http://example.supabase.co',
  `${url}/rest/v1`,
  'https://user:password@example.supabase.co',
  `${url}?key=private`,
])('rejects malformed or unsuitable project URL: %s', (projectUrl) => {
  expect(readSupabaseConfiguration(projectUrl, key)).toMatchObject({ ready: false })
})

test.each(['sb_secret_fake_test_value', 'eyJfake-legacy-JWT', 'sb_publishable_invalid!value', 'unrecognized'])('rejects non-publishable keys without echoing them', (value) => {
  const result = readSupabaseConfiguration(url, value)
  expect(result.ready).toBe(false)
  expect(JSON.stringify(result)).not.toContain(value)
})
