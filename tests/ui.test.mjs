import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { build } = require('esbuild');
const domino = require('domino');
const source = JSON.parse(readFileSync(new URL('../data/catalogo.json', import.meta.url)));
const groupOf=f=>f.grupo_principal||(['carne','pescado_marisco','huevos','legumbres_derivados'].includes(f.categoria)||f.nombre.startsWith('Proteína de ')?'proteina':f.categoria==='frutos_secos_semillas'?'grasa':['verdura','carbohidrato','fruta','lacteos'].includes(f.categoria)?f.categoria:'otros');
const catalogue=source.alimentos.map(f=>({...f,grupo:groupOf(f)}));
const bootstrap={authorizedIds:catalogue.map(f=>f.id),foods:catalogue.filter(f=>['food_002','food_063','food_070','food_118','food_131','food_132','food_135','food_136','food_137','food_145'].includes(f.id)),count:catalogue.length,groups:['proteina','verdura','carbohidrato','grasa','fruta','lacteos','otros'].map(id=>({id,name:id,count:catalogue.filter(f=>f.grupo===id).length}))};
function storage(){const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
test('La interfaz React carga, cambia recetas y recalcula sin perder el plan',async()=>{
  const window=domino.createWindow('<html><body><div id="root"></div></body></html>','http://localhost:5173/');
  globalThis.window=window;globalThis.document=window.document;globalThis.HTMLElement=window.HTMLElement;globalThis.Node=window.Node;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:window.navigator});
  globalThis.localStorage=storage();globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    const path=String(url);const group=path.match(/\/group\/([^/]+)\.json/),id=path.match(/\/food\/([^/]+)\.json/);
    if(group)return new Response(JSON.stringify(catalogue.filter(f=>f.grupo===group[1])));
    if(id)return new Response(JSON.stringify(catalogue.find(f=>f.id===id[1])));
    throw new Error('Unexpected request '+path);
  };
  const output=new URL('../.astro/planner-test.mjs',import.meta.url);await mkdir(new URL('../.astro/',import.meta.url),{recursive:true});
  await build({entryPoints:[new URL('../src/components/Planner.jsx',import.meta.url).pathname],outfile:output.pathname,bundle:true,format:'esm',platform:'node',jsx:'automatic',packages:'external',define:{'import.meta.env.PUBLIC_SUPABASE_URL':'""','import.meta.env.PUBLIC_SUPABASE_ANON_KEY':'""'},logLevel:'silent'});
  const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {default:Planner}=await import(output.href);
  const root=createRoot(document.getElementById('root'));
  async function settle(fn){await act(async()=>{fn?.();await new Promise(r=>setTimeout(r,20));});}
  function meal(name){return Array.from(document.querySelectorAll('.meal')).find(el=>el.querySelector('h2').textContent===name);}
  function button(container,text){return Array.from(container.querySelectorAll('button')).find(b=>b.textContent.includes(text));}
  function click(el){assert.ok(el,'button exists');const event=document.createEvent('MouseEvents');event.initMouseEvent('click',true,true,window,1,0,0,0,0,false,false,false,false,0,null);el.dispatchEvent(event);}
  async function choose(container,index,id){await settle(()=>click(container.querySelectorAll('.food-picker-trigger')[index]));await settle(()=>click(container.querySelector(`[role=option][data-food-id="${id}"]`)));}

  try{
    await settle(()=>root.render(React.createElement(Planner,{bootstrap})));
    assert.equal(document.querySelectorAll('.meal').length,4);
    assert.equal(document.querySelectorAll('.meal .hint, .meal .fruit-reference-note').length,0);
    assert.match(document.querySelector('.plate-guide').textContent,/un solo envase de 125 g/);
    assert.ok(!document.querySelector('.meal-sheet').textContent.includes('Media mañana'));
    await settle(()=>click(button(meal('Desayuno'),'Pan con relleno')));
    assert.equal(meal('Desayuno').querySelectorAll('.ingredient').length,2,document.querySelector('.notice')?.textContent || meal('Desayuno').textContent);
    const first=document.querySelector('.stat strong').textContent;assert.notEqual(first,'0kcal');
    const breadInput=meal('Desayuno').querySelector('.quantity input');
    await settle(()=>{const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(breadInput,'60');const event=document.createEvent('Event');event.initEvent('input',true,true);breadInput.dispatchEvent(event);});
    const edited=JSON.parse(localStorage.getItem('mi-plato-v3:guest:'+document.querySelector('input[type=date]').value));
    assert.equal(edited.document.meals.Desayuno.find(i=>i.role==='bread').amount,60);
    assert.notEqual(document.querySelector('.stat strong').textContent,first);

    const fillingPicker=meal('Desayuno').querySelector('.food-picker');
    await settle(()=>click(fillingPicker.querySelector('.food-picker-trigger')));
    const fillingSearch=fillingPicker.querySelector('input[role=combobox]');
    await settle(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(fillingSearch,'queso');const event=document.createEvent('Event');event.initEvent('input',true,true);fillingSearch.dispatchEvent(event);});
    assert.equal(fillingPicker.querySelectorAll('[role=option]').length,4);
    assert.equal(fillingSearch.getAttribute('aria-controls'),fillingPicker.querySelector('[role=listbox]').id);
    await settle(()=>{const event=document.createEvent('Event');event.initEvent('pointerdown',true,true);document.querySelector('h1').dispatchEvent(event);});
    assert.ok(!fillingPicker.querySelector('.food-picker-panel'));
    assert.equal(fillingPicker.querySelector('.food-picker-trigger').getAttribute('aria-expanded'),'false');
    await choose(meal('Desayuno'),0,'food_099');
    const eggUnits=Array.from(meal('Desayuno').querySelectorAll('input')).find(i=>i.getAttribute('aria-label')==='Unidades de Huevo entero parte comestible');
    assert.ok(eggUnits,'Egg unit input is available alongside edible grams');
    await settle(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(eggUnits,'2');const event=document.createEvent('Event');event.initEvent('input',true,true);eggUnits.dispatchEvent(event);});
    const eggSaved=JSON.parse(localStorage.getItem('mi-plato-v3:guest:'+document.querySelector('input[type=date]').value));
    assert.equal(eggSaved.document.meals.Desayuno.find(i=>i.id==='food_099').amount,100);
    assert.ok(Array.from(meal('Desayuno').querySelectorAll('input')).some(i=>i.getAttribute('aria-label')==='Peso por unidad de Pan integral de molde'));
    await settle(()=>click(button(meal('Merienda'),'Yogur con fruta')));
    assert.equal(meal('Merienda').querySelectorAll('.ingredient').length,3);
    assert.match(document.querySelector('.plate-guide').textContent,/provisional/);
    assert.ok(!meal('Merienda').textContent.includes('La fruta propuesta'));
    assert.equal(meal('Merienda').querySelectorAll('.yogurt-unit').length,1);
    assert.notEqual(document.querySelector('.stat strong').textContent,first);
    const yogurtBefore=document.querySelector('.stat strong').textContent;
    await choose(meal('Merienda'),0,'food_145');
    assert.match(meal('Merienda').textContent,/Yogur natural Hacendado/);
    assert.notEqual(document.querySelector('.stat strong').textContent,yogurtBefore);
    assert.equal(document.querySelectorAll('.ingredient-label').length,0);
    assert.ok(!document.querySelector('.meal-sheet').textContent.includes('Usar etiqueta de mi marca'));
    await settle(()=>click(button(meal('Merienda'),'Pan con relleno')));
    await settle(()=>click(meal('Merienda').querySelector('.food-picker-trigger')));
    assert.deepEqual(Array.from(meal('Merienda').querySelectorAll('[role=option]')).map(o=>o.getAttribute('data-food-id')).sort(),['food_138','food_139','food_132','food_140','food_141','food_142','food_099','food_143'].sort());
    await settle(()=>click(meal('Merienda').querySelector('[role=option][data-food-id="food_142"]')));
    assert.match(meal('Merienda').textContent,/Queso curado/);
    await settle(()=>click(button(meal('Merienda'),'Yogur con fruta')));
    await settle(()=>click(meal('Merienda').querySelector('.food-picker-trigger')));
    assert.deepEqual(Array.from(meal('Merienda').querySelectorAll('[role=option]')).map(o=>o.getAttribute('data-food-id')).sort(),['food_131','food_145']);
    const yogurtSearch=meal('Merienda').querySelector('input[role=combobox]');
    await settle(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(yogurtSearch,'natural hacendado');const event=document.createEvent('Event');event.initEvent('input',true,true);yogurtSearch.dispatchEvent(event);});
    function key(el,name){const event=document.createEvent('Event');event.initEvent('keydown',true,true);Object.defineProperty(event,'key',{value:name});el.dispatchEvent(event);}
    await settle(()=>key(yogurtSearch,'ArrowDown'));
    await settle(()=>key(yogurtSearch,'Enter'));
    assert.match(meal('Merienda').querySelector('.food-picker-trigger').textContent,/natural Hacendado/);
    assert.ok(!meal('Merienda').querySelector('.food-picker-panel'));
    await settle(()=>click(meal('Merienda').querySelector('.food-picker-trigger')));
    await settle(()=>key(meal('Merienda').querySelector('input[role=combobox]'),'Escape'));
    assert.ok(!meal('Merienda').querySelector('.food-picker-panel'));
    await settle(()=>click(button(meal('Desayuno'),'Solo café')));
    assert.equal(meal('Desayuno').querySelectorAll('.ingredient').length,2);
    assert.match(meal('Desayuno').textContent,/Leche entera/);assert.match(meal('Desayuno').textContent,/Café solo/);
    await settle(()=>click(button(meal('Desayuno'),'Nada')));
    assert.equal(meal('Desayuno').querySelectorAll('.ingredient').length,0);
    const saved=JSON.parse(localStorage.getItem('mi-plato-v3:guest:'+document.querySelector('input[type=date]').value));
    assert.equal(saved.document.choices.Desayuno,'none');assert.equal(saved.document.choices.Merienda,'B');
    const chosen=[catalogue.find(f=>f.categoria==='carne'&&f.estado_referencia==='crudo').id,'food_026','food_063'];
    for(let i=0;i<chosen.length;i++)await choose(meal('Comida'),i,chosen[i]);
    assert.equal(meal('Cena').querySelectorAll('.food-picker-trigger').length,2);
    assert.equal(document.querySelectorAll('.proposal').length,0);
    assert.ok(!meal('Cena').textContent.includes('Guardar esta cena'));
    await choose(meal('Cena'),0,chosen[0]);
    await choose(meal('Cena'),1,'food_026');
    const dinnerSaved=JSON.parse(localStorage.getItem('mi-plato-v3:guest:'+document.querySelector('input[type=date]').value));
    assert.equal(dinnerSaved.document.meals.Cena.length,2);
    assert.equal(dinnerSaved.document.meals.Desayuno.length,0);
    await settle(()=>click(meal('Merienda').querySelector('button[aria-label="Borrar merienda"]')));
    assert.equal(meal('Merienda').querySelectorAll('.ingredient').length,0);
    assert.ok(!document.querySelector('.meal-undo'));
    assert.ok(!document.querySelector('.app-shell').textContent.includes('Deshacer'));
    await settle(()=>click(button(meal('Merienda'),'Yogur con fruta')));
    assert.equal(meal('Merienda').querySelectorAll('.ingredient').length,3);
    await choose(meal('Cena'),0,catalogue.find(f=>f.categoria==='carne'&&f.estado_referencia==='crudo').id);
    const dinnerGoal=meal('Cena').querySelector('input[aria-label="Objetivo de proteína para cena"]');
    assert.equal(dinnerGoal.required,false);
    const manual=JSON.parse(localStorage.getItem('mi-plato-v3:guest:'+document.querySelector('input[type=date]').value));
    assert.equal(manual.document.preferences.dinnerProteinMode,'remaining');
    assert.ok(manual.document.meals.Cena.find(i=>i.role==='protein').amount<=180);

    await settle(()=>click(button(document.querySelector('nav'),'Alimentos')));
    assert.equal(document.querySelectorAll('.group-grid button').length,7);
    const catalogSearch=document.querySelector('.catalog-panel input[type=search]');
    await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(catalogSearch,'atun');const event=document.createEvent('Event');event.initEvent('input',true,true);catalogSearch.dispatchEvent(event);await new Promise(r=>setTimeout(r,20));});
    await act(async()=>{await new Promise(r=>setTimeout(r,250));});
    assert.equal(document.querySelectorAll('.food-detail').length,2);
    assert.match(document.querySelector('.catalog-list').textContent,/Atún al natural/);
    assert.equal(document.querySelectorAll('.category-filters button').length,8);
    await settle(()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(catalogSearch,'zzzz');const event=document.createEvent('Event');event.initEvent('input',true,true);catalogSearch.dispatchEvent(event);});
    assert.match(document.querySelector('.search-empty').textContent,/No encontramos/);
    await settle(()=>click(document.querySelector('.search-field button[aria-label="Limpiar búsqueda"]')));
    assert.equal(document.querySelectorAll('.group-grid button').length,7);

    await settle(()=>click(document.querySelector('.group-grid button')));
    assert.ok(document.querySelectorAll('.food-detail').length<=8);
  }finally{await act(async()=>root.unmount());globalThis.fetch=originalFetch;globalThis.IS_REACT_ACT_ENVIRONMENT=false;}
});

