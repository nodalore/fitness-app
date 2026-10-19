import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { archiveRoutine, restoreRoutine, deleteRoutine, loadWorkspace, saveRoutine } from './repository'
import { testDocument, testProfile, testCatalog } from './testFixtures'

test('save calls the atomic RPC without passing a caller-controlled owner ID', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: 'saved-id', error: null })
  await expect(saveRoutine({ rpc } as unknown as SupabaseClient, 'routine-id', testDocument, 'retry-id', null)).resolves.toBe('saved-id')
  expect(rpc).toHaveBeenCalledWith('fitness_save_routine', { p_id: 'routine-id', p_document: testDocument, p_request_id: 'retry-id', p_expected_updated_at: null })
})

test.each([
  ['PGRST202', /Routine saving is unavailable/], ['40001', /changed in another session/], ['55000', /permanently deleted/], ['42501', /not saved/],
])('RPC error %s is actionable without exposing server details', async (code, message) => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: 'internal-details' } })
  await expect(saveRoutine({ rpc } as unknown as SupabaseClient, 'id', testDocument, 'request', null)).rejects.toThrow(message)
})

test('workspace reads fresh owner-filtered records and orders nested prescriptions', async () => {
  const profileEq = vi.fn().mockReturnValue({ maybeSingle: async () => ({ data: testProfile, error: null }) })
  const routineOrder = vi.fn().mockResolvedValue({ data: [{ id: 'saved', updated_at: 'stamp', archived_at: null, ...testDocument, assumptions: { origin: 'custom', _save_receipts: { internal: 'hash' }, _save_request_id: 'old', _save_payload_hash: 'old' }, routine_days: [{ name: 'Day', weekday: 1, position: 0, routine_exercises: [...testDocument.days[0].exercises].map(item => ({ ...item, position: 0 })) }] }], error: null })
  const routineEq = vi.fn().mockReturnValue({ order: routineOrder })
  const from = vi.fn((table: string) => ({ select: () => table === 'profiles' ? { eq: profileEq } : table === 'exercises' ? { order: async () => ({ data: testCatalog, error: null }) } : { eq: routineEq } }))
  const result = await loadWorkspace({ from } as unknown as SupabaseClient, 'owner-a')
  expect(profileEq).toHaveBeenCalledWith('user_id', 'owner-a')
  expect(routineEq).toHaveBeenCalledWith('user_id', 'owner-a')
  expect(result.routines[0].document.days[0].exercises[0].rest_seconds).toBe(120)
  expect(result.routines[0].document.assumptions).toEqual({ origin: 'custom' })
})

test.each([['archive', archiveRoutine, 'archived'], ['restore', restoreRoutine, 'active'], ['delete', deleteRoutine, 'deleted']] as const)('%s uses the atomic owner/version-checked management RPC', async (action, operation, status) => {
  const rpc = vi.fn().mockResolvedValue({data:{id:'id',status},error:null}), from=vi.fn()
  const routine={id:'id',updated_at:'2026-10-18T12:00:00.123456Z',archived_at:action==='restore'?'stamp':null,document:testDocument}
  await operation({rpc,from} as unknown as SupabaseClient,'owner-a',routine)
  expect(rpc).toHaveBeenCalledExactlyOnceWith('fitness_manage_routine',{p_id:'id',p_action:action,p_expected_updated_at:routine.updated_at,p_expected_user_id:'owner-a'})
  expect(from).not.toHaveBeenCalled()
})

