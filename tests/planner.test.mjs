import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blankPlan, preset, planningIssues, applyPlanningAdjustment, FRUIT_REFERENCE_NOTICE, clearMeal, restoreMeal, calculateDinnerRemainder, useRemainingDinnerProtein, setUnitWeight, ingredientFood, updateAmount, updateCoffee, setSlot, setProteinGoal, propose, portion, sum, dayTotals, fruitServings, budget, carbohydrateEquivalent, validatePlan, validateDocument, migrateLegacy, RECIPE } from '../src/lib/engine.js';
import { createSaveQueue, createFoodStore, writeCloudPlan } from '../src/lib/repository.js';
const source = JSON.parse(readFileSync(new URL('../data/catalogo.json', import.meta.url)));
const foods = Object.fromEntries(source.alimentos.map(f => [f.id, {...f,grupo:f.grupo_principal||(['carne','pescado_marisco','huevos','legumbres_derivados'].includes(f.categoria)?'proteina':f.categoria==='frutos_secos_semillas'?'grasa':f.categoria)}]));
const food = match => Object.values(foods).find(match);
const meat = food(f=>f.categoria==='carne'&&f.estado_referencia==='crudo');
const veg = foods.food_026;
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);
function fullPlan() {
  let p=preset(blankPlan('2026-10-21'),'Desayuno','A',foods);
  p=preset(p,'Merienda','B',foods);
  for(const m of ['Comida','Cena']){p=setSlot(p,m,'protein',meat,foods);p=setSlot(p,m,'vegetable',veg,foods);}
  return setSlot(p,'Comida','carb',foods[RECIPE.rice],foods);
}
test('Opciones A y B iniciales exactas y cantidades editables',()=>{
  let p=preset(blankPlan('2026-10-21'),'Desayuno','A',foods);
  assert.deepEqual(p.meals.Desayuno.map(i=>i.amount),[50,100]);
  p=preset(p,'Merienda','B',foods);assert.deepEqual(p.meals.Merienda.map(i=>i.amount),[125,10,125]);
  p=updateAmount(p,'Desayuno',p.meals.Desayuno[0].key,60);assert.equal(p.meals.Desayuno[0].amount,60);
  assert.throws(()=>preset(p,'Merienda','none',foods));assert.throws(()=>preset(p,'Merienda','coffee',foods));
});
test('Café guarda leche y café separados, suma todos los macros y no altera la receta editada',()=>{
  let p=preset(blankPlan('2026-10-21'),'Desayuno','coffee',foods);
  assert.deepEqual(p.meals.Desayuno.map(i=>[i.role,i.amount]),[['milk',150],['coffee',50]]);
  const n=dayTotals(p,foods),milk=portion(foods[RECIPE.whole],150),coffee=portion(foods[RECIPE.coffee],50);
  for(const key of Object.keys(n))close(n[key],milk[key]+coffee[key]);
  p=updateCoffee(p,{milkId:RECIPE.semi});close(dayTotals(p,foods).kcal,70.5+3);
  p=preset(p,'Desayuno','A',foods);p=updateAmount(p,'Desayuno',p.meals.Desayuno[0].key,60);
  p=preset(p,'Desayuno','A',foods,{coffee:true});assert.equal(p.meals.Desayuno.find(i=>i.role==='bread').amount,60);assert.equal(p.meals.Desayuno.length,4);
  p=preset(p,'Desayuno','none',foods);assert.equal(p.meals.Desayuno.length,0);assert.equal(dayTotals(p,foods).kcal,0);
});
test('Solo desayuno y merienda como tomas pequeñas y bebidas solo en desayuno',()=>{
  let p=blankPlan('2026-10-21');assert.equal(p.choices['Media mañana'],undefined);
  assert.throws(()=>preset(p,'Media mañana','A',foods));
  assert.throws(()=>preset(p,'Media mañana','coffee',foods));
  assert.throws(()=>setSlot(p,'Cena','protein',foods[RECIPE.semi],foods));
  assert.throws(()=>preset(p,'Desayuno','A',foods,{fillingId:RECIPE.whole}));
});
test('Fruta alternativa mantiene carbohidratos de referencia, dos raciones como máximo',()=>{
  let p=preset(blankPlan('2026-10-21'),'Desayuno','B',foods,{fruitId:'food_005'});
  const fruit=p.meals.Desayuno.find(i=>i.role==='fruit');close(portion(foods[fruit.id],fruit.amount).carbohidratos,portion(foods[RECIPE.fruit],125).carbohidratos);
  p=updateAmount(p,'Desayuno',p.meals.Desayuno.find(i=>i.role==='fruit').key,p.meals.Desayuno.find(i=>i.role==='fruit').amount*2,foods);close(fruitServings(p,foods),2);
  const before=structuredClone(p);assert.throws(()=>preset(p,'Merienda','B',foods),/dos raciones/);assert.deepEqual(p,before);
});
test('Relleno alternativo calcula proteína y computa también sus grasas y carbohidratos',()=>{
  const p=preset(blankPlan('2026-10-21'),'Desayuno','A',foods,{fillingId:meat.id});
  const filling=p.meals.Desayuno.find(i=>i.role==='filling');close(portion(meat,filling.amount).proteinas,foods[RECIPE.filling].proteinas_100g);
  const t=dayTotals(p,foods),all=sum(p.meals.Desayuno,foods);assert.deepEqual(t,all);assert.ok(t.grasas>0&&t.carbohidratos>0);
});
test('Equivalencias de carbohidratos por ficha, nunca confunden 70 g con 70 g del nutriente',()=>{
  close(carbohydrateEquivalent(foods[RECIPE.rice],foods),70);
  const potato=food(f=>f.nombre==='Patata');const grams=carbohydrateEquivalent(potato,foods);
  close(portion(potato,grams).carbohidratos,54.04);assert.notEqual(grams,70);
  let p=fullPlan();assert.equal(p.meals.Comida.find(i=>i.role==='carb').amount,70);assert.equal(p.meals.Cena.some(i=>i.role==='carb'),false);
  assert.throws(()=>setSlot(p,'Cena','carb',potato,foods));
});
test('Proteína objetivo del plato descuenta proteína de verduras y arroz al calcular carne',()=>{
  let p=fullPlan();p=setProteinGoal(p,'Comida',40,foods);
  close(sum(p.meals.Comida,foods).proteinas,40);assert.equal(p.proteinTargets.Comida,40);
  assert.throws(()=>setProteinGoal(p,'Comida',1,foods));
});
test('Reservas de desayuno y merienda cambian sin modificar las comidas principales',()=>{
  const p=fullPlan(),original=structuredClone(p.meals.Comida),initial=budget(p,foods,['Desayuno','Merienda']);
  const changed=updateAmount(p,'Merienda',p.meals.Merienda.find(i=>i.role==='chia').key,20);
  const next=budget(changed,foods,['Desayuno','Merienda']);
  assert.deepEqual(changed.meals.Comida,original);assert.ok(next.remaining.kcal<initial.remaining.kcal);
  for(const key of Object.keys(initial.remaining))close(next.remaining[key],changed.goals[key]-sum([...changed.meals.Desayuno,...changed.meals.Merienda],foods)[key]);
});
test('Propuesta es una vista previa, conserva referencias y avisa de objetivos imposibles',()=>{
  const p=fullPlan(),before=structuredClone(p),result=propose(p,foods);assert.deepEqual(p,before);
  // Comida is not touched by propose(); Cena protein can be raw meat (150–180 g) or other proteins (80–200 g).
  const comidaProtein=result.plan.meals.Comida.find(i=>i.role==='protein');assert.ok(comidaProtein.amount>=150&&comidaProtein.amount<=180);assert.equal(result.plan.meals.Comida.find(i=>i.role==='vegetable').amount,200);
  const cenaProtein=result.plan.meals.Cena.find(i=>i.role==='protein');assert.ok(cenaProtein.amount>0&&cenaProtein.amount<=200);assert.equal(result.plan.meals.Cena.find(i=>i.role==='vegetable').amount,200);
  assert.equal(result.plan.meals.Comida.find(i=>i.role==='carb').amount,70);
  const impossible=propose({...p,goals:{...p.goals,proteinas:400}},foods);assert.equal(impossible.impossible,true);assert.ok(impossible.deviations.includes('proteinas'));
  assert.throws(()=>propose(blankPlan('2026-10-21'),foods),/merienda/);
});
test('Objetivos editados, cantidades pequeñas y excesos generan avisos',()=>{
  const p=fullPlan();p.goals={kcal:100,proteinas:5,carbohidratos:5,grasas:1};
  const warnings=validatePlan(p,foods);assert.ok(warnings.some(x=>x.includes('superado')));
  p.meals.Comida.find(i=>i.role==='protein').amount=20;assert.ok(validatePlan(p,foods).some(x=>x.includes('150–180')));
});
test('Documentos persistidos incluyen recetas, objetivos, bebida y cantidades',()=>{
  let p=fullPlan();p=updateCoffee(p,{milkId:RECIPE.semi});
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(p))),p);
  assert.throws(()=>validateDocument({...p,goals:{...p.goals,kcal:NaN}}));
  assert.throws(()=>validateDocument({...p,meals:{}}));
});
test('Migración conserva los ingredientes y cantidades de la versión anterior',()=>{
  const legacy={Desayuno:[{id:'food_070',grams:50}],Comida:[{id:meat.id,grams:170}],'Media mañana':[{id:'food_002',grams:100}]};
  const p=migrateLegacy(legacy,'2026-10-21',foods);assert.equal(p.meals.Comida[0].amount,170);assert.equal(p.meals['Media mañana'].length,0);assert.equal(p.choices.Desayuno,'legacy');
});
test('Guardados remotos se serializan y reciben siempre la última revisión',async()=>{
  const calls=[];const queue=createSaveQueue(async(document,revision)=>{calls.push([document.value,revision]);await new Promise(r=>setTimeout(r,5));return{revision:revision+1};},3);
  await Promise.all([queue.enqueue({value:'first'}),queue.enqueue({value:'second'})]);assert.deepEqual(calls,[['first',3],['second',4]]);assert.equal(queue.revision,5);
});
test('Conflicto remoto bloquea sobrescrituras, fallo de red permite reintentar',async()=>{
  let calls=0;const conflictQueue=createSaveQueue(async()=>{calls++;const e=new Error('conflict');e.conflict=true;throw e;});
  await assert.rejects(conflictQueue.enqueue({}));await assert.rejects(conflictQueue.enqueue({}));assert.equal(calls,1);
  let offline=true;const q=createSaveQueue(async(_,revision)=>{if(offline)throw new Error('offline');return{revision:revision+1};});await assert.rejects(q.enqueue({}));offline=false;await q.enqueue({});assert.equal(q.revision,1);
});