test('Una cuenta recupera el plan desde otro navegador y aísla otras cuentas',async()=>{
  const window=domino.createWindow('<html><body><div id="root"></div></body></html>','http://localhost:5173/');
  globalThis.window=window;globalThis.document=window.document;globalThis.HTMLElement=window.HTMLElement;globalThis.Node=window.Node;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:window.navigator});globalThis.localStorage=storage();globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const remote=new Map();const writes=[];
  function cloud(userId){return{
    auth:{getSession:async()=>({data:{session:{user:{id:userId,email:userId+'@example.test'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from(table){const filters={};const builder={select(){return this;},eq(k,v){filters[k]=v;return this;},async order(){return{data:catalogue.filter(f=>f.grupo===filters.food_group).map(payload=>({payload})),error:null};},async maybeSingle(){assert.equal(table,'nutrition_daily_plans');assert.equal(filters.user_id,userId);return{data:remote.get(userId+':'+filters.plan_date)||null,error:null};}};return builder;},
    async rpc(name,args){assert.equal(name,'save_nutrition_daily_plan');assert.equal(args.p_user_id,userId);const key=userId+':'+args.p_date,old=remote.get(key),revision=old?.revision||0;if(revision!==args.p_expected_revision)return{data:null,error:{code:'40001'}};const row={document:structuredClone(args.p_document),revision:revision+1};remote.set(key,row);writes.push({userId,document:row.document});return{data:{revision:row.revision},error:null};},
    channel(){return{on(){return this;},subscribe(){return this;}};},async removeChannel(){},
  };}
  const output=new URL('../.astro/planner-test.mjs',import.meta.url);
  await build({entryPoints:[new URL('../src/components/Planner.jsx',import.meta.url).pathname],outfile:output.pathname,bundle:true,format:'esm',platform:'node',jsx:'automatic',packages:'external',define:{'import.meta.env.PUBLIC_SUPABASE_URL':'""','import.meta.env.PUBLIC_SUPABASE_ANON_KEY':'""'},logLevel:'silent'});
  const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client'),{default:Planner}=await import(output.href+'?cloud');
  let root=createRoot(document.getElementById('root'));
  async function settle(fn,ms=30){await act(async()=>{fn?.();await new Promise(r=>setTimeout(r,ms));});}
  const meal=name=>Array.from(document.querySelectorAll('.meal')).find(el=>el.querySelector('h2').textContent===name);
  const button=(el,text)=>Array.from(el.querySelectorAll('button')).find(b=>b.textContent.includes(text));
  const click=el=>{assert.ok(el);const e=document.createEvent('MouseEvents');e.initMouseEvent('click',true,true,window,1,0,0,0,0,false,false,false,false,0,null);el.dispatchEvent(e);};
  try{
    await settle(()=>root.render(React.createElement(Planner,{bootstrap,client:cloud('account-a')})));
    await settle(()=>click(button(meal('Desayuno'),'Pan con relleno')));
    await settle(()=>click(button(meal('Merienda'),'Yogur con fruta')));
    await settle(null,500);
    const date=document.querySelector('input[type=date]').value;
    assert.equal(remote.get('account-a:'+date).document.choices.Merienda,'B');assert.ok(writes.length>0);
    await act(async()=>root.unmount());
    // A new browser has no localStorage, but authenticates as the same account.
    globalThis.localStorage=storage();document.body.innerHTML='<div id="root"></div>';root=createRoot(document.getElementById('root'));
    await settle(()=>root.render(React.createElement(Planner,{bootstrap,client:cloud('account-a')})));
    assert.equal(meal('Desayuno').querySelectorAll('.ingredient').length,2);
    assert.equal(meal('Merienda').querySelectorAll('.ingredient').length,3);
    assert.match(document.querySelector('.save-line').textContent,/Guardado en tu cuenta/);
    await act(async()=>root.unmount());
    // Another account in the same browser never receives the first account's draft.
    document.body.innerHTML='<div id="root"></div>';root=createRoot(document.getElementById('root'));
    await settle(()=>root.render(React.createElement(Planner,{bootstrap,client:cloud('account-b')})));
    assert.equal(meal('Desayuno').querySelectorAll('.ingredient').length,0);assert.equal(meal('Merienda').querySelectorAll('.ingredient').length,0);
    assert.equal(remote.has('account-b:'+date),false);
  }finally{await act(async()=>root.unmount());globalThis.IS_REACT_ACT_ENVIRONMENT=false;}
});
