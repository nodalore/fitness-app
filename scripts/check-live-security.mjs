import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

// Read-only hosted checks. Never log keys, response bodies, or personal records.
const env = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'))
const url = env.VITE_SUPABASE_URL?.trim()
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
if (!url?.startsWith('https://') || !key?.startsWith('sb_publishable_')) {
  console.error('Missing or invalid public configuration.')
  process.exit(1)
}
const owned = ['profiles', 'routines', 'routine_days', 'routine_exercises', 'workout_sessions', 'session_exercises', 'workout_sets']
const catalogs = [['exercises', 12], ['exercise_alternatives', 12], ['evidence_sources', 3]]
let failed = false
try {
  for (const table of owned) {
    const response = await fetch(new URL(`/rest/v1/${table}?select=user_id&limit=1`, url), { headers: { apikey: key }, signal: AbortSignal.timeout(15000) })
    const pass = response.status === 401 || response.status === 403
    console.log(`${pass ? 'PASS' : 'FAIL'} anonymous ${table} read: HTTP ${response.status}`)
    if (!pass) failed = true
    // Consume but never output potentially sensitive data, including on failure.
    await response.arrayBuffer()
  }
  for (const [table, expected] of catalogs) {
    const response = await fetch(new URL(`/rest/v1/${table}?select=*&limit=100`, url), { headers: { apikey: key }, signal: AbortSignal.timeout(15000) })
    const body = await response.json()
    const pass = response.ok && Array.isArray(body) && body.length === expected
    console.log(`${pass ? 'PASS' : 'FAIL'} public ${table} catalog: HTTP ${response.status}; expected seed count ${expected}${Array.isArray(body) ? `; observed ${body.length}` : ''}`)
    if (!pass) failed = true
  }
  console.log('Read-only checks finished. No user records, keys, or response bodies were printed; no writes were attempted.')
  console.log('Hosted two-user isolation still requires signed-in test identities or the reviewed rollback-only SQL test.')
} catch {
  console.error('Hosted security check could not finish. Check network access. No credentials were logged.')
  failed = true
}
process.exitCode = failed ? 1 : 0