test('Editar fruta cuenta fracciones de ración y evita saltarse el límite con una cantidad grande',()=>{
  let p=preset(blankPlan('2026-10-21'),'Desayuno','B',foods);
  const fruit=p.meals.Desayuno.find(i=>i.role==='fruit');
  p=updateAmount(p,'Desayuno',fruit.key,250,foods);close(fruitServings(p,foods),2);
  assert.throws(()=>updateAmount(p,'Desayuno',fruit.key,251,foods),/dos raciones/);
  assert.throws(()=>preset(p,'Merienda','B',foods),/dos raciones/);
});

test('El catálogo remoto no permite añadir IDs externos y la escritura incluye la cuenta esperada',async()=>{
  const allowed=foods.food_002;
  const client={from(){return{select(){return this;},eq(){return this;},async order(){return{data:[{payload:allowed},{payload:{...allowed,id:'food_999'}}],error:null};}};},async rpc(name,args){assert.equal(name,'save_nutrition_daily_plan');assert.equal(args.p_user_id,'user-a');return{data:{revision:2},error:null};}};
  const store=createFoodStore([],client,['food_002']);
  assert.equal((await store.group('fruta')).length,1);
  await assert.rejects(store.get('food_999'),/no autorizado/);
  assert.deepEqual(await writeCloudPlan(client,blankPlan('2026-10-21'),1,'user-a'),{revision:2});
});

