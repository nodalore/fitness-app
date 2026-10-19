import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('Vercel serves the SPA entry point for direct client-side routes', () => {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
    rewrites?: { source: string; destination: string }[]
  }
  expect(config.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }])
})
