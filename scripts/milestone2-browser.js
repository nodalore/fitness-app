// Revised candidate for the empty-composer/delete/text-only corrections.
// This revision has not been approved or executed through Playwright MCP.
async (suppliedPage) => {
  const context = await suppliedPage.context().browser().newContext();
  const page = await context.newPage();
  const report = [];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:5173') return route.abort();
    if (url.pathname === '/src/lib/supabase.ts') return route.fulfill({contentType:'application/javascript',body:'export const supabaseConfiguration={ready:true}; export const getSupabaseClient=()=>null;'});
    if (url.pathname === '/src/features/auth/AuthProvider.tsx') return route.fulfill({contentType:'application/javascript',body:'export const AuthProvider=({children})=>children;const client={auth:{signOut:async()=>({error:null})}};export const useAuth=()=>({client,session:{user:{id:"synthetic-user",email:"test@example.test"}},loading:false,error:""});'});
    if (url.pathname === '/src/features/routines/repository.ts') return route.fulfill({contentType:'application/javascript',body:`
      import { testCatalog, testProfile } from '/src/features/routines/testFixtures.ts';
      const key='fitness-isolated-test-plans';
      const state=window.__fitnessTest={calls:[],deleteCalls:[],failNext:false,routines:JSON.parse(sessionStorage.getItem(key)||'[]')};
      export const loadWorkspace=async()=>({profile:testProfile,catalog:testCatalog,routines:structuredClone(state.routines)});
      export const saveRoutine=async(client,id,document,request,stamp)=>{
        state.calls.push({id,request,stamp,document:structuredClone(document)});
        if(state.failNext){state.failNext=false;throw new Error('Synthetic save failure. Draft kept.');}
        const row={id,updated_at:'2026-10-18T12:00:00.123456Z',archived_at:null,document:structuredClone(document)};
        state.routines=[row,...state.routines.filter(item=>item.id!==id)];sessionStorage.setItem(key,JSON.stringify(state.routines));return id;
      };
      export const deleteRoutine=async(client,owner,routine)=>{state.deleteCalls.push(routine.id);state.routines=state.routines.filter(item=>item.id!==routine.id);sessionStorage.setItem(key,JSON.stringify(state.routines));};
      export const archiveRoutine=async()=>{throw new Error('Archival is outside this browser fixture');};
    `});
    return route.continue();
  });
  const writes = () => page.evaluate(() => window.__fitnessTest.calls.length);
  const geometry = async label => {
    const result = await page.evaluate(() => {
      const main=document.querySelector('main'),nav=document.querySelector('.app-sidebar'),header=document.querySelector('.header');
      const m=main.getBoundingClientRect(),n=nav.getBoundingClientRect(),h=header.getBoundingClientRect();
      return {overflow:document.documentElement.scrollWidth>innerWidth+1||main.scrollWidth>main.clientWidth+1,overlap:m.top<h.bottom-1||(innerWidth<=760&&m.top<n.bottom-1),mainHeight:m.height};
    });
    assert(!result.overflow&&!result.overlap&&result.mainHeight>0,label+JSON.stringify(result));report.push({label,...result});
  };
  try {
    for (const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:600});await page.goto('http://127.0.0.1:5173/routines');
      await page.getByRole('button',{name:/Open routine/}).waitFor();assert(await page.getByRole('button',{name:/Open routine/}).count()===1,'one card');
      await geometry('collapsed '+width);await page.getByRole('button',{name:/Open routine/}).click();
      await page.locator('.recommendation-sessions .session-card').first().click();
      const summaries=page.locator('.matched-plan .exercise-info > summary');await summaries.nth(0).click();await summaries.nth(1).click();
      assert(await page.locator('.matched-plan .exercise-info[open]').count()===1,'one exercise disclosure');
      await geometry('preview '+width);await page.screenshot({path:'/Users/nodaloree/fitness-app/preview-m2-preview-'+width+'.png'});
      await page.getByRole('button',{name:'Cancel',exact:true}).click();assert(await writes()===0,'cancel preview wrote data');
      await page.getByRole('button',{name:/Open routine/}).click();await page.getByRole('button',{name:'Customize',exact:true}).click();
      await page.getByLabel('Exercise name',{exact:true}).fill('Unsaved changed exercise');await page.getByRole('button',{name:'Cancel',exact:true}).click();assert(await writes()===0,'cancel customize wrote data');
      await page.getByRole('button',{name:'Create My Own Routine',exact:true}).click();await page.getByLabel('Routine name',{exact:true}).fill('Browser plan '+width);
      await page.getByLabel('Workout/session name',{exact:true}).fill('Back and Biceps');await page.getByLabel('Exercise name',{exact:true}).fill('Private sled drag');
      await page.getByRole('button',{name:'Add Set',exact:true}).click();await page.getByRole('button',{name:'Add Set',exact:true}).click();
      await page.getByLabel('Set 1 reps',{exact:true}).fill('8');await page.getByLabel('Set 1 planned weight',{exact:true}).fill('20');
      await page.getByLabel('Set 2 reps',{exact:true}).fill('6');await page.getByLabel('Set 2 planned weight',{exact:true}).fill('25');
      await geometry('editor '+width);await page.screenshot({path:'/Users/nodaloree/fitness-app/preview-m2-editor-'+width+'.png'});
      await page.setViewportSize({width,height:360});await page.evaluate(()=>document.documentElement.style.zoom='1.5');await geometry('short zoom '+width);
      await page.evaluate(()=>document.documentElement.style.zoom='1');await page.setViewportSize({width,height:600});
      await page.evaluate(()=>window.__fitnessTest.failNext=true);await page.getByRole('button',{name:'Save Routine',exact:true}).click();
      await page.getByRole('alert').filter({hasText:'Synthetic save failure'}).waitFor();await page.getByRole('button',{name:'Save Routine',exact:true}).click();
      await page.getByRole('button',{name:'Edit Browser plan '+width,exact:true}).waitFor();
      const calls=await page.evaluate(()=>window.__fitnessTest.calls);assert(calls[0].request===calls[1].request,'retry changed token');
      assert(calls[1].document.days[0].exercises[0].planned_sets[1].load_kg===25,'per-set weight');
      await page.reload();await page.getByRole('button',{name:'Edit Browser plan '+width,exact:true}).click();assert(await page.getByLabel('Set 2 reps',{exact:true}).inputValue()==='6','reload lost reps');
      await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:/Open routine/}).click();await page.getByRole('button',{name:'Use This Routine',exact:true}).click();
      await page.getByRole('status').filter({hasText:'Available under My routines'}).waitFor();
      await page.getByRole('link',{name:'My routines',exact:true}).click();assert(await page.locator('#saved').evaluate(el=>document.activeElement===el),'hash focus');
      await page.getByRole('link',{name:'Discover',exact:true}).click();await page.goBack();await geometry('history '+width);
      await page.getByRole('button',{name:'Delete Browser plan '+width,exact:true}).click();
      assert(await page.evaluate(()=>window.__fitnessTest.deleteCalls.length)===0,'opening delete wrote data');
      await page.getByRole('button',{name:'Keep routine',exact:true}).click();
      await page.getByRole('button',{name:'Delete Browser plan '+width,exact:true}).click();
      await page.getByRole('button',{name:'Delete permanently',exact:true}).click();
      await page.getByRole('status').filter({hasText:'permanently deleted'}).waitFor();
      assert(await page.evaluate(()=>window.__fitnessTest.deleteCalls.length)===1,'delete request count');
      await page.evaluate(()=>sessionStorage.removeItem('fitness-isolated-test-plans'));
    }
    return report;
  } finally { await context.close(); }
}
