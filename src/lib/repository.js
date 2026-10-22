// GitHub Pages serves the app under /<repo>/, so static catalog files follow Astro's base path.
const BASE = (import.meta.env?.BASE_URL || '/').replace(/\/?$/, '/');
export function createFoodStore(initial, client, authorizedIds) {
  const allowed = new Set(authorizedIds || initial.map(f => f.id));
  const foods = Object.fromEntries(initial.map(f => [f.id, f])), requests = new Map();
  const remember = rows => { const authorized = rows.filter(f => allowed.has(f.id)); authorized.forEach(f => foods[f.id] = f); return authorized; };
  async function get(id) {
    if (foods[id]) return foods[id];
    if (!allowed.has(id) || !/^food_\d{3}$/.test(id)) throw new Error('Alimento no autorizado.');
    if (!requests.has(id)) requests.set(id, (async () => {
      if (client) { const { data, error } = await client.from('nutrition_foods').select('payload').eq('id', id).maybeSingle(); if (!error && data) return remember([data.payload])[0]; }
      const response = await fetch(`${BASE}catalog/food/${id}.json`);
      if (!response.ok) throw new Error('No se encuentra un alimento del plan en el catálogo autorizado.');
      return remember([await response.json()])[0];
    })().finally(() => requests.delete(id)));
    return requests.get(id);
  }
  async function group(id) {
    const requestKey = `group:${id}`;
    if (!requests.has(requestKey)) requests.set(requestKey, (async () => {
      if (client) { const { data, error } = await client.from('nutrition_foods').select('payload').eq('food_group', id).order('name'); if (!error && data?.length) return remember(data.map(r => r.payload)); }
      const response = await fetch(`${BASE}catalog/group/${encodeURIComponent(id)}.json`);
      if (!response.ok) throw new Error('No se ha podido consultar este grupo.');
      return remember(await response.json());
    })().finally(() => requests.delete(requestKey)));
    return requests.get(requestKey);
  }
  return { foods, get, group, ensure: ids => Promise.all([...new Set(ids)].map(get)) };
}
export async function readCloudPlan(client, userId, date) {
  const { data, error } = await client.from('nutrition_daily_plans').select('document,revision').eq('user_id', userId).eq('plan_date', date).maybeSingle();
  if (error) throw new Error('No se ha podido leer tu cuenta. Comprueba la conexión y la configuración de Supabase.');
  return data;
}
export async function writeCloudPlan(client, document, expectedRevision, userId) {
  const { data, error } = await client.rpc('save_nutrition_daily_plan', { p_date: document.date, p_document: document, p_expected_revision: expectedRevision, p_user_id: userId });
  if (error) { const e = new Error(error.code === '40001' ? 'El plan cambió en otro dispositivo. Recarga la versión de tu cuenta antes de seguir.' : 'No se ha podido sincronizar. Tus cambios siguen guardados en este dispositivo.'); e.conflict = error.code === '40001'; throw e; }
  return data;
}
// Serializes saves so an older response never overwrites a newer edit.
export function createSaveQueue(save, initialRevision = 0) {
  let revision = initialRevision, chain = Promise.resolve(), blocked = false;
  return {
    enqueue(document) {
      const task = chain.catch(() => {}).then(async () => {
        if (blocked) throw new Error('Resuelve el conflicto antes de volver a guardar.');
        try { const result = await save(document, revision); revision = result.revision; return result; }
        catch (error) { if (error.conflict) blocked = true; throw error; }
      });
      chain = task; return task;
    },
    get revision() { return revision; },
  };
}
