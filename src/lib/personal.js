import { MEALS, validateDocument } from './engine.js';
export const ACCESS_STORAGE = 'mi-plato:personal-access';
export const devicePlanKey = date => `mi-plato-v3:guest:${date}`;
export function cloudError(error) {
  const e = new Error(error?.code === '40001' ? 'Este día cambió en otro dispositivo. Elige qué versión conservar.'
    : error?.code === '28000' ? 'La llave personal no es válida. Vuelve a conectar este dispositivo.'
    : ['PGRST202','PGRST205','42P01','42883','42501'].includes(error?.code) ? 'Falta activar el espacio personal en Supabase. Tus comidas siguen guardadas aquí.'
    : error?.code === '22023' ? 'Supabase no acepta este plan. Comprueba que el catálogo y la migración estén actualizados.'
    : 'No se pudo sincronizar. Tus comidas siguen guardadas en este dispositivo.');
  e.conflict = error?.code === '40001'; e.accessDenied = error?.code === '28000';
  e.code = error?.code; return e;
}
async function request(client,name,args){
  try{return await client.rpc(name,args);}catch(error){throw cloudError(error);}
}
export async function checkPersonalAccess(client, accessKey) {
  if (!client) throw new Error('La conexión con Supabase todavía no está configurada.');
  const {data,error}=await request(client,'check_nutrition_personal_access',{p_access_key:accessKey});
  if(error)throw cloudError(error);
  if(data!==true)throw cloudError({code:'28000'});
}
export async function readPersonalPlan(client, accessKey, date) {
  const {data,error}=await request(client,'read_nutrition_personal_plan',{p_access_key:accessKey,p_date:date});
  if(error)throw cloudError(error);return data;
}
export async function savePersonalPlan(client, accessKey, document, revision) {
  const {data,error}=await request(client,'save_nutrition_personal_plan',{p_access_key:accessKey,p_date:document.date,p_document:document,p_expected_revision:revision});
  if(error)throw cloudError(error);return data;
}
export function readDevicePlan(storage,date) {
  const key=devicePlanKey(date),raw=storage.getItem(key);
  let newest=null;
  if(raw){const record=JSON.parse(raw);newest={...record,document:validateDocument(record.document),dirty:record.personalSync!==true||!!record.dirty};if(record.personalSync||record.personalManaged)return newest;}
  // Preserve days written by the old account-based app. Never remove their recovery copies.
  for(let i=0;i<storage.length;i++){
    const oldKey=storage.key(i);
    if(oldKey===key||!oldKey?.startsWith('mi-plato-v3:')||!oldKey.endsWith(`:${date}`))continue;
    try{const record=JSON.parse(storage.getItem(oldKey));const document=validateDocument(record.document);
      if(!newest||String(document.updatedAt||'')>String(newest.document.updatedAt||''))newest={document,revision:0,dirty:true,personalSync:false};
    }catch{/* Leave unreadable originals intact. */}
  }
  return newest;
}
export function localDates(storage) {
  const dates=new Set();
  for(let i=0;i<storage.length;i++){const key=storage.key(i);const match=key?.match(/^mi-plato(?:-v3:[^:]+)?:([0-9]{4}-[0-9]{2}-[0-9]{2})$/);if(match)dates.add(match[1]);}
  return [...dates].sort();
}
export const planHasFood = plan => MEALS.some(m=>plan.meals[m]?.length);
