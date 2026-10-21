import source from '../../data/catalogo.json';
export const GROUPS = { proteina: 'Proteínas', verdura: 'Verduras', carbohidrato: 'Carbohidratos', grasa: 'Frutos secos y semillas', fruta: 'Frutas', lacteos: 'Lácteos', otros: 'Otros autorizados' };
export function groupOf(food) {
  if (food.grupo_principal) return food.grupo_principal;
  if (['carne', 'pescado_marisco', 'huevos', 'legumbres_derivados'].includes(food.categoria)) return 'proteina';
  if (food.nombre.startsWith('Proteína de ')) return 'proteina';
  if (food.categoria === 'frutos_secos_semillas') return 'grasa';
  return GROUPS[food.categoria] ? food.categoria : 'otros';
}
export const catalogue = source.alimentos.map(food => ({ ...food, grupo: groupOf(food) }));
export const groups = Object.entries(GROUPS).map(([id, name]) => ({ id, name, count: catalogue.filter(f => f.grupo === id).length }));
const presetIds = ['food_002', 'food_063', 'food_070', 'food_118', 'food_131', 'food_132', 'food_135', 'food_136', 'food_137', 'food_145'];
export const bootstrap = { authorizedIds: catalogue.map(f => f.id), groups, foods: catalogue.filter(f => presetIds.includes(f.id)), count: catalogue.length };
