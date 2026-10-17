import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readSupabaseConfiguration } from './supabaseConfig'

export const supabaseConfiguration = readSupabaseConfiguration(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)

let client: SupabaseClient | undefined

// Lazy singleton: a missing .env.local must not crash the public pages.
// Importing this module does not make a request or imply a successful connection.
export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseConfiguration.ready) return null

  client ??= createClient(
    supabaseConfiguration.url,
    supabaseConfiguration.publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    },
  )

  return client
}