test('Cena automática sin desayuno ni selección de cena, preserva todo el resto del día',()=>{
  let p=preset(blankPlan('2026-10-21'),'Merienda','A',foods);
  for(const [role,f] of [['protein',meat],['vegetable',veg],['carb',foods[RECIPE.rice]]])p=setSlot(p,'Comida',role,f,foods);
  p.choices.Desayuno=null; // Plan anterior sin desayuno elegido.
  const before=structuredClone(p),result=propose(p,foods);
  assert.deepEqual(p,before);assert.deepEqual(result.plan.meals.Comida,p.meals.Comida);
  assert.deepEqual(result.plan.meals.Merienda,p.meals.Merienda);
  assert.equal(result.plan.meals.Cena.length,2);
  const protein=result.plan.meals.Cena.find(i=>i.role==='protein');
  assert.ok(protein.amount>=150&&protein.amount<=180);
  assert.equal(result.plan.meals.Cena.find(i=>i.role==='vegetable').amount,200);
  assert.ok(!validatePlan(result.plan,foods).some(x=>x.includes('Elige desayuno')));
  const withBreakfast=preset(p,'Desayuno','coffee',foods);
  const changed=propose(withBreakfast,foods);
  assert.deepEqual(changed.plan.meals.Desayuno,withBreakfast.meals.Desayuno);
  const fixed=sum([...withBreakfast.meals.Desayuno,...p.meals.Comida,...p.meals.Merienda],foods);
  const dinner=sum(changed.plan.meals.Cena,foods);
  for(const k of Object.keys(fixed))close(changed.totals[k],fixed[k]+dinner[k]);
  const again=propose(result.plan,foods);assert.deepEqual(again.plan.meals.Cena,result.plan.meals.Cena);
});

