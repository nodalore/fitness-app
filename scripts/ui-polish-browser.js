// Isolated read-only visual acceptance. No real auth, hosted requests or writes.
async (suppliedPage) => {
  const context = await suppliedPage.context().browser().newContext();
  const page = await context.newPage();
  const origin = 'http://127.0.0.1:5174';
  const report = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const js = body => route.fulfill({contentType:'application/javascript',body});
    if (url.pathname === '/src/lib/supabase.ts') return js('export const supabaseConfiguration={ready:true};export const getSupabaseClient=()=>null;');
    if (url.pathname === '/src/features/auth/AuthProvider.tsx') return js(`
      import { testProfile } from '/src/features/routines/testFixtures.ts';
      export const AuthProvider=({children})=>children;
      const profile={...testProfile,display_name:'Alex Morgan',gender:'prefer_not_to_say',training_days_per_week:4};
      const client={auth:{signOut:async()=>({error:null})},from:(table)=>{
        if(table!=='profiles')throw new Error('Unexpected fixture read');
        return {select(){return this},eq(){return this},maybeSingle:async()=>({data:profile,error:null})};
      }};
      export const useAuth=()=>({client,session:{user:{id:'a0000000-0000-4000-8000-000000000001',email:'synthetic@example.test'}},loading:false,error:''});
    `);
    if (url.pathname === '/src/features/routines/repository.ts') return js(`
      import { testProfile,testCatalog } from '/src/features/routines/testFixtures.ts';
      import expansion from '/src/data/catalog-expansion.json?import';
      import { blankExercise } from '/src/features/routines/types.ts';
      const catalog=[...testCatalog,...expansion.exercises.map(e=>({...e,deprecated_at:null}))];
      const hip=catalog.find(e=>e.slug==='dumbbell-hip-thrust'),rdl=catalog.find(e=>e.slug==='barbell-rdl');
      const sets=[{reps:10,load_kg:60,entered_unit:'kg'},{reps:8,load_kg:70,entered_unit:'lb'}];
      const routine={id:'10000000-0000-4000-8000-000000000111',dayIds:['10000000-0000-4000-8000-000000000112','10000000-0000-4000-8000-000000000113'],updated_at:'2026-10-18T12:00:00Z',archived_at:null,document:{name:'Strength / Foundation',goal:'muscle_growth',origin_template_key:null,recommendation_version:null,assumptions:{origin:'custom'},days:[{name:'Glutes and Hammies',weekday:null,exercises:[{...blankExercise('',hip.id),planned_sets:sets,notes:'Keep your upper back supported and your ribs down.'},{...blankExercise('',rdl.id),planned_sets:sets}]},{name:'Upper A',weekday:null,exercises:[{...blankExercise('Cable row / my setup'),planned_sets:sets}]}]}};
      export const loadWorkspace=async()=>({profile:{...testProfile,display_name:'Alex Morgan',gender:'prefer_not_to_say',experience:'intermediate',training_days_per_week:4,goal:'muscle_growth'},catalog,routines:[structuredClone(routine)]});
      export const saveRoutine=async()=>{throw new Error('No routine writes permitted in visual fixture')};
      export const deleteRoutine=saveRoutine;export const archiveRoutine=saveRoutine;export const restoreRoutine=saveRoutine;
    `);
    if (url.pathname === '/src/features/workouts/workoutRepository.ts') return js(`
      export class WorkoutConflict extends Error {};
      export const workoutRepository=()=>({load:async()=>[],save:async()=>({revision:1,status:'draft'}),cancel:async()=>{throw new Error('Cancellation not submitted in visual fixture')}});
    `);
    if (url.pathname === '/src/features/workouts/workoutHistoryRepository.ts') return js(`
      export const loadWorkoutHistory=async()=>({hasMore:false,workouts:[{id:'synthetic-history',date:'2026-10-18T15:00:00Z',sessionName:'Glutes and Hammies',routineName:'Strength / Foundation',exerciseCount:3,setCount:5,exercises:[
      {id:'hip',name:'Hip Thrust',sourceName:null,disposition:'performed',sets:[{id:'s1',number:1,reps:10,weight:180,unit:'lb'},{id:'s2',number:2,reps:10,weight:135,unit:'lb'},{id:'s3',number:3,reps:8,weight:60,unit:'kg'}]},
      {id:'replacement',name:'Cable pull-through',sourceName:'RDLs',disposition:'performed',sets:[{id:'s4',number:1,reps:12,weight:50,unit:'lb'}]},
      {id:'skip',name:'Walking lunges',sourceName:null,disposition:'skipped',sets:[]},
      {id:'extra',name:'Extra calf raises',sourceName:null,disposition:'performed',sets:[{id:'s5',number:1,reps:15,weight:null,unit:'kg'}]}]}]});
    `);
    return route.continue();
  });
  async function geometry(label) {
    const result = await page.evaluate(() => {
      const main=document.querySelector('main'),nav=document.querySelector('.app-sidebar'),header=document.querySelector('.header');
      const m=main.getBoundingClientRect(),n=nav.getBoundingClientRect(),h=header.getBoundingClientRect();
      const controls=[...document.querySelectorAll('input,select,textarea')].filter(el=>el.getClientRects().length);
      return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1||main.scrollWidth>main.clientWidth+1,overlap:m.top<h.bottom-1||(innerWidth<=760&&m.top<n.bottom-1),mainHeight:Math.round(m.height),smallControls:controls.filter(el=>el.getBoundingClientRect().height<43).map(el=>el.getAttribute('aria-label')||el.tagName)};
    });
    assert(!result.overflow&&!result.overlap&&result.mainHeight>0&&result.smallControls.length===0,label+': '+JSON.stringify(result));report.push({label,...result});
  }
  async function capture(label,width) { await page.screenshot({animations:'disabled',path:'/Users/nodaloree/fitness-app/preview-polish-'+label+'-'+width+'.png'}); }
  try {
    for (const width of [1440,390,320,768]) {
      await page.setViewportSize({width,height:850});
      await page.goto(origin+'/dashboard');await page.getByText('Welcome back, Alex Morgan.').waitFor();await geometry('dashboard');await capture('dashboard',width);
      await page.getByRole('navigation',{name:'Your training'}).getByRole('link',{name:'Discover',exact:true}).click();await page.getByRole('button',{name:'Open routine'}).waitFor();await geometry('discover');await capture('discover',width);
      await page.getByRole('button',{name:'Open routine'}).click();await page.locator('.recommendation-sessions .session-card').first().click();
      assert(await page.locator('.exercise-info[open]').count()===0,'Descriptions must start closed');
      await page.locator('.exercise-info > summary').first().click();await page.locator('.exercise-info > summary').nth(1).click();
      assert(await page.locator('.exercise-info[open]').count()===1,'Only one explanation may be open');await geometry('recommendation preview');
      await page.getByRole('button',{name:'Cancel',exact:true}).click();
      await page.getByRole('button',{name:'Create My Own Routine',exact:true}).click();await page.getByLabel('Routine name',{exact:true}).fill('Training / Custom');await page.getByLabel('Workout/session name',{exact:true}).fill('Back and Biceps');await page.getByLabel('Exercise name',{exact:true}).fill('My cable row');
      await page.getByRole('button',{name:'Add Set',exact:true}).click();await page.getByRole('button',{name:'Add Set',exact:true}).click();await page.getByLabel('Set 1 reps',{exact:true}).fill('10');await page.getByLabel('Set 1 planned weight',{exact:true}).fill('40');
      await geometry('custom editor');await capture('editor',width);
      await page.getByRole('button',{name:'Cancel',exact:true}).click();
      await page.getByRole('navigation',{name:'Your training'}).getByRole('link',{name:'My routines',exact:true}).click();await page.getByLabel('Choose a saved routine').waitFor();await geometry('my routines');
      await page.getByLabel('Choose a saved routine').selectOption('10000000-0000-4000-8000-000000000111');await page.getByRole('button',{name:'Day 1: Glutes and Hammies'}).click();await page.getByRole('button',{name:/Dumbbell hip thrust/}).click();await page.getByRole('button',{name:'Add set',exact:true}).click();await page.getByLabel('Set 1 weight',{exact:true}).fill('180');await page.getByLabel('Set 1 reps',{exact:true}).fill('10');
      await geometry('today actual sets');await capture('today',width);
      await page.getByRole('button',{name:'Cancel Workout',exact:true}).click();await geometry('cancellation confirmation');await page.getByRole('button',{name:'Keep Workout',exact:true}).click();assert(await page.getByLabel('Set 1 reps').inputValue()==='10','Keep must preserve actuals');
      await page.getByRole('navigation',{name:'Your training'}).getByRole('link',{name:'Workout History',exact:true}).click();await page.getByRole('button',{name:/Glutes and Hammies/}).waitFor();await geometry('history cards');await page.getByRole('button',{name:/Glutes and Hammies/}).click();await page.getByRole('cell',{name:'180 lb',exact:true}).waitFor();await geometry('history detail');await capture('history',width);
      await page.getByRole('navigation',{name:'Your training'}).getByRole('link',{name:'Profile',exact:true}).click();await page.getByLabel('Name',{exact:true}).waitFor();await geometry('profile');await capture('profile',width);
      await page.setViewportSize({width,height:600});await page.evaluate(()=>document.documentElement.style.zoom='1.5');await geometry('profile zoom 150%');await page.evaluate(()=>document.documentElement.style.zoom='1');
    }
    assert(errors.length===0,'Page errors: '+errors.join('; '));
    return {checks:report.length,report,pageErrors:errors,hostedAccess:false};
  } finally { await context.close(); }
}
