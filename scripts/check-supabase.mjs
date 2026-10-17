import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

// Read only this project's local public configuration; never print its values.
const env = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'))
const url = env.VITE_SUPABASE_URL?.trim()
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
if (!url?.startsWith('https://') || !key?.startsWith('sb_publishable_')) {
  console.error('Missing or invalid public Supabase configuration.')
  process.exit(1)
}
try {
  const response = await fetch(new URL('/auth/v1/settings', url), {
    headers: { apikey: key }, signal: AbortSignal.timeout(15000),
  })
  console.log(`Supabase Auth connectivity: HTTP ${response.status}`)
  if (!response.ok) process.exitCode = 1
  else {
    const settings = await response.json()
    console.log(`Email sign-in enabled: ${settings.external?.email === true}`)
    console.log(`Email confirmation required: ${settings.mailer_autoconfirm === false}`)
    console.log('No user was created or database record changed.')
  }
} catch {
  console.error('Unable to reach Supabase Auth. Check network access and project availability. No configuration values were logged.')
  process.exitCode = 1
}