test('Tablas provisionales: chía disponible sin duplicar fibra, frutas y variantes únicas',()=>{
  assert.equal(foods.food_118.carbohidratos_100g,7.7);
  assert.equal(foods.food_118.fibra_100g,34.4);
  close(foods.food_118.carbohidratos_100g+foods.food_118.fibra_100g,foods.food_118.carbohidratos_totales_100g);
  assert.equal(foods.food_002.carbohidratos_100g,5.7);
  assert.equal(Object.values(foods).filter(f=>f.categoria==='fruta').length,17);
  assert.equal(foods.food_132.proteinas_100g,14);
  for(const id of ['food_131','food_138','food_139','food_140','food_141','food_142','food_143','food_145']) {
    assert.equal(foods[id].verificado,false);assert.equal(foods[id].estado_verificacion,['food_131','food_145'].includes(id)?'referencia_publicada_pendiente_envase':'provisional');
    assert.equal(Object.values(foods).filter(f=>f.nombre===foods[id].nombre).length,1);
  }
  assert.equal(foods.food_143.base_peso,'peso escurrido');
});
test('Tipo de yogur conserva cantidades y fruta, recalcula los cuatro totales',()=>{
  let p=preset(blankPlan('2026-10-21'),'Merienda','B',foods);
  const original=dayTotals(p,foods);
  p=updateAmount(p,'Merienda',p.meals.Merienda.find(i=>i.role==='fruit').key,100,foods);
  const before=structuredClone(p),changed=preset(p,'Merienda','B',foods,{yogurtId:'food_145'});
  assert.equal(changed.meals.Merienda.find(i=>i.role==='yogurt').id,'food_145');
  assert.equal(changed.meals.Merienda.find(i=>i.role==='yogurt').amount,125);
  assert.deepEqual(changed.meals.Merienda.filter(i=>i.role!=='yogurt'),before.meals.Merienda.filter(i=>i.role!=='yogurt'));
  const current=dayTotals(changed,foods);assert.ok(current.kcal<original.kcal);assert.notEqual(current.proteinas,original.proteinas);assert.ok(current.grasas<original.grasas);
  assert.throws(()=>preset(p,'Merienda','B',foods,{yogurtId:'food_999'}));
});
test('Etiquetas manuales anteriores se descartan y los cálculos usan siempre el catálogo',()=>{
  let p=preset(blankPlan('2026-10-21'),'Merienda','A',foods,{fillingId:'food_138'});
  const item=p.meals.Merienda.find(i=>i.role==='filling');
  item.nutritionLabel={brand:'Marca antigua',kcal:1,proteinas:1,carbohidratos:1,grasas:1};
  const expected=sum(p.meals.Merienda.map(({nutritionLabel,...i})=>i),foods);
  assert.deepEqual(dayTotals(p,foods),expected);
  const normalized=validateDocument(p);
  assert.equal(normalized.meals.Merienda.find(i=>i.role==='filling').nutritionLabel,undefined);
  assert.equal(item.nutritionLabel.brand,'Marca antigua');
  assert.deepEqual(dayTotals(normalized,foods),expected);
});
test('Peso por unidad se conserva sin cambiar gramos comestibles; huevos y pan',()=>{
  let p=preset(blankPlan('2026-10-21'),'Merienda','A',foods,{fillingId:'food_099'});
  const egg=p.meals.Merienda.find(i=>i.role==='filling');
  p=setUnitWeight(p,'Merienda',egg.key,55,foods);
  p=updateAmount(p,'Merienda',egg.key,2*55,foods);
  assert.equal(p.meals.Merienda[1].amount,110);assert.equal(p.meals.Merienda[1].unitGrams,55);
  p=setUnitWeight(p,'Merienda',p.meals.Merienda[0].key,30,foods);
  assert.equal(p.meals.Merienda[0].amount,50);assert.equal(p.meals.Merienda[0].unitGrams,30);
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(p))),p);
  assert.throws(()=>setUnitWeight(p,'Merienda',egg.key,0,foods));
});

