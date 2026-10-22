import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {blankPlan} from '../src/lib/engine.js';
import {checkPersonalAccess,readPersonalPlan,savePersonalPlan,readDevicePlan,devicePlanKey,localDates,cloudError} from '../src/lib/personal.js';
function storage(){const data=new Map();return{get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v))};}
test('El espacio personal usa RPC con llave y no necesita usuarios ni tablas públicas',async()=>{
  const calls=[],key='a'.repeat(64),document=blankPlan('2026-10-22');
  const client={async rpc(name,args){calls.push([name,args]);return{data:name==='check_nutrition_personal_access'?true:name==='read_nutrition_personal_plan'?null:{revision:3},error:null};}};
  await checkPersonalAccess(client,key);assert.equal(await readPersonalPlan(client,key,document.date),null);
  assert.deepEqual(await savePersonalPlan(client,key,document,2),{revision:3});
  assert.deepEqual(calls.map(c=>c[0]),['check_nutrition_personal_access','read_nutrition_personal_plan','save_nutrition_personal_plan']);
  for(const [,args] of calls)assert.equal(args.p_access_key,key);
  assert.equal(calls[2][1].p_expected_revision,2);
});
test('Llave incorrecta, SQL pendiente y fallo de red se distinguen sin ocultar los borradores',async()=>{
  await assert.rejects(checkPersonalAccess({rpc:async()=>({data:false,error:null})},'invalid'),/llave personal no es válida/);
  await assert.rejects(readPersonalPlan({rpc:async()=>({error:{code:'PGRST202'}})},'key','2026-10-22'),/Falta activar/);
  await assert.rejects(savePersonalPlan({rpc:async()=>{throw new Error('raw network failure');}},'key',blankPlan('2026-10-22'),0),/siguen guardadas/);
  assert.equal(cloudError({code:'40001'}).conflict,true);
  assert.equal(cloudError({code:'28000'}).accessDenied,true);
});
test('Recupera la cuenta antigua más reciente sin perder el respaldo invitado ni sobrescribir un día ya sincronizado',()=>{
  const s=storage(),date='2026-10-22',guest=blankPlan(date),old=blankPlan(date);guest.updatedAt='2026-10-21T10:00:00';old.updatedAt='2026-10-22T10:00:00';old.goals.kcal=1600;
  s.setItem(devicePlanKey(date),JSON.stringify({document:guest,dirty:false}));
  s.setItem(`mi-plato-v3:old-user:${date}`,JSON.stringify({document:old,revision:10,dirty:false}));
  const recovered=readDevicePlan(s,date);assert.equal(recovered.document.goals.kcal,1600);assert.equal(recovered.dirty,true);assert.equal(recovered.revision,0);
  s.setItem(devicePlanKey(date),JSON.stringify({document:guest,personalSync:true,dirty:false,revision:2}));
  assert.equal(readDevicePlan(s,date).document.goals.kcal,1500);assert.equal(readDevicePlan(s,date).dirty,false);
  s.setItem(devicePlanKey(date),JSON.stringify({document:guest,personalManaged:true,personalSync:false,dirty:true}));
  assert.equal(readDevicePlan(s,date).document.goals.kcal,1500);assert.equal(readDevicePlan(s,date).dirty,true);
  assert.equal(JSON.parse(s.getItem(`mi-plato-v3:old-user:${date}`)).document.goals.kcal,1600);
});
test('Solo considera fechas locales válidas y excluye llaves y copias de recuperación',()=>{
  const s=storage();s.setItem('mi-plato:personal-access','private');s.setItem('mi-plato-v3:guest:2026-10-22','{}');s.setItem('mi-plato:2026-10-21','{}');s.setItem('mi-plato-v3:guest:2026-10-22:recovery:123','{}');
  assert.deepEqual(localDates(s),['2026-10-21','2026-10-22']);
});
test('SQL mantiene tablas privadas, llave hasheada, control de revisiones y restricciones del catálogo',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/202610220003_personal_space.sql',import.meta.url),'utf8');
  assert.match(sql,/revoke all on public\.nutrition_personal_settings,public\.nutrition_personal_plans from public,anon,authenticated/);
  assert.match(sql,/revoke all on function public\.configure_nutrition_personal_access\(boolean\) from public,anon,authenticated/);
  assert.equal((sql.match(/if not public\.check_nutrition_personal_access\(p_access_key\)/g)||[]).length,2);
  assert.match(sql,/extensions\.gen_random_bytes\(32\)/);assert.match(sql,/extensions\.digest\(access_key,'sha256'\)/);
  assert.match(sql,/current_revision,0\)<>p_expected_revision/);assert.match(sql,/Unauthorized ingredient or quantity/);assert.match(sql,/Daily fruit limit exceeded/);
  assert.ok(!sql.includes('using (true)'));
});
