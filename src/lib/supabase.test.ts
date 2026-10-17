import { afterEach, vi } from 'vitest'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({ auth: {} })) }))
vi.mock('@supabase/supabase-js', () => ({ createClient }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  createClient.mockClear()
})

test('missing configuration does not create a client', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
  const { getSupabaseClient } = await import('./supabase')
  expect(getSupabaseClient()).toBeNull()
  expect(createClient).not.toHaveBeenCalled()
})

test('creates one client lazily with public configuration and PKCE', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_example_public_test_key')
  const { getSupabaseClient } = await import('./supabase')
  expect(createClient).not.toHaveBeenCalled()
  expect(getSupabaseClient()).toBe(getSupabaseClient())
  expect(createClient).toHaveBeenCalledTimes(1)
  expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'sb_publishable_example_public_test_key', {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  })
})