test('Planes anteriores eliminan media mañana sin contar sus nutrientes ni su fruta',()=>{
  const p=fullPlan();p.meals['Media mañana']=[{id:'food_002',amount:500,role:'fruit',key:'old'}];
  p.choices['Media mañana']='B';p.recipeChoices['Media mañana']={fruitId:'food_002'};
  const before=dayTotals(p,foods),normal=validateDocument(p);
  assert.deepEqual(dayTotals(normal,foods),before);
  assert.equal(normal.meals['Media mañana'].length,0);
  assert.equal(normal.choices['Media mañana'],undefined);
  assert.deepEqual(normal.meals.Comida,p.meals.Comida);
  assert.equal(p.meals['Media mañana'].length,1);
  close(fruitServings(normal,foods),fruitServings(p,foods));
  assert.deepEqual(propose(normal,foods).totals,propose(p,foods).totals);
});

test('La cena automática excluye quesos, huevos, legumbres y suplementos sin ración confirmada',()=>{
  const p=fullPlan();p.goals={kcal:900,proteinas:180,carbohidratos:70,grasas:5};
  const result=propose(p,foods),protein=result.plan.meals.Cena.find(i=>i.role==='protein');
  assert.ok(['carne','pescado_marisco'].includes(foods[protein.id].categoria));
  assert.equal(foods[protein.id].estado_referencia,'crudo');assert.ok(protein.amount>=150&&protein.amount<=180);
  assert.equal(result.plan.meals.Cena.length,2);
  assert.equal(result.plan.meals.Cena.find(i=>i.role==='vegetable').amount,200);
  assert.deepEqual(result.plan.meals.Comida,p.meals.Comida);
});
test('Reserva anticipada con merienda antes de completar comida; no guarda cena ni altera cantidades',()=>{
  const p=preset(blankPlan('2026-10-21'),'Merienda','A',foods),before=structuredClone(p);
  const result=propose(p,foods,{allowIncomplete:true});
  assert.equal(result.complete,false);assert.equal(result.ready,false);assert.deepEqual(p,before);
  assert.ok(result.issues.some(x=>x.includes('falta proteína')));
  const totals=dayTotals(p,foods);
  for(const reserve of result.reservation){close(reserve.remaining,p.goals[reserve.key]-totals[reserve.key]);assert.ok(reserve.max>=reserve.min);}
  const tight=propose({...p,goals:{kcal:1,proteinas:1,carbohidratos:1,grasas:1}},foods,{allowIncomplete:true});
  assert.ok(tight.reservation.some(r=>r.shortfall>0));
});
test('Pautas fuera de referencia impiden guardar la propuesta y ofrecen corrección explícita',()=>{
  let p=fullPlan();p=updateAmount(p,'Comida',p.meals.Comida.find(i=>i.role==='protein').key,20,foods);
  p=updateAmount(p,'Comida',p.meals.Comida.find(i=>i.role==='carb').key,200,foods);
  const before=structuredClone(p),result=propose(p,foods);
  assert.equal(result.ready,false);assert.ok(result.issues.some(x=>x.includes('150–180')));
  const adjustment=result.adjustments.find(a=>a.id==='restore-lunch');assert.ok(adjustment);
  assert.deepEqual(p,before);assert.equal(adjustment.changes.length,2);
  const accepted=applyPlanningAdjustment(p,adjustment);
  assert.deepEqual(accepted.meals.Cena,p.meals.Cena);assert.deepEqual(accepted.meals.Merienda,p.meals.Merienda);
  assert.equal(accepted.meals.Comida.find(i=>i.role==='protein').amount,150);
  close(accepted.meals.Comida.find(i=>i.role==='carb').amount,70);
  assert.equal(propose(accepted,foods).ready,true);
  assert.throws(()=>applyPlanningAdjustment({...p,updatedAt:'changed'},adjustment),/plan cambió/);
});
test('Otros alimentos proteicos necesitan gramos manuales; no se asignan 100 g por defecto',()=>{
  const p=setSlot(blankPlan('2026-10-21'),'Comida','protein',foods.food_099,foods);
  assert.equal(p.meals.Comida[0].amount,0);
  assert.ok(validatePlan(p,foods).some(x=>x.includes('no tiene ración de referencia confirmada')));
  assert.ok(planningIssues(p,foods).some(x=>x.includes('falta proteína')));
});
test('Déficits y excesos son numéricos y el ajuste no se oculta aunque sea imposible',()=>{
  const p=fullPlan();p.goals={kcal:100,proteinas:400,carbohidratos:5,grasas:1};
  const result=propose(p,foods);
  assert.equal(result.impossible,true);
  assert.ok(result.differences.some(d=>d.key==='proteinas'&&d.direction==='deficit'&&d.amount>0));
  assert.ok(result.differences.some(d=>d.key==='kcal'&&d.direction==='excess'&&d.amount>0));
  assert.equal(result.ready,true); // Macro shortfalls never force invalid dinner portions or prevent saving a valid meal.
});
test('La fruta conserva su límite de seguridad pero señala que la equivalencia está pendiente',()=>{
  const p=preset(blankPlan('2026-10-21'),'Merienda','B',foods);
  close(fruitServings(p,foods),1);assert.match(FRUIT_REFERENCE_NOTICE,/provisional/);
});
test('Si existe una cena dentro de todas las tolerancias se elige una de ellas',()=>{
  const p=fullPlan();p.goals=dayTotals(p,foods);
  const result=propose(p,foods);assert.equal(result.impossible,false);assert.deepEqual(result.differences,[]);
});

