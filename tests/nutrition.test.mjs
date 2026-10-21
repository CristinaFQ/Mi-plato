import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nutrients,total,canAdd,readDay,foodUnit,per100,mealGuidelines,defaultPortion,amountForProtein,remainingBudget} from '../dist/nutrition.js';
const {alimentos:foods,pendientes_autorizacion:pending,configuracion:config}=JSON.parse(readFileSync(new URL('../data/catalogo.json',import.meta.url)));
const meals=()=>Object.fromEntries(['Desayuno','Media mañana','Comida','Merienda','Cena'].map(m=>[m,[]]));
test('Catálogo autorizado: 145 alimentos, 17 frutas y sin altas pendientes',()=>{assert.equal(foods.length,145);assert.equal(foods.filter(f=>f.categoria==='fruta').length,17);assert.equal(new Set(foods.map(f=>f.id)).size,145);for(const p of pending)assert.ok(!foods.some(f=>f.nombre===p.nombre));assert.ok(foods.every(f=>f.verificado===false));});
test('Escala todos los nutrientes y suma cantidades actualizadas',()=>{const f=foods[0];assert.equal(nutrients(f,150).kcal,78);assert.equal(nutrients(f,50).kcal,26);assert.equal(total([{id:f.id,grams:150},{id:foods[1].id,grams:200}],foods).kcal,142);assert.throws(()=>nutrients(f,-1));assert.throws(()=>nutrients(f,NaN));});
test('Bloquea fruta adicional, pero permite dos y otros grupos',()=>{const m=meals();assert.equal(canAdd(m,'Comida',foods[0],foods),'');m.Desayuno.push({id:foods[0].id,grams:100},{id:foods[1].id,grams:100});assert.match(canAdd(m,'Merienda',foods[2],foods),/dos raciones/);assert.equal(canAdd(m,'Merienda',foods.find(f=>f.categoria==='lacteos'),foods),'');});
test('Impide ausentes y carbohidratos como guarnición de cena',()=>{assert.equal(canAdd(meals(),'Comida',{id:'olive-oil'},foods),'No incluido en la lista de tu nutricionista');const f=foods.find(f=>f.categoria==='carbohidrato');assert.match(canAdd(meals(),'Cena',f,foods),/cena/);assert.equal(canAdd(meals(),'Comida',f,foods),'');});
test('Al recuperar datos elimina alimentos ajenos, cantidades inválidas y tercera fruta',()=>{const m=meals();m.Desayuno=[{id:foods[0].id,key:'a',grams:100},{id:'x',key:'b',grams:100},{id:foods[1].id,key:'c',grams:-1}];m.Comida=[{id:foods[1].id,key:'d',grams:100},{id:foods[2].id,key:'e',grams:100}];m.Cena=[{id:foods.find(f=>f.categoria==='carbohidrato').id,key:'f',grams:100}];const restored=readDay(m,foods,Object.keys(m));assert.equal(restored.Desayuno.length,1);assert.equal(restored.Comida.length,1);assert.equal(restored.Cena.length,0);});

test('La leche autorizada usa ml y sus seis nutrientes por 100 ml',()=>{
  const milk=foods.find(f=>f.id==='food_135');
  assert.equal(foodUnit(milk),'ml');
  assert.equal(per100(milk,'kcal'),47);
  assert.equal(milk.kcal_100g,undefined);
  assert.deepEqual(milk.ruta_categorias,['Proteínas','Lácteos','Leche']);
  assert.deepEqual(nutrients(milk,250),{kcal:117.5,proteinas:8,carbohidratos:12,grasas:4,azucares:12,fibra:0});
  assert.equal(nutrients(milk,100).kcal,47);
});
test('Suma sólidos y leche sin convertir ml a gramos ni añadir café automático',()=>{
  const milk=foods.find(f=>f.id==='food_135');
  assert.equal(total([],foods).kcal,0);
  assert.equal(total([{id:milk.id,grams:250},{id:foods[0].id,grams:100}],foods).kcal,169.5);
  const day=meals();day.Desayuno=[{id:milk.id,key:'milk-1',grams:250}];
  assert.equal(readDay(day,foods,Object.keys(day)).Desayuno[0].grams,250);
});