test('new custom targets call v2 without fallback even when unavailable', async () => {
  const { blankExercise } = await import('./types')
  const document = {...testDocument,days:[{name:'A',weekday:null,exercises:[{...blankExercise('Sled drag'),planned_sets:[{reps:8,load_kg:12.5,entered_unit:'kg' as const}]}]}]}
  const rpc=vi.fn().mockResolvedValue({data:null,error:{code:'PGRST202'}})
  await expect(saveRoutine({rpc} as unknown as SupabaseClient,'id',document,'request',null)).rejects.toThrow(/Routine saving is unavailable/)
  expect(rpc).toHaveBeenCalledTimes(1)
  expect(rpc).toHaveBeenCalledWith('fitness_save_routine_v2',expect.objectContaining({p_document:document,p_request_id:'request'}))
})
test('nested per-set reads preserve order, custom source, null and exact edit timestamp', async () => {
  const row={id:'saved',updated_at:'2026-10-18T12:34:56.123456+00:00',archived_at:null,...testDocument,routine_days:[{name:'A',weekday:null,position:0,routine_exercises:[{exercise_id:null,custom_exercise_name:'Private',planning_mode:'per_set',position:0,notes:'',routine_planned_sets:[{position:1,reps:6,load_kg:'25.5',entered_unit:'lb'},{position:0,reps:null,load_kg:null,entered_unit:'kg'}]}]}]}
  const from=vi.fn((table:string)=>({select:()=>table==='profiles'?{eq:()=>({maybeSingle:async()=>({data:null,error:null})})}:table==='exercises'?{order:async()=>({data:testCatalog,error:null})}:{eq:()=>({order:async()=>({data:[row],error:null})})}}))
  const result=await loadWorkspace({from} as unknown as SupabaseClient,'owner-a')
  expect(result.routines[0].updated_at).toBe(row.updated_at)
  expect(result.routines[0].document.days[0].exercises[0]).toMatchObject({exercise_id:null,custom_exercise_name:'Private',planned_sets:[{reps:null,load_kg:null,entered_unit:'kg'},{reps:6,load_kg:25.5,entered_unit:'lb'}]})
})
test('pre-007 read fallback retains old plans and does not hide arbitrary failures', async () => {
  const selects=vi.fn()
  const order=vi.fn().mockResolvedValueOnce({data:null,error:{code:'PGRST200'}}).mockResolvedValueOnce({data:[],error:null})
  const from=vi.fn((table:string)=>({select:(value:string)=>{selects(value);return table==='profiles'?{eq:()=>({maybeSingle:async()=>({data:null,error:null})})}:table==='exercises'?{order:async()=>({data:testCatalog,error:null})}:{eq:()=>({order})}}}))
  await expect(loadWorkspace({from} as unknown as SupabaseClient,'owner-a')).resolves.toMatchObject({routines:[]})
  expect(selects).toHaveBeenCalledWith('*,routine_days(*,routine_exercises(*))')
  order.mockReset().mockResolvedValue({data:null,error:{code:'42501'}})
  await expect(loadWorkspace({from} as unknown as SupabaseClient,'owner-a')).rejects.toThrow(/Unable to load/)
  expect(order).toHaveBeenCalledTimes(1)
})

test('missing relationship cache never silently turns stored targets into an empty plan', async () => {
  const order=vi.fn().mockResolvedValueOnce({data:null,error:{code:'PGRST200'}}).mockResolvedValueOnce({data:[{routine_days:[{routine_exercises:[{planning_mode:'per_set'}]}]}],error:null})
  const from=vi.fn((table:string)=>({select:()=>table==='profiles'?{eq:()=>({maybeSingle:async()=>({data:null,error:null})})}:table==='exercises'?{order:async()=>({data:[],error:null})}:{eq:()=>({order})}}))
  await expect(loadWorkspace({from} as unknown as SupabaseClient,'owner')).rejects.toThrow(/routine has not been changed/)
})


test.each([
 ['55000', /unfinished workouts/], ['40001', /changed in another session/], ['PGRST202', /Routine management is unavailable/], ['42501', /not deleted/],
])('management failure %s is actionable with no direct-delete fallback',async(code,message)=>{
 const rpc=vi.fn().mockResolvedValue({data:null,error:{code,message:'private internals'}}),from=vi.fn()
 await expect(deleteRoutine({rpc,from} as unknown as SupabaseClient,'owner',{id:'id',updated_at:'exact',archived_at:null,document:testDocument})).rejects.toThrow(message)
 expect(from).not.toHaveBeenCalled()
})
test('incorrect or missing management acknowledgements never report success',async()=>{
 const rpc=vi.fn().mockResolvedValueOnce({data:{id:'other',status:'deleted'},error:null}).mockResolvedValueOnce({data:null,error:null})
 const routine={id:'id',updated_at:'exact',archived_at:null,document:testDocument},client={rpc} as unknown as SupabaseClient
 await expect(deleteRoutine(client,'owner',routine)).rejects.toThrow(/not deleted/)
 await expect(restoreRoutine(client,'owner',routine)).rejects.toThrow(/not restored/)
})

test('saved catalog IDs and names remain readable even when an exercise has been retired', async () => {
  const retired={...testCatalog[0],name:'Previously saved movement',deprecated_at:'2026-10-01T00:00:00Z'}
  const row={id:'saved',updated_at:'exact-version',archived_at:null,...testDocument,routine_days:[{name:'Original day',weekday:1,position:0,routine_exercises:[{...testDocument.days[0].exercises[0],position:0}]}]}
  const from=vi.fn((table:string)=>({select:()=>table==='profiles'?{eq:()=>({maybeSingle:async()=>({data:null,error:null})})}:table==='exercises'?{order:async()=>({data:[retired],error:null})}:{eq:()=>({order:async()=>({data:[row],error:null})})}}))
  const result=await loadWorkspace({from} as unknown as SupabaseClient,'owner')
  expect(result.catalog).toEqual([retired])
  expect(result.routines[0].document.days[0].exercises).toEqual(testDocument.days[0].exercises)
})