test('Una alternativa de yogur mejora el ajuste solo tras aceptarla y no guarda su cena prevista',()=>{
  const p=fullPlan(),alternate=preset(p,'Merienda','B',foods,{yogurtId:'food_145'});
  p.goals=dayTotals(alternate,foods);
  const before=structuredClone(p),result=propose(p,foods);
  const adjustment=result.adjustments.find(a=>a.id==='yogurt-Merienda');assert.ok(adjustment);
  assert.deepEqual(p,before);assert.equal(p.meals.Merienda.find(i=>i.role==='yogurt').id,'food_131');
  const accepted=applyPlanningAdjustment(p,adjustment);
  assert.equal(accepted.meals.Merienda.find(i=>i.role==='yogurt').id,'food_145');
  assert.equal(accepted.meals.Merienda.find(i=>i.role==='yogurt').amount,125);
  assert.deepEqual(accepted.meals.Cena,p.meals.Cena);assert.deepEqual(accepted.meals.Comida,p.meals.Comida);
  assert.deepEqual(propose(accepted,foods).differences,[]);
});

test('Volver a elegir la misma fuente conserva sus gramos y usa la ficha del catálogo',()=>{
  let p=fullPlan();const item=p.meals.Comida.find(i=>i.role==='protein');
  p=updateAmount(p,'Comida',item.key,172,foods);
  const next=setSlot(p,'Comida','protein',foods[item.id],foods);
  assert.deepEqual(next.meals.Comida.find(i=>i.role==='protein'),p.meals.Comida.find(i=>i.role==='protein'));
});

