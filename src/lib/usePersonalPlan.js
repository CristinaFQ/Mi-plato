import {useCallback,useEffect,useRef,useState} from 'react';
import {blankPlan,MEALS,migrateLegacy,validateDocument} from './engine.js';
import {createSaveQueue} from './repository.js';
import {ACCESS_STORAGE,devicePlanKey,readDevicePlan,readPersonalPlan,savePersonalPlan,checkPersonalAccess,localDates} from './personal.js';
export {localDate} from './usePlan.js';
import {localDate} from './usePlan.js';
const idsOf=doc=>MEALS.flatMap(m=>doc.meals[m]||[]).map(i=>i.id);
const stamp=()=>`${new Date().toISOString()}-${globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)}`;
export function usePersonalPlan(store,client){
  const [date,setDate]=useState(localDate),[plan,setPlan]=useState(null),[accessKey,setAccessKey]=useState(()=>{try{return localStorage.getItem(ACCESS_STORAGE)||'';}catch{return '';}});
  const [status,setStatus]=useState('Preparando tu día…'),[error,setError]=useState(''),[conflict,setConflict]=useState(false),[reloadId,setReloadId]=useState(0),[connecting,setConnecting]=useState(false);
  const latest=useRef(null),currentDate=useRef(date),access=useRef(accessKey),alive=useRef(true),queues=useRef(new Map()),pending=useRef(new Map()),activeWrites=useRef(new Map()),dirty=useRef(false);
  currentDate.current=date;access.current=accessKey;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;for(const item of pending.current.values())clearTimeout(item.timer);pending.current.clear();};},[]);
  const display=useCallback((day,fn)=>{if(alive.current&&currentDate.current===day)fn();},[]);
  const persist=useCallback(async(document,key)=>{
    const day=document.date, queue=queues.current.get(day);
    if(!client||!key||access.current!==key||!queue)return;
    display(day,()=>setStatus('Sincronizando…'));
    activeWrites.current.set(day,(activeWrites.current.get(day)||0)+1);
    try{
      const saved=await queue.enqueue(document);
      if(access.current!==key)return;
      const current=readDevicePlan(localStorage,day);
      if(current){const unchanged=current.document.updatedAt===document.updatedAt;
        localStorage.setItem(devicePlanKey(day),JSON.stringify({...current,revision:saved.revision,personalSync:true,dirty:!unchanged}));
        display(day,()=>{if(latest.current?.updatedAt===document.updatedAt){dirty.current=false;setStatus('Sincronizado entre dispositivos');setError('');}});
      }
    }catch(e){display(day,()=>{setStatus('Guardado aquí · pendiente de sincronizar');setError(e.message);if(e.conflict)setConflict(true);});}
    finally{const count=(activeWrites.current.get(day)||1)-1;if(count)activeWrites.current.set(day,count);else activeWrites.current.delete(day);}
  },[client,display]);
  useEffect(()=>{
    let cancelled=false;const day=date,key=accessKey;
    const sameDay=latest.current?.date===day,startedAt=latest.current?.updatedAt;
    if(!sameDay){latest.current=null;dirty.current=false;setPlan(null);}
    setError('');setConflict(false);
    (async()=>{
      let local=null;
      try{local=readDevicePlan(localStorage,day);}catch{setError('No se pudo leer el respaldo local. Se conservan los archivos originales.');}
      if(!local){
        try{const old=JSON.parse(localStorage.getItem(`mi-plato:${day}`)||'null');if(old){await store.ensure(Object.values(old).flat().filter(i=>i?.id).map(i=>i.id));local={document:migrateLegacy(old,day,store.foods),dirty:true,personalSync:false,revision:0};}}
        catch{/* The original is retained for recovery. */}
      }
      const document=local?validateDocument(local.document):blankPlan(day);
      if(document.date!==day)throw new Error('La fecha guardada no coincide con este día.');
      await store.ensure(idsOf(document));if(cancelled)return;
      if(!sameDay||latest.current?.updatedAt===startedAt){latest.current=document;dirty.current=!!local?.dirty;setPlan(document);}
      setStatus(key&&client?'Comprobando sincronización…':'Guardado en este dispositivo');
      if(!client||!key)return;
      let remote;
      try{remote=await readPersonalPlan(client,key,day);}catch(e){if(!cancelled){setStatus('Guardado aquí · pendiente de conexión');setError(e.message);}return;}
      if(cancelled)return;
      // Edits made while the first network read was in flight must not be replaced.
      const current=readDevicePlan(localStorage,day)||local;
      const changedDuringLoad=latest.current?.updatedAt!==document.updatedAt;
      const draft=changedDuringLoad?{...current,document:latest.current,dirty:true}:current;
      const hasDirty=!!draft?.dirty;
      const sameSnapshot=remote&&draft?.document.updatedAt&&remote.document.updatedAt===draft.document.updatedAt;
      if(remote&&hasDirty&&!sameSnapshot&&(!draft.personalSync||remote.revision!==(draft.revision||0))){
        dirty.current=true;setConflict(true);setError('Hay dos versiones de este día. Tus comidas están a salvo: elige cuál conservar.');setStatus('Guardado aquí · conflicto de sincronización');return;
      }
      const queue=createSaveQueue((doc,revision)=>{if(access.current!==key)throw new Error('El acceso cambió; se conserva el respaldo local.');return savePersonalPlan(client,key,doc,revision);},remote?.revision||0);
      queues.current.set(day,queue);
      if(hasDirty&&!sameSnapshot){dirty.current=true;await persist(draft.document,key);return;}
      if(remote){const saved=validateDocument(remote.document),beforeHydration=latest.current?.updatedAt;await store.ensure(idsOf(saved));if(cancelled)return;
        if(latest.current?.updatedAt!==beforeHydration){setReloadId(n=>n+1);return;}
        latest.current=saved;dirty.current=false;setPlan(saved);localStorage.setItem(devicePlanKey(day),JSON.stringify({document:saved,revision:remote.revision,dirty:false,personalSync:true}));setStatus('Sincronizado entre dispositivos');
      }else setStatus('Conectado · día todavía sin guardar');
    })().catch(e=>{if(!cancelled){setError(e.message);setStatus('No se pudo cargar este día');}});
    return()=>{cancelled=true;};
  },[date,accessKey,client,store,reloadId,persist]);
  const change=useCallback(updater=>{
    if(!latest.current||latest.current.date!==date)return;
    if(conflict)throw new Error('Elige primero qué versión conservar.');
    const next=validateDocument(typeof updater==='function'?updater(latest.current):updater);next.updatedAt=stamp();
    latest.current=next;dirty.current=true;setPlan(next);
    let prior;try{prior=readDevicePlan(localStorage,date);}catch{try{const raw=localStorage.getItem(devicePlanKey(date));if(raw)localStorage.setItem(`${devicePlanKey(date)}:recovery:${Date.now()}`,raw);}catch{/* The write below reports storage failures. */}}
    const queue=queues.current.get(date);
    try{localStorage.setItem(devicePlanKey(date),JSON.stringify({document:next,revision:queue?.revision??prior?.revision??0,personalSync:prior?.personalSync||false,personalManaged:true,dirty:true}));}
    catch{setStatus('No se pudo guardar');setError('El navegador no permite guardar. No cierres esta página hasta recuperar el almacenamiento.');return;}
    setStatus(accessKey&&client?'Guardado aquí · sincronizando…':'Guardado en este dispositivo');
    const previous=pending.current.get(date);if(previous)clearTimeout(previous.timer);
    const item={document:next,key:accessKey,timer:setTimeout(()=>{pending.current.delete(date);void persist(next,accessKey);},450)};pending.current.set(date,item);
  },[date,accessKey,client,conflict,persist]);
  const connect=useCallback(async key=>{
    const value=key.trim();setConnecting(true);setError('');
    try{await checkPersonalAccess(client,value);localStorage.setItem(ACCESS_STORAGE,value);setAccessKey(value);setReloadId(n=>n+1);return true;}
    catch(e){setError(e.message||'No se pudo conectar. Tus comidas siguen guardadas aquí.');return false;}
    finally{setConnecting(false);}
  },[client]);
  const disconnect=useCallback(()=>{localStorage.removeItem(ACCESS_STORAGE);setAccessKey('');queues.current.clear();},[]);
  // Retry when returning to the app or the network, and refresh clean days without a permanent open session.
  useEffect(()=>{
    const refresh=()=>{if(client&&access.current&&!pending.current.size&&!activeWrites.current.size)setReloadId(n=>n+1);};
    const visible=()=>{if(document.visibilityState==='visible')refresh();else for(const [day,item] of pending.current){clearTimeout(item.timer);pending.current.delete(day);void persist(item.document,item.key);}};
    window.addEventListener('online',refresh);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);
    const timer=setInterval(()=>{if(document.visibilityState!=='hidden'&&!dirty.current)refresh();},30000);
    return()=>{clearInterval(timer);window.removeEventListener('online',refresh);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);};
  },[client,persist]);
  // Upload existing local days automatically if the cloud has no version of that day.
  useEffect(()=>{
    if(!client||!accessKey)return;let cancelled=false;
    (async()=>{for(const day of localDates(localStorage)){
      if(cancelled)return;if(day===currentDate.current)continue;
      try{let local=readDevicePlan(localStorage,day);if(!local){const old=JSON.parse(localStorage.getItem(`mi-plato:${day}`)||'null');if(old){await store.ensure(Object.values(old).flat().filter(i=>i?.id).map(i=>i.id));local={document:migrateLegacy(old,day,store.foods),dirty:true,revision:0,personalSync:false};localStorage.setItem(devicePlanKey(day),JSON.stringify(local));}}if(!local||!local.dirty)continue;
        const remote=await readPersonalPlan(client,accessKey,day);if(cancelled||day===currentDate.current)continue;
        if(remote)continue; // A remote day is never overwritten by an unrelated old draft.
        await store.ensure(idsOf(local.document));const result=await savePersonalPlan(client,accessKey,local.document,0);
        const current=readDevicePlan(localStorage,day);
        if(current?.document.updatedAt===local.document.updatedAt)localStorage.setItem(devicePlanKey(day),JSON.stringify({...current,revision:result.revision,dirty:false,personalSync:true}));
      }catch{/* Keep pending copies; opening that date exposes the exact error and permits retry. */}
    }})().catch(()=>{});return()=>{cancelled=true;};
  },[client,accessKey,store,reloadId]);
  const resolve=useCallback(async keepLocal=>{
    if(!latest.current)return;const day=date;
    try{
      const remote=await readPersonalPlan(client,accessKey,day);
      if(keepLocal){queues.current.set(day,createSaveQueue((doc,rev)=>savePersonalPlan(client,accessKey,doc,rev),remote?.revision||0));setConflict(false);await persist(latest.current,accessKey);}
      else{localStorage.setItem(`${devicePlanKey(day)}:recovery:${Date.now()}`,JSON.stringify({document:latest.current}));localStorage.setItem(devicePlanKey(day),JSON.stringify({document:remote?.document||blankPlan(day),revision:remote?.revision||0,dirty:false,personalSync:true}));setConflict(false);setReloadId(n=>n+1);}
    }catch(e){setError(e.message||'No se pudo resolver. Se conserva tu copia local.');}
  },[date,client,accessKey,persist]);
  const retry=()=>{if(!activeWrites.current.get(date))setReloadId(n=>n+1);};
  return {date,setDate,plan,change,status,error,conflict,connecting,connected:!!(client&&accessKey),connect,disconnect,retry,discardLocal:()=>resolve(false),keepLocal:()=>resolve(true)};
}