test('Las pautas usan la verdura configurada y detectan la falta de proteína',()=>{
  const day=meals(),veg=foods.find(f=>f.categoria==='verdura');
  day.Comida=[{id:veg.id,key:'veg',grams:150}];
  assert.ok(mealGuidelines(day,'Comida',foods,config).some(s=>s.includes('150 de 200')));
  assert.ok(mealGuidelines(day,'Comida',foods,{...config,verdura_comida_g:250}).some(s=>s.includes('150 de 250')));
  assert.ok(mealGuidelines(day,'Comida',foods,config).some(s=>s.includes('proteína')));
});
test('Referencia de carne y pescado en crudo sin confundir gramos con nutrientes',()=>{
  const day=meals(),veg=foods.find(f=>f.categoria==='verdura'),meat=foods.find(f=>f.categoria==='carne'&&f.estado_referencia==='crudo');
  day.Cena=[{id:veg.id,key:'veg',grams:200},{id:meat.id,key:'meat',grams:160}];
  assert.deepEqual(mealGuidelines(day,'Cena',foods,config),[]);
  day.Cena[1].grams=100;
  assert.ok(mealGuidelines(day,'Cena',foods,config).some(s=>s.includes('150–180')));
});
test('La merienda obligatoria permanece aunque se oculte el contador de fruta',()=>{
  const day=meals();
  assert.ok(mealGuidelines(day,'Merienda',foods,config).some(s=>s.includes('merienda')));
  assert.deepEqual(mealGuidelines(day,'Media mañana',foods,config),[]);
});

test('La guarnición son 70 g de alimento, sin forzar 70 g del macronutriente',()=>{
  const day=meals(),carb=foods.find(f=>f.nombre==='Arroz integral seco');
  assert.equal(defaultPortion(carb,'Comida',day,foods,config),70);
  assert.equal(nutrients(carb,70).carbohidratos,carb.carbohidratos_100g*0.7);
  assert.notEqual(nutrients(carb,70).carbohidratos,70);
  day.Comida=[{id:carb.id,key:'rice',grams:30}];
  assert.equal(defaultPortion(carb,'Comida',day,foods,config),40);
  assert.ok(mealGuidelines(day,'Comida',foods,config).some(s=>s.includes('30 g de alimento')));
  day.Comida.push({id:carb.id,key:'rice2',grams:40});
  assert.ok(!mealGuidelines(day,'Comida',foods,config).some(s=>s.includes('Guarnición')));
  assert.equal(defaultPortion(carb,'Desayuno',day,foods,config),100);
});

test('Calcula la cantidad de alimento a partir de la proteína solicitada',()=>{
  const food={proteinas_100g:20,kcal_100g:120,carbohidratos_100g:0,grasas_100g:4};
  const portion=amountForProtein(food,30);
  assert.equal(portion.amount,150);assert.equal(portion.unit,'g');
  assert.equal(portion.nutrients.proteinas,30);assert.equal(portion.nutrients.kcal,180);
  assert.equal(portion.nutrients.grasas,6);
  assert.throws(()=>amountForProtein({...food,proteinas_100g:0},30));
  assert.throws(()=>amountForProtein(food,0));assert.throws(()=>amountForProtein(food,NaN));
});
test('El cálculo inverso respeta ml y el presupuesto cuenta todos los macros del alimento',()=>{
  const milk=foods.find(f=>f.id==='food_135'),portion=amountForProtein(milk,8);
  assert.equal(portion.amount,250);assert.equal(portion.unit,'ml');
  const day={Desayuno:[{id:milk.id,key:'milk',grams:portion.amount}],Comida:[],Merienda:[],Cena:[]};
  const budget=remainingBudget(day,foods,config,{kcal:500,proteinas:40,carbohidratos:50,grasas:15});
  assert.equal(budget.remaining.kcal,config.energia_kcal-117.5-500);
  assert.equal(budget.remaining.proteinas,config.proteina_g-8-40);
  assert.equal(budget.remaining.carbohidratos,config.carbohidratos_g-12-50);
  assert.equal(budget.remaining.grasas,config.grasa_g-4-15);
});
test('El presupuesto señala los excesos y no los disimula con un cero',()=>{
  const result=remainingBudget({},foods,config,{kcal:config.energia_kcal+10});
  assert.equal(result.remaining.kcal,-10);assert.equal(result.exceeded.kcal,10);
  assert.throws(()=>remainingBudget({},foods,config,{kcal:-1}));
});
test('El plan sin media mañana conserva las otras comidas sin contar esa toma',()=>{
  const legacy=meals();legacy['Media mañana']=[{id:foods[0].id,key:'old',grams:100}];
  legacy.Comida=[{id:foods[1].id,key:'lunch',grams:100}];
  const day=readDay(legacy,foods,['Desayuno','Comida','Merienda','Cena']);
  assert.equal(day['Media mañana'],undefined);assert.equal(day.Comida.length,1);
  assert.equal(total(Object.values(day).flat(),foods).kcal,foods[1].kcal_100g);
});