test('Borrar una comida elimina ingredientes y configuración solo de esa comida; deshacer conserva el resto',()=>{
  const p=fullPlan();p.proteinTargets.Comida=40;
  for(const meal of ['Desayuno','Comida','Merienda','Cena']){
    const cleared=clearMeal(p,meal);assert.deepEqual(cleared.meals[meal],[]);
    assert.equal(cleared.proteinTargets[meal],undefined);
    assert.equal(cleared.recipeChoices[meal],undefined);
    for(const other of ['Desayuno','Comida','Merienda','Cena'].filter(m=>m!==meal))assert.deepEqual(cleared.meals[other],p.meals[other]);
    const restored=restoreMeal(cleared,p,meal);assert.deepEqual(restored.meals[meal],p.meals[meal]);
    const edited={...cleared,goals:{...cleared.goals,kcal:1600}};
    assert.equal(restoreMeal(edited,p,meal).goals.kcal,1600);
  }
  assert.equal(clearMeal(p,'Desayuno').choices.Desayuno,'none');
  assert.equal(clearMeal(p,'Merienda').choices.Merienda,null);
  assert.throws(()=>restoreMeal({...p,date:'2026-10-22'},p,'Cena'));
});
test('Cena manual sin objetivo usa toda la proteína restante y los otros ingredientes, máximo 180 g de producto',()=>{
  let p=fullPlan();p.meals.Cena=[];
  const other=dayTotals(p,foods).proteinas;
  p.goals.proteinas=other+portion(veg,200).proteinas+portion(meat,170).proteinas;
  p=setSlot(p,'Cena','vegetable',veg,foods);
  p=setSlot(p,'Cena','protein',meat,foods);
  close(p.meals.Cena.find(i=>i.role==='protein').amount,170);
  close(dayTotals(p,foods).proteinas,p.goals.proteinas);
  const changed=updateAmount(p,'Desayuno',p.meals.Desayuno.find(i=>i.role==='bread').key,60,foods);
  const recomputed=calculateDinnerRemainder(changed,foods);
  assert.ok(recomputed.meals.Cena.find(i=>i.role==='protein').amount<170);
  close(dayTotals(recomputed,foods).proteinas,p.goals.proteinas);
  const large={...p,goals:{...p.goals,proteinas:400}};
  const capped=calculateDinnerRemainder(large,foods);
  assert.equal(capped.meals.Cena.find(i=>i.role==='protein').amount,180);
  assert.ok(dayTotals(capped,foods).proteinas<capped.goals.proteinas);
});
test('La cena manual se recalcula si cambia el resto del día, pero conserva gramos y objetivos explícitos',()=>{
  let p=fullPlan();p.meals.Cena=[];p=setSlot(p,'Cena','protein',meat,foods);p=setSlot(p,'Cena','vegetable',veg,foods);
  const dinnerP=sum(p.meals.Cena,foods).proteinas;
  p=setProteinGoal(p,'Cena',dinnerP-1,foods);
  assert.deepEqual(calculateDinnerRemainder(p,foods),p);
  p=useRemainingDinnerProtein(p,foods);assert.equal(p.proteinTargets.Cena,undefined);
  const protein=p.meals.Cena.find(i=>i.role==='protein');p=updateAmount(p,'Cena',protein.key,166,foods);
  assert.equal(p.preferences.dinnerProteinMode,'amount');
  assert.deepEqual(calculateDinnerRemainder(p,foods),p);
  const differentVeg=Object.values(foods).find(f=>f.categoria==='verdura'&&f.id!==veg.id);
  const changedVeg=setSlot(p,'Cena','vegetable',differentVeg,foods);
  assert.equal(changedVeg.meals.Cena.find(i=>i.role==='protein').amount,166);
  p=useRemainingDinnerProtein(p,foods);assert.equal(p.preferences.dinnerProteinMode,'remaining');
  assert.ok(p.meals.Cena.find(i=>i.role==='protein').amount<=180);
});
test('Tope de 180 g se aplica también a otras proteínas elegidas manualmente, sin inventar raciones',()=>{
  let p=fullPlan();p.goals.proteinas=400;p.meals.Cena=[];
  p=setSlot(p,'Cena','protein',foods.food_099,foods);
  assert.equal(p.meals.Cena.find(i=>i.role==='protein').amount,180);
  assert.ok(validatePlan(p,foods).some(x=>x.includes('no tiene ración de referencia confirmada')));
});

