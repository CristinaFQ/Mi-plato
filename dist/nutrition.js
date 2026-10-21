export const keys = ['kcal','proteinas','carbohidratos','grasas'];
export const nutrientKeys = [...keys, 'azucares', 'fibra'];
export const foodUnit = food => food.unidad_racion === 'ml' ? 'ml' : 'g';
export function per100(food, nutrient) {
  return food[`${nutrient}_100${foodUnit(food)}`];
}
export function nutrients(food, amount) {
  if (!Number.isFinite(amount) || amount < 0 || amount > 10000) throw new Error('Cantidad no válida');
  return Object.fromEntries(nutrientKeys.map(k => [k, (per100(food, k) ?? 0) * amount / 100]));
}
export function total(items, foods) {
  return items.reduce((sum, item) => {
    const food = foods.find(f => f.id === item.id);
    if (!food) return sum;
    const n = nutrients(food, item.grams);
    nutrientKeys.forEach(k => sum[k] += n[k]);
    return sum;
  }, Object.fromEntries(nutrientKeys.map(k => [k,0])));
}
export function canAdd(meals, meal, food, foods, maxFruit = 2) {
  if (!foods.some(f => f.id === food.id)) return 'No incluido en la lista de tu nutricionista';
  if (meal === 'Cena' && food.categoria === 'carbohidrato') return 'La cena no incluye guarnición de cereales o tubérculos.';
  const fruitCount = Object.values(meals).flat().filter(i => foods.find(f => f.id === i.id)?.categoria === 'fruta').length;
  if (food.categoria === 'fruta' && fruitCount >= maxFruit) return 'Máximo de dos raciones de fruta al día.';
  return '';
}
export function readDay(value, foods, mealNames) {
  const clean = Object.fromEntries(mealNames.map(m => [m,[]]));
  if (!value || typeof value !== 'object') return clean;
  const seen = new Set(); let fruits = 0;
  for (const meal of mealNames) {
    for (const i of Array.isArray(value[meal]) ? value[meal] : []) {
      const f = foods.find(f => f.id === i.id);
      if (!f || typeof i.key !== 'string' || seen.has(i.key) || !Number.isFinite(i.grams) || i.grams <= 0 || i.grams > 10000) continue;
      if (meal === 'Cena' && f.categoria === 'carbohidrato') continue;
      if (f.categoria === 'fruta' && ++fruits > 2) continue;
      seen.add(i.key); clean[meal].push({id:i.id,key:i.key,grams:i.grams});
    }
  }
  return clean;
}


export function mealGuidelines(meals, meal, foods, config) {
  const items=meals[meal]||[], messages=[];
  if(meal==='Merienda'&&config.merienda_tarde_obligatoria&&!items.length)messages.push('Incluye tu merienda de la tarde.');
  if(!['Comida','Cena'].includes(meal)||!items.length)return messages;
  const entries=items.map(item=>({food:foods.find(f=>f.id===item.id),amount:item.grams})).filter(entry=>entry.food);
  const vegetables=entries.filter(e=>e.food.categoria==='verdura').reduce((sum,e)=>sum+e.amount,0);
  const vegetableGoal=meal==='Comida'?config.verdura_comida_g:config.verdura_cena_g;
  if(vegetables<vegetableGoal)messages.push(`Verduras: ${vegetables} de ${vegetableGoal} g de referencia.`);
  if(!entries.some(e=>e.food.grupo==='proteina'||['carne','pescado_marisco','huevos','legumbres_derivados','lacteos'].includes(e.food.categoria)))messages.push('Completa el plato con una proteína de tu lista.');
  if(meal==='Comida'&&Number.isFinite(config.carbohidrato_comida_alimento_g)){
    const amount=entries.filter(e=>e.food.categoria==='carbohidrato').reduce((sum,e)=>sum+e.amount,0);
    const goal=config.carbohidrato_comida_alimento_g;
    if(Math.abs(amount-goal)>0.001)messages.push(`Guarnición de carbohidrato: ${amount} g de alimento; referencia de ${goal} g en total.`);
  }
  const meat=entries.filter(e=>['carne','pescado_marisco'].includes(e.food.categoria)&&e.food.estado_referencia==='crudo');
  if(meat.length){
    const amount=meat.reduce((sum,e)=>sum+e.amount,0),[min,max]=config.carne_pescado_referencia_g;
    if(amount<min||amount>max)messages.push(`Carne o pescado en crudo: ${amount} g; referencia de ${min}–${max} g.`);
  }
  return messages;
}

export function defaultPortion(food, meal, meals, foods, config) {
  if(meal==='Comida'&&food.categoria==='carbohidrato'&&Number.isFinite(config.carbohidrato_comida_alimento_g)){
    const existing=(meals[meal]||[]).filter(item=>foods.find(f=>f.id===item.id)?.categoria==='carbohidrato').reduce((sum,item)=>sum+item.grams,0);
    const remaining=config.carbohidrato_comida_alimento_g-existing;
    return remaining>=1?remaining:config.carbohidrato_comida_alimento_g;
  }
  if(food.categoria==='verdura')return meal==='Cena'?config.verdura_cena_g:config.verdura_comida_g;
  if(['carne','pescado_marisco'].includes(food.categoria))return config.carne_pescado_referencia_g[0];
  return 100;
}

// Inverse calculation: target grams of protein -> grams or ml of this food.
export function amountForProtein(food, targetProtein) {
  const proteinPer100=per100(food,'proteinas');
  if(!Number.isFinite(targetProtein)||targetProtein<=0)throw new Error('Indica los gramos de proteína que quieres obtener.');
  if(!Number.isFinite(proteinPer100)||proteinPer100<=0)throw new Error('Este alimento no permite calcular una ración de proteína.');
  const amount=targetProtein*100/proteinPer100;
  if(!Number.isFinite(amount)||amount>10000)throw new Error('La cantidad calculada supera el rango admitido.');
  return {amount,unit:foodUnit(food),nutrients:nutrients(food,amount)};
}

// Reservations are explicit inputs; no unconfirmed distribution is assumed.
export function remainingBudget(meals, foods, config, reserved={}) {
  const goals={kcal:config.energia_kcal,proteinas:config.proteina_g,carbohidratos:config.carbohidratos_g,grasas:config.grasa_g};
  const consumed=total(Object.values(meals).flat(),foods);
  const remaining={},exceeded={};
  for(const key of keys){
    const reservation=reserved[key]??0;
    if(!Number.isFinite(reservation)||reservation<0)throw new Error('Reserva no válida.');
    remaining[key]=goals[key]-consumed[key]-reservation;
    exceeded[key]=Math.max(0,-remaining[key]);
  }
  return {consumed,remaining,exceeded};
}
