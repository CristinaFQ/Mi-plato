export const MACROS = ['kcal', 'proteinas', 'carbohidratos', 'grasas'];
export const MEALS = ['Desayuno', 'Comida', 'Merienda', 'Cena'];
export const BREAD_FILLINGS = ['food_138', 'food_139', 'food_132', 'food_140', 'food_141', 'food_142', 'food_099', 'food_143'];
export const YOGURTS = ['food_131', 'food_145'];
export const YOGURT_GRAMS = 125;
export const SMALL_MEALS = ['Desayuno', 'Merienda'];
export const MACRO_TOLERANCE = { kcal: 50, proteinas: 5, carbohidratos: 5, grasas: 3 };
export const FRUIT_REFERENCE_NOTICE = 'Fruta: la equivalencia con 125 g de fresas es provisional; falta confirmar la ración de tu nutricionista. El límite de dos se aplica con esta referencia.';
export const DEFAULT_GOALS = { kcal: 1500, proteinas: 120, carbohidratos: 142.5, grasas: 50 };
export const RECIPE = { bread: 'food_070', filling: 'food_132', yogurt: 'food_131', chia: 'food_118', fruit: 'food_002', rice: 'food_063', whole: 'food_136', semi: 'food_135', coffee: 'food_137' };
export const unit = food => food.unidad_racion === 'ml' ? 'ml' : 'g';
export const value100 = (food, key) => food[`${key}_100${unit(food)}`];
export const isRawMeat = food => ['carne', 'pescado_marisco'].includes(food.categoria) && food.estado_referencia === 'crudo';
export const isBreakfastOnly = food => food.id === RECIPE.coffee || /leche/i.test(food.nombre);
export const zero = () => Object.fromEntries(MACROS.map(k => [k, 0]));
export function foodFor(foods, id) { const food = foods[id]; if (!food) throw new Error(`Falta la ficha del alimento ${id}.`); return food; }
export function portion(food, amount) {
  if (!Number.isFinite(amount) || amount < 0 || amount > 10000) throw new Error('La cantidad debe estar entre 0 y 10.000.');
  return Object.fromEntries(MACROS.map(key => {
    const value = value100(food, key);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Ficha incompleta: ${food.nombre}.`);
    return [key, value * amount / 100];
  }));
}
// Nutrition always comes from the curated catalogue, including published brand references.
export function ingredientFood(item, foods) { return foodFor(foods, item.id); }
export function clearMeal(plan, meal) {
  if (!MEALS.includes(meal)) throw new Error('Comida no válida.');
  const next=structuredClone(plan); next.meals[meal]=[];
  if(SMALL_MEALS.includes(meal))next.choices[meal]=meal==='Desayuno'?'none':null;
  delete next.recipeChoices[meal];delete next.proteinTargets[meal];if(meal==='Cena')delete next.preferences.dinnerProteinMode;return next;
}
export function restoreMeal(plan, previous, meal) {
  if(plan.date!==previous.date||!MEALS.includes(meal))throw new Error('El día cambió. No se puede deshacer este borrado.');
  const next=structuredClone(plan); next.meals[meal]=structuredClone(previous.meals[meal]);
  for(const field of ['choices','recipeChoices','proteinTargets']){
    if(Object.hasOwn(previous[field],meal))next[field][meal]=structuredClone(previous[field][meal]);else delete next[field][meal];
  }
  if(meal==='Cena'){if(previous.preferences.dinnerProteinMode)next.preferences.dinnerProteinMode=previous.preferences.dinnerProteinMode;else delete next.preferences.dinnerProteinMode;}
  return next;
}
export function setUnitWeight(plan, meal, key, grams, foods) {
  if (!Number.isFinite(grams) || grams <= 0 || grams > 1000) throw new Error('Indica un peso comestible por unidad entre 0 y 1.000 g.');
  const next = structuredClone(plan), item = next.meals[meal].find(i => i.key === key);
  if (!item || !foodFor(foods, item.id).gramos_unidad_inicial) throw new Error('Este alimento se introduce en gramos.');
  item.unitGrams = grams; return next;
}
export function sum(items, foods) { return items.reduce((t, item) => { const n = portion(ingredientFood(item, foods), item.amount); MACROS.forEach(k => t[k] += n[k]); return t; }, zero()); }
export function dayTotals(plan, foods) { return sum(MEALS.flatMap(m => plan.meals[m] || []), foods); }
export function fruitServings(plan, foods) {
  const reference = value100(foodFor(foods, RECIPE.fruit), 'carbohidratos') * 1.25;
  return MEALS.flatMap(m => plan.meals[m] || []).filter(item => item.amount > 0 && foodFor(foods, item.id).categoria === 'fruta').reduce((servings, item) => servings + portion(foodFor(foods, item.id), item.amount).carbohidratos / reference, 0);
}
export function blankPlan(date) {
  return { version: 3, date, goals: { ...DEFAULT_GOALS }, meals: { ...Object.fromEntries(MEALS.map(m => [m, []])), 'Media mañana': [] }, choices: { Desayuno: 'none', Merienda: null }, preferences: { milkId: RECIPE.whole, milkMl: 150, coffeeMl: 50 }, recipeChoices: {}, proteinTargets: {}, updatedAt: null };
}
export function entry(id, amount, role) { return { id, amount, role, key: `${role}-${id}` }; }
export function assertFruitLimit(plan, foods) { if (fruitServings(plan, foods) > 2 + 1e-6) throw new Error('Máximo dos raciones de fruta al día. Elige la opción de pan en alguna toma.'); }
export function proteinAmount(food, protein) {
  const p = value100(food, 'proteinas');
  if (!Number.isFinite(protein) || protein <= 0 || !Number.isFinite(p) || p <= 0) throw new Error('Indica un objetivo de proteína positivo y un alimento con proteína.');
  const amount = protein * 100 / p;
  if (amount > 10000) throw new Error('La cantidad calculada es excesiva. Selecciona otra fuente proteica.');
  return amount;
}
export function carbohydrateEquivalent(food, foods) {
  const c = value100(food, 'carbohidratos');
  if (!Number.isFinite(c) || c <= 0) throw new Error('Esta ficha no permite calcular una equivalencia de carbohidratos.');
  const riceC = value100(foodFor(foods, RECIPE.rice), 'carbohidratos') * .7;
  return riceC * 100 / c;
}
export function coffeeItems(preferences) {
  if (![RECIPE.whole, RECIPE.semi].includes(preferences.milkId)) throw new Error('Selecciona leche entera o semidesnatada.');
  return [entry(preferences.milkId, preferences.milkMl, 'milk'), entry(RECIPE.coffee, preferences.coffeeMl, 'coffee')];
}
export function preset(plan, meal, choice, foods, options = {}) {
  if (!SMALL_MEALS.includes(meal)) throw new Error('Esta opción no corresponde a una comida principal.');
  if (!['A', 'B', 'none', 'coffee'].includes(choice) || (choice === 'coffee' && meal !== 'Desayuno') || (choice === 'none' && meal === 'Merienda')) throw new Error('Elige una de las dos opciones de comida.');
  const next = structuredClone(plan), previous = plan.recipeChoices[meal] || {};
  const fillingId = options.fillingId || previous.fillingId || RECIPE.filling;
  const fruitId = options.fruitId || previous.fruitId || RECIPE.fruit;
  const yogurtId = options.yogurtId || previous.yogurtId || RECIPE.yogurt;
  if (!YOGURTS.includes(yogurtId)) throw new Error('Elige un yogur griego autorizado.');
  let items = [];
  if (choice === 'A') {
    const filling = foodFor(foods, fillingId);
    if (isBreakfastOnly(filling) || !['carne', 'pescado_marisco', 'huevos', 'legumbres_derivados', 'lacteos'].includes(filling.categoria)) throw new Error('Elige un relleno autorizado de la lista.');
    const protein = value100(foodFor(foods, RECIPE.filling), 'proteinas');
    items = [entry(RECIPE.bread, 50, 'bread'), entry(fillingId, proteinAmount(filling, protein), 'filling')];
  }
  if (choice === 'B') {
    const fruit = foodFor(foods, fruitId);
    if (fruit.categoria !== 'fruta') throw new Error('Elige una fruta autorizada.');
    const carbs = value100(foodFor(foods, RECIPE.fruit), 'carbohidratos') * 1.25;
    const amount = carbs * 100 / value100(fruit, 'carbohidratos');
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) throw new Error('No se puede calcular la ración de esta fruta.');
    items = [entry(yogurtId, YOGURT_GRAMS, 'yogurt'), entry(RECIPE.chia, 10, 'chia'), entry(fruitId, amount, 'fruit')];
  }
  const includeCoffee = meal === 'Desayuno' && (choice === 'coffee' || (['A', 'B'].includes(choice) && (options.coffee ?? previous.coffee ?? false)));
  if (plan.choices[meal] === choice) {
    items = items.map(item => { const previousItem = plan.meals[meal].find(old => old.role === item.role && old.id === item.id); return previousItem ? { ...previousItem, ...item, amount: item.role === 'yogurt' ? YOGURT_GRAMS : previousItem.amount } : item; });
  }
  if (includeCoffee) items.push(...coffeeItems(next.preferences));
  next.meals[meal] = items; next.choices[meal] = choice;
  next.recipeChoices[meal] = { fillingId, fruitId, yogurtId, coffee: includeCoffee };
  assertFruitLimit(next, foods); return next;
}
export function updateCoffee(plan, preferences) {
  const next = structuredClone(plan); next.preferences = { ...next.preferences, ...preferences };
  for (const key of ['milkMl', 'coffeeMl']) if (!Number.isFinite(next.preferences[key]) || next.preferences[key] < 0 || next.preferences[key] > 1000) throw new Error('Cantidad de bebida no válida.');
  const included = next.meals.Desayuno.some(i => i.role === 'coffee' || i.role === 'milk');
  if (included) next.meals.Desayuno = [...next.meals.Desayuno.filter(i => !['coffee', 'milk'].includes(i.role)), ...coffeeItems(next.preferences)];
  return next;
}
export function updateAmount(plan, meal, key, amount, foods) {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) throw new Error('Introduce una cantidad entre 0 y 10.000.');
  const next = structuredClone(plan), item = next.meals[meal].find(i => i.key === key);
  if (!item) throw new Error('No se encuentra el ingrediente.');
  if (SMALL_MEALS.includes(meal) && item.role === 'yogurt' && amount !== YOGURT_GRAMS) throw new Error('Cada desayuno o merienda lleva un solo yogur de 125 g.');
  item.amount = amount;
  if (meal === 'Cena' && item.role === 'protein') { next.preferences.dinnerProteinMode = 'amount'; delete next.proteinTargets.Cena; }
  if (item.role === 'milk') next.preferences.milkMl = amount;
  if (item.role === 'coffee') next.preferences.coffeeMl = amount;
  if (foods) assertFruitLimit(next, foods);
  return next;
}
export function setSlot(plan, meal, role, food, foods) {
  if (!['Comida', 'Cena'].includes(meal) || !['protein', 'vegetable', 'carb'].includes(role)) throw new Error('Selección no válida.');
  if (isBreakfastOnly(food)) throw new Error('El café y la leche solo se incluyen en el desayuno.');
  if (role === 'carb' && meal === 'Cena') throw new Error('La cena no lleva guarnición de cereales ni tubérculos.');
  if ((role === 'vegetable' && food.categoria !== 'verdura') || (role === 'carb' && food.categoria !== 'carbohidrato') || (role === 'protein' && !['proteina', 'lacteos'].includes(food.grupo))) throw new Error('El alimento no corresponde al grupo elegido.');
  const next = structuredClone(plan), previous = next.meals[meal].find(i => i.role === role);
  const amount = role === 'vegetable' ? 200 : role === 'carb' ? carbohydrateEquivalent(food, foods) : isRawMeat(food) ? 165 : 0;
  next.meals[meal] = [...next.meals[meal].filter(i => i.role !== role), previous?.id === food.id ? { ...previous } : entry(food.id, amount, role)];
  if (meal === 'Cena' && previous?.id !== food.id) {
    if(role !== 'protein' && next.preferences.dinnerProteinMode === 'amount') return next;
    next.preferences.dinnerProteinMode = Number.isFinite(next.proteinTargets.Cena) ? 'target' : 'remaining';
    if (Number.isFinite(next.proteinTargets.Cena)) return setProteinGoal(next, 'Cena', next.proteinTargets.Cena, foods);
    return calculateDinnerRemainder(next, foods);
  }
  return next;
}
export function setProteinGoal(plan, meal, protein, foods) {
  const next = structuredClone(plan), source = next.meals[meal].find(i => i.role === 'protein');
  if (!source) throw new Error('Elige primero la fuente de proteína.');
  // The target is for the whole plate: include protein from vegetables/carbohydrates too.
  const others = sum(next.meals[meal].filter(i => i.key !== source.key), foods).proteinas;
  if (protein <= others) throw new Error('El resto del plato ya aporta esa proteína. Aumenta el objetivo o ajusta sus ingredientes.');
  source.amount = proteinAmount(ingredientFood(source, foods), protein - others);
  next.proteinTargets = { ...next.proteinTargets, [meal]: protein };
  if (meal === 'Cena') next.preferences.dinnerProteinMode = 'target';
  return next;
}
export function calculateDinnerRemainder(plan, foods) {
  const source=plan.meals.Cena.find(i=>i.role==='protein');
  if(!source)return plan;
  if(Number.isFinite(plan.proteinTargets.Cena)||plan.preferences.dinnerProteinMode==='amount')return plan;
  const others=sum([...MEALS.filter(m=>m!=='Cena').flatMap(m=>plan.meals[m]),...plan.meals.Cena.filter(i=>i.key!==source.key)],foods).proteinas;
  const food=ingredientFood(source,foods),missing=Math.max(0,plan.goals.proteinas-others),per100=value100(food,'proteinas');
  if(!Number.isFinite(per100)||per100<=0)throw new Error('Este alimento no permite calcular la proteína restante.');
  const mathematical=missing*100/per100;
  const amount=isRawMeat(food)?Math.max(150,Math.min(180,mathematical)):Math.min(180,mathematical);
  if(Math.abs(source.amount-amount)<1e-8&&plan.preferences.dinnerProteinMode==='remaining')return plan;
  const next=structuredClone(plan);next.meals.Cena.find(i=>i.key===source.key).amount=amount;next.preferences.dinnerProteinMode='remaining';return next;
}
export function useRemainingDinnerProtein(plan,foods){
  const next=structuredClone(plan);delete next.proteinTargets.Cena;next.preferences.dinnerProteinMode='remaining';return calculateDinnerRemainder(next,foods);
}
export function budget(plan, foods, mealNames = MEALS) {
  const used = sum(mealNames.flatMap(m => plan.meals[m] || []), foods);
  return { used, remaining: Object.fromEntries(MACROS.map(k => [k, plan.goals[k] - used[k]])) };
}
export function validatePlan(plan, foods) {
  const messages = [], totals = dayTotals(plan, foods);
  const names = { kcal: 'energía', proteinas: 'proteínas', carbohidratos: 'carbohidratos', grasas: 'grasas' };
  if (!plan.choices.Merienda || !plan.meals.Merienda.length) messages.push('Falta la merienda obligatoria.');

  if (fruitServings(plan, foods) > 2 + 1e-6) messages.push('Has superado el máximo de dos raciones de fruta.');
  for (const key of MACROS) {
    if (totals[key] > plan.goals[key] + .05) messages.push(`Objetivo de ${names[key]} superado en ${(totals[key] - plan.goals[key]).toFixed(1)} ${key === 'kcal' ? 'kcal' : 'g'}.`);
  }
  const complete = !!plan.choices.Merienda && ['Comida', 'Cena'].every(m => plan.meals[m].some(i => i.role === 'protein') && plan.meals[m].some(i => i.role === 'vegetable'));
  if (complete) for (const key of MACROS) {
    const tolerance = key === 'kcal' ? 50 : key === 'grasas' ? 3 : 5;
    if (plan.goals[key] - totals[key] > tolerance) messages.push(`Quedan por cubrir ${(plan.goals[key] - totals[key]).toFixed(1)} ${key === 'kcal' ? 'kcal' : 'g'} de ${names[key]}.`);
  }
  for (const meal of ['Comida', 'Cena']) {
    const items = plan.meals[meal];
    if (Number.isFinite(plan.proteinTargets?.[meal]) && Math.abs(sum(items, foods).proteinas - plan.proteinTargets[meal]) > .5) messages.push(`${meal}: la proteína del plato cambió; vuelve a calcular la ración si quieres mantener tu objetivo de ${plan.proteinTargets[meal]} g.`);
    if (!items.length) continue;
    if (!items.some(i => i.role === 'protein')) messages.push(`${meal}: falta seleccionar la fuente proteica.`);
    const vegetable = items.filter(i => foodFor(foods, i.id).categoria === 'verdura').reduce((a, i) => a + i.amount, 0);
    if (Math.abs(vegetable - 200) > .1) messages.push(`${meal}: verduras ${vegetable.toFixed(1)} g; referencia 200 g.`);
    for (const item of items) {
      const food = foodFor(foods, item.id);
      if (isRawMeat(food) && (item.amount < 150 || item.amount > 180)) messages.push(`${meal}: ${food.nombre}, ${item.amount.toFixed(1)} g; referencia 150–180 g en crudo.`);
      if (item.role === 'protein' && !isRawMeat(food)) messages.push(`${meal}: ${food.nombre} no tiene ración de referencia confirmada.`);
      if (isBreakfastOnly(food)) messages.push(`${meal}: el café y la leche se reservan al desayuno.`);
    }
    if (meal === 'Cena' && items.some(i => foodFor(foods, i.id).categoria === 'carbohidrato')) messages.push('Cena: retira la guarnición de cereales o tubérculos.');
    if (meal === 'Comida') {
      const carb = items.find(i => i.role === 'carb');
      if (!carb) messages.push('Comida: elige una fuente de carbohidratos.');
      else if (Math.abs(carb.amount - carbohydrateEquivalent(foodFor(foods, carb.id), foods)) > .5) messages.push('Comida: la guarnición se aleja de la equivalencia inicial de 70 g de arroz integral crudo.');
    }
  }
  return messages;
}
function macroScore(totals, goals) {
  return MACROS.reduce((score,k)=>{const d=(totals[k]-goals[k])/goals[k];return score+d*d*(d>0?1.5:1);},0);
}
export function macroDifferences(totals, goals) {
  return MACROS.map(key=>({key,amount:Math.abs(totals[key]-goals[key]),direction:totals[key]>goals[key]?'excess':'deficit',unit:key==='kcal'?'kcal':'g'})).filter(d=>d.amount>MACRO_TOLERANCE[d.key]);
}
function dinnerSearch(plan, foods) {
  // Only these meal references have been explicitly provided. Never guess ranges for other proteins.
  const proteins=Object.values(foods).filter(isRawMeat), vegetables=Object.values(foods).filter(f=>f.categoria==='verdura');
  if(!proteins.length||!vegetables.length)throw new Error('No se han podido cargar los alimentos con raciones confirmadas para la cena.');
  const fixed=budget(plan,foods,MEALS.filter(m=>m!=='Cena')).used;
  const ranges=Object.fromEntries(MACROS.map(k=>[k,{min:Infinity,max:-Infinity}]));
  let best=null, feasibleBest=null;
  for(const protein of proteins)for(const vegetable of vegetables){
    const veg=portion(vegetable,200);
    for(let amount=150;amount<=180;amount++){
      const proteinN=portion(protein,amount), dinner={},totals={};
      for(const k of MACROS){dinner[k]=veg[k]+proteinN[k];totals[k]=fixed[k]+dinner[k];ranges[k].min=Math.min(ranges[k].min,dinner[k]);ranges[k].max=Math.max(ranges[k].max,dinner[k]);}
      const candidate={protein,vegetable,amount,totals,dinner,score:macroScore(totals,plan.goals)};
      if(!best||candidate.score<best.score)best=candidate;
      if(!macroDifferences(totals,plan.goals).length&&(!feasibleBest||candidate.score<feasibleBest.score))feasibleBest=candidate;
    }
  }
  return {best:feasibleBest||best,feasible:!!feasibleBest,ranges,fixed};
}
export function planningIssues(plan,foods){
  const issues=[];
  if(!plan.choices.Merienda||!plan.meals.Merienda.some(i=>i.amount>0))issues.push('Elige la merienda obligatoria.');
  for(const role of ['protein','vegetable','carb'])if(!plan.meals.Comida.some(i=>i.role===role&&i.amount>0))issues.push(`Completa la comida: falta ${ {protein:'proteína',vegetable:'verdura',carb:'carbohidrato'}[role] }.`);
  for(const role of ['protein','vegetable','carb'])if(plan.meals.Comida.filter(i=>i.role===role).length>1)issues.push('La comida tiene fuentes duplicadas: revisa sus ingredientes antes de guardar la propuesta.');
  for(const item of plan.meals.Comida){
    const food=foodFor(foods,item.id);
    if((item.role==='vegetable'&&food.categoria!=='verdura')||(item.role==='carb'&&food.categoria!=='carbohidrato')||(item.role==='protein'&&!['proteina','lacteos'].includes(food.grupo)))issues.push('Un alimento de la comida no corresponde al grupo seleccionado.');
    if(item.role==='vegetable'&&Math.abs(item.amount-200)>.1)issues.push('La comida debe reservar 200 g de verdura.');
    if(item.role==='protein'&&isRawMeat(food)&&(item.amount<150||item.amount>180))issues.push('La carne o pescado de la comida se aleja de 150–180 g crudos.');
    if(item.role==='carb'&&Math.abs(item.amount-carbohydrateEquivalent(ingredientFood(item,foods),foods))>.5)issues.push('La guarnición de la comida se aleja de la equivalencia de 70 g de arroz integral crudo.');
  }
  const withoutDinner={...plan,meals:{...plan.meals,Cena:[]}};
  if(fruitServings(withoutDinner,foods)>2+1e-6)issues.push('Se supera el límite provisional de dos raciones de fruta.');
  for(const meal of MEALS.filter(m=>m!=='Cena'))if(meal!=='Desayuno'&&plan.meals[meal].some(i=>isBreakfastOnly(foodFor(foods,i.id))))issues.push('El café y la leche se reservan al desayuno.');
  return issues;
}
function adjustmentSuggestions(plan,foods,baseline){
  const suggestions=[], restored=structuredClone(plan),changes=[];
  for(const item of restored.meals.Comida){
    const food=ingredientFood(item,foods);
    const target=item.role==='vegetable'?200:item.role==='carb'?carbohydrateEquivalent(food,foods):item.role==='protein'&&isRawMeat(food)?Math.max(150,Math.min(180,item.amount)):item.amount;
    if(Math.abs(target-item.amount)>.1){changes.push({meal:'Comida',id:item.id,from:item.amount,to:target});item.amount=target;if(item.role==='protein')delete restored.proteinTargets.Comida;}
  }
  if(changes.length)suggestions.push({id:'restore-lunch',title:'Volver a las referencias de comida',plan:restored,changes});
  for(const meal of SMALL_MEALS){
    const yogurt=plan.meals[meal].find(i=>i.role==='yogurt');
    if(!yogurt)continue;
    const alternate=yogurt.id==='food_131'?'food_145':'food_131';if(!foods[alternate])continue;
    const next=structuredClone(plan),item=next.meals[meal].find(i=>i.key===yogurt.key);
    item.id=alternate;item.key=`yogurt-${alternate}`;delete item.nutritionLabel;
    next.recipeChoices[meal]={...next.recipeChoices[meal],yogurtId:alternate};
    const result=dinnerSearch(next,foods);
    if(result.best.score+1e-6<baseline.best.score)suggestions.push({id:`yogurt-${meal}`,title:`${meal}: probar ${foods[alternate].nombre}`,plan:next,changes:[{meal,id:alternate,previousId:yogurt.id,from:yogurt.amount,to:yogurt.amount}],result});
  }
  return suggestions.map(s=>{const result=s.result||dinnerSearch(s.plan,foods);return {...s,result:undefined,totals:result.best.totals,differences:macroDifferences(result.best.totals,plan.goals),issues:planningIssues(s.plan,foods)};});
}
export function propose(plan,foods,{allowIncomplete=false}={}){
  if(!allowIncomplete){
    if(!plan.choices.Merienda||!plan.meals.Merienda.some(i=>i.amount>0))throw new Error('Elige la merienda para calcular tu cena.');
    if(!['protein','vegetable','carb'].every(role=>plan.meals.Comida.some(i=>i.role===role&&i.amount>0)))throw new Error('Completa la comida: proteína, verdura y carbohidrato.');
  }
  const result=dinnerSearch(plan,foods),best=result.best,next=structuredClone(plan),issues=planningIssues(plan,foods);
  next.meals.Cena=[entry(best.protein.id,best.amount,'protein'),entry(best.vegetable.id,200,'vegetable')];delete next.proteinTargets.Cena;
  const differences=macroDifferences(best.totals,plan.goals);
  const complete=!!plan.choices.Merienda&&plan.meals.Merienda.some(i=>i.amount>0)&&['protein','vegetable','carb'].every(role=>plan.meals.Comida.some(i=>i.role===role&&i.amount>0));
  const remaining=Object.fromEntries(MACROS.map(k=>[k,plan.goals[k]-result.fixed[k]]));
  const reservation=MACROS.map(key=>({key,remaining:remaining[key],min:result.ranges[key].min,max:result.ranges[key].max,shortfall:Math.max(0,result.ranges[key].min-remaining[key])}));
  return {plan:next,totals:best.totals,differences,deviations:differences.map(d=>d.key),impossible:!result.feasible,issues,complete,ready:complete&&!issues.length,reservation,
    adjustments:complete?adjustmentSuggestions(plan,foods,result):[],
    message:!complete?'Estimación anticipada: completa comida y merienda para cerrar el día.':issues.length?'Revisa las pautas antes de guardar la cena. No se ha cambiado ninguna cantidad.':differences.length?'La cena respeta tus raciones, pero quedan diferencias respecto a los objetivos.':'Cena dentro de las pautas y próxima a los objetivos.'};
}
export function applyPlanningAdjustment(plan,adjustment){
  if(!adjustment?.plan||adjustment.plan.date!==plan.date||adjustment.plan.updatedAt!==plan.updatedAt)throw new Error('El plan cambió. Revisa los ajustes actualizados.');
  // Adjustments never commit their dinner preview: dinner still requires its own explicit save.
  const next=structuredClone(adjustment.plan);next.meals.Cena=structuredClone(plan.meals.Cena);return next;
}
export function validateDocument(value) {
  if (!value || value.version !== 3 || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) throw new Error('El plan guardado no tiene un formato compatible.');
  // Keep an empty compatibility field for existing Supabase RPCs; never count or display it.
  value = structuredClone(value);
  if (value.meals) value.meals['Media mañana'] = [];
  for (const key of ['choices', 'recipeChoices', 'proteinTargets']) if (value[key]) delete value[key]['Media mañana'];
  value.proteinTargets ||= {};
  if(value.meals)for(const meal of SMALL_MEALS){
    if(!Array.isArray(value.meals[meal]))continue;
    let yogurtSeen=false;
    value.meals[meal]=value.meals[meal].filter(item=>{
      if(!['food_131','food_144','food_145'].includes(item?.id))return true;
      if(yogurtSeen)return false;yogurtSeen=true;return true;
    }).map(item=>{
      if(!['food_131','food_144','food_145'].includes(item?.id))return item;
      const id=item.id==='food_144'?'food_145':item.id;
      if(value.recipeChoices?.[meal])value.recipeChoices[meal].yogurtId=id;
      return {...item,id,role:'yogurt',key:`yogurt-${id}`,amount:YOGURT_GRAMS};
    });
  }
  for (const key of MACROS) if (!Number.isFinite(value.goals?.[key]) || value.goals[key] <= 0 || value.goals[key] > 10000) throw new Error('Objetivos guardados no válidos.');
  if (!value.choices || !value.recipeChoices || !value.preferences || ![RECIPE.whole, RECIPE.semi].includes(value.preferences.milkId)) throw new Error('Falta la configuración de las opciones de comida.');
  if(value.preferences.dinnerProteinMode!==undefined&&!['remaining','amount','target'].includes(value.preferences.dinnerProteinMode))throw new Error('Modo de cálculo de cena no válido.');
  for (const name of ['milkMl','coffeeMl']) if (!Number.isFinite(value.preferences[name]) || value.preferences[name] < 0 || value.preferences[name] > 1000) throw new Error('Cantidades de café o leche no válidas.');
  for (const meal of SMALL_MEALS) if (![null,'none','coffee','A','B','legacy'].includes(value.choices[meal])) throw new Error('Opción de comida guardada no válida.');
  for (const meal of MEALS) {
    if (!Array.isArray(value.meals?.[meal])) throw new Error('Faltan comidas en el plan guardado.');
    if (value.meals[meal].some(i => !i || typeof i.id !== 'string' || typeof i.key !== 'string' || typeof i.role !== 'string' || !Number.isFinite(i.amount) || i.amount < 0 || i.amount > 10000)) throw new Error('Hay cantidades guardadas no válidas.');
    for (const item of value.meals[meal]) {
      if (item.unitGrams !== undefined && (!Number.isFinite(item.unitGrams) || item.unitGrams <= 0 || item.unitGrams > 1000)) throw new Error('Peso por unidad guardado no válido.');
      delete item.nutritionLabel; // Discard obsolete custom labels when opening old plans.
    }
  }
  return value;
}
export function migrateLegacy(saved, date, foods) {
  const next = blankPlan(date);
  for (const meal of MEALS) {
    const list = Array.isArray(saved?.[meal]) ? saved[meal] : [];
    next.meals[meal] = list.filter(i => foods[i?.id] && Number.isFinite(i.grams) && i.grams > 0 && i.grams <= 10000).map((i, n) => {
      const f = foods[i.id]; const role = f.categoria === 'verdura' ? 'vegetable' : f.categoria === 'carbohidrato' ? 'carb' : ['proteina', 'lacteos'].includes(f.grupo) ? 'protein' : 'extra';
      return { id: i.id, amount: i.grams, role, key: `legacy-${n}-${i.id}` };
    });
    if (SMALL_MEALS.includes(meal) && next.meals[meal].length) next.choices[meal] = 'legacy';
  }
  return next;
}