test('Un yogur por toma: 125 g de griego o natural Hacendado, con macros propios',()=>{
  for(const meal of ['Desayuno','Merienda'])for(const yogurtId of ['food_131','food_145']){
    const p=preset(blankPlan('2026-10-22'),meal,'B',foods,{yogurtId});
    const yogurt=p.meals[meal].find(i=>i.role==='yogurt');assert.equal(yogurt.amount,125);
    const n=portion(foods[yogurtId],125),all=sum(p.meals[meal].filter(i=>i.role!=='yogurt'),foods);
    for(const k of Object.keys(n))close(dayTotals(p,foods)[k],n[k]+all[k]);
    assert.throws(()=>updateAmount(p,meal,yogurt.key,250,foods),/solo yogur/);
  }
  assert.equal(foods.food_145.kcal_100g,62);assert.equal(foods.food_131.kcal_100g,129);
});
test('Planes anteriores pasan de yogur 0 % a natural y de 170 g a un envase sin duplicados',()=>{
  const p=preset(blankPlan('2026-10-22'),'Merienda','B',foods);
  const yogurt=p.meals.Merienda.find(i=>i.role==='yogurt');yogurt.id='food_144';yogurt.amount=170;
  p.meals.Merienda.push({...yogurt,key:'duplicated'});
  const next=validateDocument(p),items=next.meals.Merienda.filter(i=>i.role==='yogurt');
  assert.equal(items.length,1);assert.equal(items[0].id,'food_145');assert.equal(items[0].amount,125);
  assert.equal(p.meals.Merienda[0].amount,170);
});
