import { useCallback, useEffect, useRef, useState } from 'react';
import { blankPlan, MEALS, migrateLegacy, validateDocument } from './engine.js';
import { createSaveQueue, readCloudPlan, writeCloudPlan } from './repository.js';
export const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const storageKey = (uid, date) => `mi-plato-v3:${uid || 'guest'}:${date}`;
const idsOf = doc => MEALS.flatMap(m => doc.meals[m] || []).map(i => i.id);
function readLocal(key) { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
export function usePlan(store, client) {
  const [date, setDate] = useState(localDate), [user, setUser] = useState(null), [authReady, setAuthReady] = useState(!client);
  const [plan, setPlan] = useState(null), [status, setStatus] = useState('Cargando…'), [error, setError] = useState(''), [conflict, setConflict] = useState(false), [loadId, setLoadId] = useState(0);
  const queues = useRef(new Map()), currentKey = useRef(''), dirty = useRef(false), latest = useRef(null), generation = useRef(0);
  const uid = user?.id || null, key = storageKey(uid, date);
  const owner = useRef(uid), pending = useRef(new Map()); owner.current = uid;
  useEffect(() => {
    if (!client) return;
    let alive = true;
    client.auth.getSession().then(({ data, error }) => { if (!alive) return; setUser(data.session?.user || null); setAuthReady(true); if (error) setError('No se pudo recuperar la sesión.'); }).catch(() => { if (alive) { setAuthReady(true); setError('No se pudo recuperar la sesión. Vuelve a iniciar sesión.'); } });
    const { data } = client.auth.onAuthStateChange((_event, session) => { setUser(session?.user || null); setAuthReady(true); });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, [client]);
  useEffect(() => {
    if (!authReady) return;
    let cancelled = false; const version = ++generation.current;
    currentKey.current = key; dirty.current = false; setPlan(null); setError(''); setConflict(false); setStatus('Cargando…');
    (async () => {
      let local;
      try { local = readLocal(key); } catch { setError('No se ha podido leer el respaldo de este dispositivo.'); }
      let remote = null, offline = false;
      if (uid && client) { try { remote = await readCloudPlan(client, uid, date); } catch (e) { if (!local?.document) throw e; offline = true; setError(e.message); } }
      if (cancelled) return;
      if (local?.dirty && remote && remote.revision !== local.revision) {
        setConflict(true); setError('Hay cambios locales y una versión distinta en tu cuenta. Recarga la versión de tu cuenta para resolver el conflicto.');
      }
      let document = remote?.document || local?.document;
      if (local?.dirty && (!remote || remote.revision === local.revision)) document = local.document;
      if (!document && !uid) {
        let legacy = null; try { legacy = JSON.parse(localStorage.getItem(`mi-plato:${date}`)); } catch { /* preserve unreadable source */ }
        if (legacy) {
          await store.ensure(Object.values(legacy).flat().filter(i => i?.id).map(i => i.id));
          document = migrateLegacy(legacy, date, store.foods);
        }
      }
      document = document ? validateDocument(document) : blankPlan(date);
      if (document.date !== date) throw new Error('La fecha guardada no coincide con la seleccionada.');
      await store.ensure(idsOf(document));
      if (cancelled || version !== generation.current) return;
      queues.current.set(key, createSaveQueue((doc, revision) => {
        if (owner.current !== uid) throw new Error('Sesión cambiada. El borrador permanece en el dispositivo de la cuenta original.');
        return writeCloudPlan(client, doc, revision, uid);
      }, remote?.revision ?? local?.revision ?? 0));
      dirty.current = !!local?.dirty && (!remote || remote.revision === local.revision);
      latest.current = document; setPlan(document);
      setStatus(uid ? (offline ? 'Respaldo local · sin conexión a tu cuenta' : dirty.current ? 'Cambios pendientes de sincronizar' : 'Guardado en tu cuenta') : 'Guardado en este dispositivo');
      if (dirty.current && !offline) void persist(document, key, uid);
    })().catch(e => { if (!cancelled) { setError(e.message); setStatus('No se pudo cargar el plan'); } });
    return () => { cancelled = true; };
  }, [key, uid, authReady, loadId, client, store]);
  const persist = useCallback(async (document, targetKey, accountId) => {
    const queue = queues.current.get(targetKey);
    try {
      localStorage.setItem(targetKey, JSON.stringify({ document, revision: queue?.revision || 0, dirty: !!accountId }));
    } catch { setError('No se ha podido crear el respaldo local.'); }
    if (accountId && owner.current !== accountId) return;
    if (!accountId || !client) { if (currentKey.current === targetKey) { dirty.current = false; setStatus('Guardado en este dispositivo'); } return; }
    if (!queue) return;
    if (currentKey.current === targetKey) setStatus('Sincronizando…');
    try {
      const result = await queue.enqueue(document);
      let saved = readLocal(targetKey);
      if (saved?.document.updatedAt === document.updatedAt) saved = { document, revision: result.revision, dirty: false };
      else if (saved) saved.revision = result.revision;
      if (saved) localStorage.setItem(targetKey, JSON.stringify(saved));
      if (currentKey.current === targetKey && latest.current?.updatedAt === document.updatedAt) { dirty.current = false; setStatus('Guardado en tu cuenta'); setError(''); }
    } catch (e) { if (currentKey.current === targetKey) { setStatus('Sin sincronizar'); setError(e.message); if (e.conflict) setConflict(true); } }
  }, [client]);
  const change = useCallback(updater => {
    if (!latest.current || currentKey.current !== key) return;
    if (conflict) throw new Error('Resuelve primero el conflicto con tu cuenta.');
    const next = validateDocument(typeof updater === 'function' ? updater(latest.current) : updater);
    next.updatedAt = `${new Date().toISOString()}-${crypto.randomUUID()}`;
    validateDocument(next); latest.current = next; dirty.current = true; setPlan(next);
    // Every keystroke has a local recovery copy; coalesce remote writes.
    try { localStorage.setItem(key, JSON.stringify({document:next,revision:queues.current.get(key)?.revision||0,dirty:!!uid})); } catch { setError('No se ha podido guardar el respaldo local.'); }
    const previous = pending.current.get(key); if (previous) clearTimeout(previous);
    setStatus(uid ? 'Guardando en tu cuenta…' : 'Guardado en este dispositivo');
    pending.current.set(key, setTimeout(() => { pending.current.delete(key); void persist(next, key, uid); }, uid ? 450 : 0));
  }, [key, uid, persist, conflict]);
  const discardLocal = useCallback(() => {
    if (!window.confirm('Se cargará la versión de tu cuenta y se descartará el borrador local de esta fecha.')) return;
    // Keep a recovery copy instead of deleting the draft irreversibly.
    const raw = localStorage.getItem(key); if (raw) localStorage.setItem(`${key}:recovery:${Date.now()}`, raw);
    localStorage.removeItem(key); setLoadId(n => n + 1);
  }, [key]);
  useEffect(() => {
    if (!client || !uid || !plan) return;
    const channel = client.channel(`plan-${uid}-${date}`).on('postgres_changes', { event: '*', schema: 'public', table: 'nutrition_daily_plans', filter: `user_id=eq.${uid}` }, payload => {
      const row = payload.new;
      if (row?.plan_date !== date || row.document?.updatedAt === latest.current?.updatedAt) return;
      if (!dirty.current) setLoadId(n => n + 1);
      // Version checks in save_nutrition_daily_plan handle concurrent dirty drafts.
    }).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [client, uid, date, !!plan]);
  const retry = () => { if (plan) void persist(plan, key, uid); else setLoadId(n => n + 1); };
  return { date, setDate, user, authReady, plan, change, status, error, conflict, retry, discardLocal, reload: () => setLoadId(n => n + 1) };
}
