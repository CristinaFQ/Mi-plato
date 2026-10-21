import {total, canAdd, readDay, keys, foodUnit, per100, nutrients, mealGuidelines, defaultPortion} from './nutrition.js';
const $ = s => document.querySelector(s);
const mealNames = ['Desayuno','Comida','Merienda','Cena'];
const mealMeta = [['sun','Para empezar el día'],['plate','Verdura, proteína y carbohidrato'],['cup','Obligatoria'],['moon','Verdura y proteína']];
const labels = {fruta:'Frutas',verdura:'Verduras',carbohidrato:'Carbohidratos',legumbres_derivados:'Legumbres y derivados',frutos_secos_semillas:'Frutos secos y semillas',pescado_marisco:'Pescado y marisco',vegetal_otros:'Otros vegetales',carne:'Carne',lacteos:'Lácteos',huevos:'Huevos'};
const esc = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(n);
const localDate = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
let catalog,foods=[],config,meals,view='plan',saveFailed=false;
let loadVersion=0,composerVersion=0,catalogVersion=0;
let composer=null;
const shortGroups={proteina:'Proteína',carbohidrato:'Carbohidrato',grasa:'Grasas',verdura:'Verduras',fruta:'Fruta',lacteos:'Lácteos',otros:'Otros'};
const groupIcons={proteina:'plate',carbohidrato:'sun',grasa:'drop',verdura:'leaf',fruta:'apple',lacteos:'cup',otros:'leaf'};
$('#date').value=localDate();
function toast(message){$('#toast').textContent=message;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',4500);}
async function api(path){
  const response=await fetch(path);
  if(!response.ok)throw new Error('No se ha podido consultar la base de datos.');
  return response.json();
}
function remember(list){for(const food of list){const i=foods.findIndex(f=>f.id===food.id);if(i<0)foods.push(food);else foods[i]=food;}}
async function load(){
  const version=++loadVersion;
  let saved=null;
  try{saved=JSON.parse(localStorage.getItem('mi-plato:'+$('#date').value));}catch{toast('No se han podido leer los datos guardados.');}
  const ids=[...new Set(mealNames.flatMap(name=>Array.isArray(saved?.[name])?saved[name]:[]).filter(i=>i&&typeof i.id==='string').map(i=>i.id))];
  if(ids.length){const data=await api('/api/alimentos?'+new URLSearchParams({ids:ids.join(',')}));if(version!==loadVersion)return false;remember(data.alimentos);}
  if(version!==loadVersion)return false;
  meals=readDay(saved,foods,mealNames);
  return true;
}
function persist(){try{localStorage.setItem('mi-plato:'+$('#date').value,JSON.stringify(meals));saveFailed=false;}catch{saveFailed=true;toast('No se ha podido guardar. Conserva esta pestaña abierta.');}}
function dayTotal(){return total(Object.values(meals).flat(),foods);}
function plate(dinner=false){return `<div class="plate-group"><div class="plate ${dinner?'dinner':''}" role="img" aria-label="${dinner?'Cena: verduras y proteína':'Comida: mitad verduras, un cuarto proteína y un cuarto carbohidratos'}"></div><div class="plate-label"><strong>${dinner?'Cena':'Comida'}</strong><br><i></i>${dinner?'Verduras':'½ Verduras'}<br><i class="protein"></i>${dinner?'Proteína':'¼ Proteína'}${dinner?'':'<br><i class="carb"></i>¼ Carbohidrato'}</div></div>`;}
function icon(name){
  const paths={sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',plate:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>',cup:'<path d="M5 8h12v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8Zm12 1h2a3 3 0 0 1 0 6h-2M8 3v2m5-2v2"/>',moon:'<path d="M20.5 14a9 9 0 0 1-10.5-10.5A9 9 0 1 0 20.5 14Z"/>',plus:'<path d="M12 5v14M5 12h14"/>',leaf:'<path d="M20 4C9 2 3 8 5 15s14 5 15-11ZM5 20l9-10"/>',apple:'<path d="M12 6c-8-5-12 4-7 12 2 4 4 2 7 2s5 2 7-2c5-8 1-17-7-12Zm0 0c0-3 2-4 4-4"/>',drop:'<path d="M12 3C9 8 5 12 5 16a7 7 0 0 0 14 0c0-4-4-8-7-13Z"/>',trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/>'};
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.plate}</svg>`;
}
function overview(){
  const t=dayTotal(),goals=[config.energia_kcal,config.proteina_g,config.carbohidratos_g,config.grasa_g];
  return `<section class="overview" aria-label="Resumen nutricional estimado del día">${keys.map((k,i)=>`<div class="stat ${i===0?'energy':''}"><div class="stat-name">${['Energía','Proteínas','Carbohidratos','Grasas'][i]}</div><div class="stat-value">${fmt(t[k])}<span>${i===0?'kcal':'g'}</span></div><div class="bar" aria-hidden="true"><span style="width:${Math.min(t[k]/goals[i]*100,100)}%"></span></div><div class="stat-note">de ${fmt(goals[i])} ${i===0?'kcal':'g'} orientativos</div></div>`).join('')}</section>`;
}
function referenceGuide(){
  const [proteinMin,proteinMax]=config.carne_pescado_referencia_g;
  return `<div class="reference-content"><section class="reference-meal">${plate()}<p>${config.verdura_comida_g} g de verduras · Proteína · Guarnición de carbohidrato.</p><p>Guarnición de carbohidrato: ${config.carbohidrato_comida_alimento_g} g de alimento en total, según el estado indicado en tu lista. No son ${config.carbohidrato_comida_alimento_g} g del nutriente carbohidratos.</p></section><section class="reference-meal">${plate(true)}<p>${config.verdura_cena_g} g de verduras y proteína. Sin guarnición de cereales ni tubérculos.</p></section><section class="reference-rules"><h3>Las pautas de tu día</h3><ul><li><strong>Fruta: máximo ${config.frutas_max_raciones} raciones al día.</strong> Cada entrada de fruta cuenta como una ración; no hay equivalencia de peso definida.</li><li>Carne o pescado: referencia de ${proteinMin}–${proteinMax} g en crudo por comida, cuando aplique.</li><li>Merienda de la tarde ${config.merienda_tarde_obligatoria?'obligatoria':'opcional'}.</li><li>Objetivos diarios orientativos: ${fmt(config.energia_kcal)} kcal · ${fmt(config.proteina_g)} g de proteínas · ${fmt(config.carbohidratos_g)} g de carbohidratos · ${fmt(config.grasa_g)} g de grasas.</li><li>Respeta el estado indicado en cada alimento: crudo, seco o listo para consumir. No se convierten automáticamente pesos.</li><li>Solo alimentos autorizados. Valores nutricionales sin verificación externa.</li></ul><p class="guide-note">Los diagramas representan proporciones orientativas, no equivalencias exactas de peso.</p></section></div>`;
}
function mealWarnings(m){
  return mealGuidelines(meals,m,foods,config).map(message=>`<p class="meal-hint">${esc(message)}</p>`).join('');
}
function warnings(){return saveFailed?'<p class="save-error" role="alert">No se han guardado los últimos cambios. Mantén esta pestaña abierta.</p>':'';}
function mealEnergy(m){return `${fmt(total(meals[m],foods).kcal)} kcal`;}
function mealGroups(m){
  const groups=['Comida','Cena'].includes(m)?['verdura','proteina',...(m==='Comida'?['carbohidrato']:[]),'grasa']:['proteina','carbohidrato','grasa','fruta'];
  return `<div class="meal-groups" aria-label="Añadir alimentos a ${m}">${groups.map(id=>`<button class="group-shortcut" data-add="${m}" data-group="${id}" aria-expanded="false" aria-controls="composer-${mealNames.indexOf(m)}">${icon('plus')}${shortGroups[id]}</button>`).join('')}<button class="group-shortcut more-groups" data-add="${m}" data-group="lacteos" aria-expanded="false" aria-controls="composer-${mealNames.indexOf(m)}">Más</button></div>`;
}
function foodRows(m){return meals[m].map(item=>{const f=foods.find(f=>f.id===item.id);return `<div class="food-row" data-row="${item.key}"><div class="food-name">${esc(f.nombre)}<small>${esc(f.estado_referencia)} · <span data-item-energy="${item.key}">${fmt(nutrients(f,item.grams).kcal)} kcal</span></small></div><label class="quantity-control"><input class="grams" type="number" inputmode="decimal" min="1" max="10000" step="any" value="${item.grams}" data-grams="${item.key}" aria-label="Cantidad de ${esc(f.nombre)} en ${foodUnit(f)}"><span>${foodUnit(f)}</span></label><button class="remove icon-button" data-remove="${item.key}" aria-label="Eliminar ${esc(f.nombre)}">${icon('trash')}</button></div>`;}).join('');}
function renderPlan(){
  ++composerVersion;composer=null;
  $('#content').innerHTML=`<div id="daily-overview">${overview()}</div><div class="section-heading meals-heading"><div><h2>Tus comidas</h2></div></div><section class="meal-sheet" aria-label="Comidas del día">${mealNames.map((m,index)=>`<article class="meal" data-meal="${m}" aria-labelledby="meal-${index}"><div class="meal-head"><span class="meal-icon">${icon(mealMeta[index][0])}</span><div class="meal-title"><h3 id="meal-${index}">${m}</h3><small>${mealMeta[index][1]}</small><span class="meal-total">${mealEnergy(m)}</span></div></div><div class="meal-body"><div data-food-list="${m}">${foodRows(m)}</div><div data-meal-groups="${m}">${mealGroups(m)}</div><div id="composer-${index}" class="inline-composer" hidden></div><div data-hint="${m}">${mealWarnings(m)}</div></div></article>`).join('')}</section><div id="save-status">${warnings()}</div><details class="plate-reference"><summary><span>${icon('plate')} Tu plato de referencia</span><span aria-hidden="true">+</span></summary>${referenceGuide()}</details>`;
  $('#content').querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>openComposer(b.dataset.add,b.dataset.group));
  for(const m of mealNames)bindFoodRows(m);
}
function bindFoodRows(m){
  const list=document.querySelector(`[data-food-list="${m}"]`);
  list.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{
    meals[m]=meals[m].filter(i=>i.key!==b.dataset.remove);persist();updateMeal(m);
    document.querySelector(`[data-add="${m}"]`).focus();toast('Alimento eliminado.');
  });
  list.querySelectorAll('[data-grams]').forEach(input=>{
    input.oninput=()=>input.setCustomValidity('');
    input.onchange=()=>{
      const grams=Number(input.value);
      if(!Number.isFinite(grams)||grams<1||grams>10000){input.setCustomValidity('Introduce una cantidad entre 1 y 10.000.');input.reportValidity();return;}
      input.setCustomValidity('');
      const item=meals[m].find(i=>i.key===input.dataset.grams);item.grams=grams;
      const f=foods.find(f=>f.id===item.id);document.querySelector(`[data-item-energy="${item.key}"]`).textContent=`${fmt(nutrients(f,grams).kcal)} kcal`;
      persist();refreshTotals();
    };
  });
}
function updateMeal(m){
  document.querySelector(`[data-food-list="${m}"]`).innerHTML=foodRows(m);
  bindFoodRows(m);refreshTotals();
}
function closeComposer(focus=true){
  if(!composer)return;
  const old=composer;composer=null;++composerVersion;
  const panel=$('#composer-'+mealNames.indexOf(old.meal));if(panel){panel.hidden=true;panel.innerHTML='';}
  const shortcuts=document.querySelector(`[data-meal-groups="${old.meal}"]`);if(shortcuts){shortcuts.hidden=false;shortcuts.querySelectorAll('[data-add]').forEach(b=>b.setAttribute('aria-expanded','false'));}
  if(focus)document.querySelector(`[data-add="${old.meal}"][data-group="${old.group}"]`)?.focus();
}
document.addEventListener('click',event=>{
  if(composer){
    const panel=$('#composer-'+mealNames.indexOf(composer.meal));
    if(panel&&!panel.contains(event.target))closeComposer(false);
  }
  document.querySelectorAll('.meal details[open]').forEach(details=>{
    if(!details.contains(event.target))details.open=false;
  });
},true);
function openComposer(meal,group){
  closeComposer(false);composer={meal,group,page:1};
  const panel=$('#composer-'+mealNames.indexOf(meal));panel.hidden=false;
  const shortcuts=document.querySelector(`[data-meal-groups="${meal}"]`);shortcuts.querySelectorAll('[data-add]').forEach(b=>b.setAttribute('aria-expanded','true'));shortcuts.hidden=true;
  panel.innerHTML=`<div class="composer-top"><div class="composer-groups" role="group" aria-label="Grupo de alimentos">${catalog.grupos.filter(g=>!(meal==='Cena'&&g.id==='carbohidrato')).map(g=>`<button class="composer-tab ${g.id===group?'selected':''}" data-composer-group="${g.id}" aria-pressed="${g.id===group}">${shortGroups[g.id]}</button>`).join('')}</div><button class="composer-done" type="button">Listo <span aria-hidden="true">✓</span></button></div><label class="search composer-search"><span aria-hidden="true">⌕</span><input id="inline-search" type="search" autocomplete="off" placeholder="Buscar en ${shortGroups[group].toLowerCase()}…" aria-label="Buscar en el grupo seleccionado"></label><div id="inline-message" role="status"></div><div id="inline-results"></div>`;
  panel.querySelector('.composer-done').onclick=()=>closeComposer();
  panel.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();closeComposer();}};
  panel.querySelectorAll('[data-composer-group]').forEach(b=>b.onclick=()=>{
    composer.group=b.dataset.composerGroup;composer.page=1;$('#inline-search').value='';$('#inline-search').placeholder=`Buscar en ${shortGroups[composer.group].toLowerCase()}…`;
    panel.querySelectorAll('[data-composer-group]').forEach(tab=>{tab.classList.toggle('selected',tab===b);tab.setAttribute('aria-pressed',String(tab===b));});
    renderInlineResults();
  });
  let searchTimer;
  $('#inline-search').oninput=()=>{clearTimeout(searchTimer);++composerVersion;searchTimer=setTimeout(()=>{if(composer)renderInlineResults();},160);};
  renderInlineResults();
  panel.querySelector(`[data-composer-group="${group}"]`).focus();
}
function selectionRow(f){
  const grams=defaultPortion(f,composer.meal,meals,foods,config);
  return `<div class="selection-row"><div class="selection-name"><strong>${esc(f.nombre)}</strong><small>${f.ruta_categorias?esc(foodCategory(f))+' · ':''}${esc(f.estado_referencia)} · ${fmt(per100(f,'kcal'))} kcal / 100 ${foodUnit(f)}</small></div><label class="quantity-control"><input type="number" inputmode="decimal" min="1" max="10000" step="any" value="${grams}" data-portion="${f.id}" aria-label="Cantidad de ${esc(f.nombre)} en ${foodUnit(f)} antes de añadir"><span>${foodUnit(f)}</span></label><button class="quick-add" type="button" data-inline-food="${f.id}" aria-label="Añadir ${esc(f.nombre)}">${icon('plus')}</button></div>`;
}
async function renderInlineResults(page=1){
  if(!composer)return;
  const version=++composerVersion,current=composer;current.page=page;
  $('#inline-message').textContent='';$('#inline-results').setAttribute('aria-busy','true');
  try{
    const data=await queryFoods(current.group,$('#inline-search').value,page,current.meal);
    if(version!==composerVersion||composer!==current)return;
    remember(data.alimentos);
    $('#inline-results').innerHTML=data.alimentos.length?data.alimentos.map(selectionRow).join('')+pagination(data):'<p class="empty">No incluido en la lista de tu nutricionista</p>';
    $('#inline-results').setAttribute('aria-busy','false');
    $('#inline-results').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>renderInlineResults(Number(b.dataset.page)));
    $('#inline-results').querySelectorAll('[data-inline-food]').forEach(b=>b.onclick=()=>{
      if(version!==composerVersion||composer!==current)return;
      const food=foods.find(f=>f.id===b.dataset.inlineFood),input=document.querySelector(`[data-portion="${food.id}"]`);
      input.required=true;if(!input.reportValidity())return;
      const error=canAdd(meals,current.meal,food,foods,config.frutas_max_raciones);
      if(error){$('#inline-message').textContent=error;return;}
      meals[current.meal].push({id:food.id,grams:Number(input.value),key:crypto.randomUUID()});persist();updateMeal(current.meal);
      b.classList.add('just-added');b.innerHTML='<span aria-hidden="true">✓</span>';b.setAttribute('aria-label',`${food.nombre} añadido. Añadir otra ración`);toast(`${food.nombre} añadido a ${current.meal.toLowerCase()}.`);
      setTimeout(()=>{if(b.isConnected){b.classList.remove('just-added');b.innerHTML=icon('plus');b.setAttribute('aria-label',`Añadir ${food.nombre}`);}},1200);
    });
  }catch{if(version===composerVersion&&composer===current){$('#inline-results').setAttribute('aria-busy','false');$('#inline-results').innerHTML='<p class="error" role="alert">No se han podido consultar los alimentos. <button class="retry-inline">Reintentar</button></p>';$('.retry-inline').onclick=()=>renderInlineResults(page);}}
}
function refreshTotals(){
  $('#daily-overview').innerHTML=overview();
  document.querySelectorAll('[data-meal]').forEach(article=>article.querySelector('.meal-total').textContent=mealEnergy(article.dataset.meal));
  document.querySelectorAll('[data-hint]').forEach(el=>el.innerHTML=mealWarnings(el.dataset.hint));
  $('#save-status').innerHTML=warnings();

}
function foodCategory(food){return food.ruta_categorias ? food.ruta_categorias.join(' → ') : labels[food.categoria];}
function resultHtml(f){return `<div class="result"><span class="food-category-icon" aria-hidden="true">${icon(f.categoria==='lacteos'?'cup':['carne','pescado_marisco','huevos'].includes(f.categoria)?'plate':'sun')}</span><div class="result-info"><strong>${esc(f.nombre)}</strong><small>${esc(foodCategory(f))} · ${esc(f.estado_referencia)}</small><details><summary>${fmt(per100(f,'kcal'))} kcal / 100 ${foodUnit(f)} · Ver detalles</summary><div class="nutrition-detail"><p>Por 100 ${foodUnit(f)}: P ${fmt(per100(f,'proteinas'))} g · C ${fmt(per100(f,'carbohidratos'))} g · G ${fmt(per100(f,'grasas'))} g.</p>${per100(f,'azucares')!==undefined?`<p>Azúcares (lactosa): ${fmt(per100(f,'azucares'))} g · Fibra: ${fmt(per100(f,'fibra'))} g.</p>`:''}<p>${esc(f.fuente)}<br>${f.verificado?'Verificado':'Sin verificación externa'} · ${esc(f.estado_referencia)}</p></div></details></div></div>`;}
function options(meal=''){return '<option value="">Elegir otro grupo…</option>'+catalog.grupos.filter(g=>!(meal==='Cena'&&g.id==='carbohidrato')).map(g=>`<option value="${g.id}">${esc(g.nombre)}</option>`).join('');}
function groupCards(meal=''){return `<div class="group-grid">${catalog.grupos.filter(g=>!(meal==='Cena'&&g.id==='carbohidrato')).map(g=>`<button class="group-card" data-select-group="${g.id}">${icon(groupIcons[g.id])}<span><strong>${esc(g.nombre)}</strong><small>${esc(g.descripcion)}</small></span><span class="group-count">${g.cantidad}<span class="sr-only"> alimentos</span></span></button>`).join('')}</div><p class="guide-note">Estos grupos organizan tu lista; no son equivalencias ni raciones obligatorias. Las legumbres y derivados pueden aportar varios nutrientes.</p>${meal==='Cena'?'<p class="meal-hint">Cena: verduras y proteína, sin guarnición de cereales ni tubérculos.</p>':''}`;}
function pagination(data){return data.paginas>1?`<div class="pagination" aria-label="Páginas de alimentos"><button class="page-button" data-page="${data.pagina-1}" ${data.pagina<=1?'disabled':''}>Anterior</button><span>Página ${data.pagina} de ${data.paginas}</span><button class="page-button" data-page="${data.pagina+1}" ${data.pagina>=data.paginas?'disabled':''}>Siguiente</button></div>`:'';}
function queryFoods(group,q='',page=1,meal=''){return api('/api/alimentos?'+new URLSearchParams({grupo:group,q,pagina:page,comida:meal}));}
function renderCatalog(){
  ++catalogVersion;
  $('#content').innerHTML=`<section class="catalog-panel"><div class="section-heading"><h2>Elige un grupo</h2><span class="small-tag">${catalog.total} alimentos autorizados</span></div><p class="catalog-intro">Lo que necesitas, sin salir de tu lista.</p><div id="catalog-controls" hidden><label class="filter-label"><span class="sr-only">Grupo de alimentos</span><select id="catalog-category">${options()}</select></label><label class="search"><span aria-hidden="true">⌕</span><input type="search" id="catalog-search" aria-label="Buscar en este grupo" placeholder="Buscar en este grupo…"></label></div><div id="catalog-results">${groupCards()}</div><p class="guide-note">Solo tu lista autorizada. Los alimentos pendientes de autorización no aparecen.</p></section>`;
  const selectGroup=id=>{$('#catalog-category').value=id;$('#catalog-search').value='';update();};
  const bindGroups=()=>$('#catalog-results').querySelectorAll('[data-select-group]').forEach(b=>b.onclick=()=>selectGroup(b.dataset.selectGroup));
  const update=async(page=1)=>{
    const version=++catalogVersion,group=$('#catalog-category').value;
    $('#catalog-controls').hidden=!group;
    if(!group){$('#catalog-results').innerHTML=groupCards();bindGroups();return;}
    $('#catalog-results').innerHTML='<p class="loading" role="status">Consultando alimentos…</p>';
    try{const data=await queryFoods(group,$('#catalog-search').value,page);if(version!==catalogVersion||view!=='catalog')return;remember(data.alimentos);
      $('#catalog-results').innerHTML=`<p class="result-count">${data.total} alimentos en este grupo</p><div class="catalog-grid">${data.alimentos.length?data.alimentos.map(f=>resultHtml(f)).join(''):'<p class="empty">No incluido en la lista de tu nutricionista</p>'}</div>${pagination(data)}`;
      $('#catalog-results').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>update(Number(b.dataset.page)));
    }catch{if(version===catalogVersion)$('#catalog-results').innerHTML='<p class="error" role="alert">No se ha podido consultar la base de datos. Cambia de grupo para reintentar.</p>';}
  };
  $('#catalog-category').onchange=()=>{$('#catalog-search').value='';update();};
  $('#catalog-search').oninput=()=>update();bindGroups();
}
function setView(next){closeComposer(false);view=next;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});({plan:renderPlan,catalog:renderCatalog})[view]();}
async function init(){
  try{
    catalog=await api('/api/catalogo');config=catalog.configuracion;
    await load();
    document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
    $('#date').onchange=()=>persistDateChange($('#date').value||localDate());
    $('#previous-day').onclick=()=>changeDay(-1);$('#next-day').onclick=()=>changeDay(1);
    $('#today').onclick=()=>persistDateChange(localDate());
    $('.brand').onclick=e=>{e.preventDefault();setView('plan');};
    setView('plan');$('#content').setAttribute('aria-busy','false');
  }catch{$('#content').setAttribute('aria-busy','false');$('#content').innerHTML='<p class="error" role="alert">No se ha podido cargar la base de datos. Inicia la aplicación con «npm run dev» y recarga la página.</p>';}
}
async function persistDateChange(value){
  closeComposer(false);
  $('#date').value=value;$('#content').setAttribute('aria-busy','true');
  $('#content').innerHTML='<p class="loading" role="status">Cargando este día…</p>';
  try{if(await load()){setView(view);$('#content').setAttribute('aria-busy','false');}}
  catch{$('#content').setAttribute('aria-busy','false');$('#content').innerHTML='<p class="error" role="alert">No se ha podido recuperar este día. Vuelve a seleccionar la fecha para reintentar.</p>';}
}
function changeDay(offset){const d=new Date($('#date').value+'T12:00:00');d.setDate(d.getDate()+offset);persistDateChange(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);}
init();
