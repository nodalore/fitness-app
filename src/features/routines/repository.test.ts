import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { archiveRoutine, loadWorkspace, saveRoutine } from './repository'
import { testDocument, testProfile, testCatalog } from './testFixtures'

test('save calls the atomic RPC without passing a caller-controlled owner ID', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: 'saved-id', error: null })
  await expect(saveRoutine({ rpc } as unknown as SupabaseClient, 'routine-id', testDocument, 'retry-id', null)).resolves.toBe('saved-id')
  expect(rpc).toHaveBeenCalledWith('fitness_save_routine', { p_id: 'routine-id', p_document: testDocument, p_request_id: 'retry-id', p_expected_updated_at: null })
})

test.each([
  ['PGRST202', /reviewed Stage 3 SQL function/], ['40001', /changed in another session/], ['42501', /not saved/],
])('RPC error %s is actionable without exposing server details', async (code, message) => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: 'internal-details' } })
  await expect(saveRoutine({ rpc } as unknown as SupabaseClient, 'id', testDocument, 'request', null)).rejects.toThrow(message)
})

test('workspace reads fresh owner-filtered records and orders nested prescriptions', async () => {
  const profileEq = vi.fn().mockReturnValue({ maybeSingle: async () => ({ data: testProfile, error: null }) })
  const routineOrder = vi.fn().mockResolvedValue({ data: [{ id: 'saved', updated_at: 'stamp', archived_at: null, ...testDocument, assumptions: { origin: 'custom', _save_receipts: { internal: 'hash' }, _save_request_id: 'old', _save_payload_hash: 'old' }, routine_days: [{ name: 'Day', weekday: 1, position: 0, routine_exercises: [...testDocument.days[0].exercises].map(item => ({ ...item, position: 0 })) }] }], error: null })
  const routineEq = vi.fn().mockReturnValue({ order: routineOrder })
  const from = vi.fn((table: string) => ({ select: () => table === 'profiles' ? { eq: profileEq } : table === 'exercises' ? { is: () => ({ order: async () => ({ data: testCatalog, error: null }) }) } : { eq: routineEq } }))
  const result = await loadWorkspace({ from } as unknown as SupabaseClient, 'owner-a')
  expect(profileEq).toHaveBeenCalledWith('user_id', 'owner-a')
  expect(routineEq).toHaveBeenCalledWith('user_id', 'owner-a')
  expect(result.routines[0].document.days[0].exercises[0].rest_seconds).toBe(120)
  expect(result.routines[0].document.assumptions).toEqual({ origin: 'custom' })
})

test('archive filters by owner, ID, version, and active state before confirming success', async () => {
  const single = vi.fn().mockResolvedValue({ data: { id: 'id' }, error: null })
  const chain = { eq: vi.fn(), is: vi.fn(), select: vi.fn() }
  chain.eq.mockReturnValue(chain); chain.is.mockReturnValue(chain); chain.select.mockReturnValue({ single })
  const update = vi.fn().mockReturnValue(chain)
  const client = { from: () => ({ update }) } as unknown as SupabaseClient
  await archiveRoutine(client, 'owner-a', { id: 'id', updated_at: 'stamp', archived_at: null, document: testDocument })
  expect(chain.eq).toHaveBeenCalledWith('user_id', 'owner-a')
  expect(chain.eq).toHaveBeenCalledWith('id', 'id')
  expect(chain.eq).toHaveBeenCalledWith('updated_at', 'stamp')
  expect(chain.is).toHaveBeenCalledWith('archived_at', null)
})
