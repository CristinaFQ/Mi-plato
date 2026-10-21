import { readFile, writeFile } from 'node:fs/promises';
const data = JSON.parse(await readFile(new URL('../data/catalogo.json', import.meta.url)));
const groups = new Set(['proteina','verdura','carbohidrato','grasa','fruta','lacteos','otros']);
const groupOf = f => f.grupo_principal || (['carne','pescado_marisco','huevos','legumbres_derivados'].includes(f.categoria) || f.nombre.startsWith('Proteína de ') ? 'proteina' : f.categoria==='frutos_secos_semillas'?'grasa':groups.has(f.categoria)?f.categoria:'otros');
const quote = value => "'"+value.replaceAll("'","''")+"'";
const rows = data.alimentos.map(f => {const group=groupOf(f);return `(${quote(f.id)},${quote(f.nombre)},${quote(group)},${quote(JSON.stringify({...f,grupo:group}))}::jsonb)`;});
await writeFile(new URL('../supabase/seed.sql',import.meta.url), `-- Generated from the strict authorized catalogue; never imports pending entries.\nbegin;\ninsert into public.nutrition_foods(id,name,food_group,payload) values\n${rows.join(',\n')}\non conflict(id) do update set name=excluded.name,food_group=excluded.food_group,payload=excluded.payload;\ncommit;\n`);
console.log(`Seed generated: ${rows.length} authorized foods.`);
