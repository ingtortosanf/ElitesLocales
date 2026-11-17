import { CONFIG } from './config.js';
import { FICHAS } from './fichas.js';

const $ = (id) => document.getElementById(id);
const hasSupabase = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && window.supabase);
const db = hasSupabase ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey) : null;
const map = L.map('map', { zoomControl: false, scrollWheelZoom: true }).setView([-21.5, -65.2], 5);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community', maxZoom: 19 }).addTo(map);
let selectedLayer = null;
let selectedFeature = null;
const layers = {};   // clave de capa -> L.geoJSON
const layerCounts = {};
// Cada capa tiene sus propios controles en la barra lateral.
const LAYER_UI = {
  territorio:  { toggle: 'territory-toggle', slider: 'territory-opacity', output: 'territory-value' },
  gobernacion: { toggle: 'gob-toggle',       slider: 'gob-opacity',       output: 'gob-value' },
  audiencia:   { toggle: 'aud-toggle',       slider: 'aud-opacity',       output: 'aud-value' },
  puntos:      { toggle: 'points-toggle',    slider: 'points-opacity',    output: 'points-value' }
};
// Colores de las capas de polígonos y orden de apilado (el territorio queda debajo).
const LAYER_COLORS = { audiencia: '#2f6fb0', gobernacion: '#3f9a4a' };
const LAYER_PANE = { territorio: 'pane-territorio', audiencia: 'pane-audiencia', gobernacion: 'pane-gobernacion' };
Object.values(LAYER_PANE).forEach((name, i) => { map.createPane(name).style.zIndex = 410 + i * 5; });
// Capa de puntos: el ícono depende del campo "tipoid" de cada punto.
const POINT_TYPES = {
  capital: { label: 'Capital',           color: '#d4a017', glyph: '<polygon points="12,3 14.6,9 21,9.5 16,13.8 17.6,20 12,16.6 6.4,20 8,13.8 3,9.5 9.4,9"/>' },
  ciudad:  { label: 'Ciudad / pueblo',            color: '#1f2a30', glyph: '<path d="M3 11 12 3l9 8v10H3z"/>' },
  mineria: { label: 'Lugar de minería',  color: '#7b4fa3', glyph: '<path d="M4 10c4-6 12-6 16 0" fill="none" stroke-width="2.4"/><path d="M12 6v15" fill="none" stroke-width="2.4"/>' },
  otro:    { label: 'Otro',              color: '#6f716b', glyph: '<circle cx="12" cy="12" r="4"/>' }
};
const norm = (v='') => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function pointCategory(p) {
  const key = Object.keys(p).find(k => norm(k).replace(/[_\s]/g, '') === 'tipoid');
  const v = norm(key ? p[key] : (p.categoria || ''));
  if (POINT_TYPES[v]) return v;
  if (v.startsWith('capital')) return 'capital';
  if (v.startsWith('miner') || v.startsWith('mina') || v.startsWith('asiento')) return 'mineria';
  if (/^(ciudad|subciudad|villa|pueblo)/.test(v)) return 'ciudad';
  return 'otro';
}
const LAYER_LABEL = { territorio: 'Distribución territorial', audiencia: 'Real Audiencia', gobernacion: 'Gobernación del Tucumán', puntos: 'Lugar' };
const TYPE_LABEL = { territorio: 'Territorio', poder: 'Espacio de poder', punto: 'Lugar (punto)' };
const FICHA_LABEL = { territorio: 'FICHA · TERRITORIO', poder: 'FICHA · ESPACIO DE PODER', punto: 'FICHA · LUGAR' };
const isSelected = (f) => Boolean(selectedFeature) && featureId(selectedFeature.properties) === featureId(f.properties || {});
function pointIcon(feature, selected = false) {
  const p = feature.properties || {};
  const cat = pointCategory(p);
  const t = POINT_TYPES[cat];
  // Solo las capitales llevan etiqueta con el nombre.
  const label = cat === 'capital' ? `<span class="pt-label">${esc(featureName(p))}</span>` : '';
  return L.divIcon({ className: 'pt-marker', iconSize: [15, 15], iconAnchor: [7.5, 7.5], popupAnchor: [0, -8],
    html: `<div class="pt-badge${selected ? ' selected' : ''}" style="background:${t.color}"><svg viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${t.glyph}</svg></div>${label}` });
}
let session = null;
let activeAdminTab = 'fichas';
const featureIndex = new Map();
const colors = { territorio: '#71816e', poder: '#b76d4d' };

function esc(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function featureName(p) { return p.display_name || p.Nombre || p.Nombre_poder || p.nombre || p.id_territorio || p.id_poder || p.id_punto || 'Entidad sin denominación'; }
function featureId(p) { return p.entity_id || p.id_territorio || p.id_poder || p.id_punto || ''; }
const territoryPalette = ['#fee0d2','#fcbba1','#fc9272','#fb6a4a','#ef3b2c','#cb181d','#a50f15','#67000d'];
const territoryColor = new Map();

function pastelFor(id) {
  if (!territoryColor.has(id)) territoryColor.set(id, territoryPalette[territoryColor.size % territoryPalette.length]);
  return territoryColor.get(id);
}
function styleFeature(feature) {
  const p = feature.properties || {};
  const id = featureId(p);
  const key = p.layer_key;
  const selected = isSelected(feature);
  const slider = Number($(LAYER_UI[key].slider).value) / 100;
  const isTer = key === 'territorio';
  return {
    pane: LAYER_PANE[key],
    color: selected ? '#a65f43' : (isTer ? '#2a0a08' : '#ffffff'),
    weight: selected ? 4 : (isTer ? 1.5 : 2),
    opacity: 1,
    fillColor: isTer ? pastelFor(id) : LAYER_COLORS[key],
    fillOpacity: selected ? Math.min(1, slider * .8 + .15) : slider * .8
  };
}
function restyle(layer, feature) {
  if (!layer || !feature) return;
  if (feature.properties.layer_key === 'puntos') layer.setIcon(pointIcon(feature, isSelected(feature)));
  else if (layer.setStyle) layer.setStyle(styleFeature(feature));
}
function bindFeature(feature, layer, type) {
  const p = feature.properties || {};
  const label = p.layer_key === 'puntos' ? POINT_TYPES[pointCategory(p)].label : LAYER_LABEL[p.layer_key];
  layer.bindPopup(`<div class="popup-type">${esc(label)}</div><div class="popup-title">${esc(featureName(p))}</div><div>${esc(featureId(p))}</div><button class="popup-open" data-feature-id="${esc(featureId(p))}" data-feature-type="${type}">VER FICHA →</button>`);
  layer.on('click', () => selectFeature(feature, layer, type));
}
function selectFeature(feature, layer, type) {
  const previous = selectedLayer, previousFeature = selectedFeature;
  selectedFeature = feature; selectedLayer = layer;
  restyle(previous, previousFeature);
  restyle(layer, feature);
  renderDetail(feature, type);
}
function setLayerOpacity(layer, key) {
  if (!layer) return;
  if (key === 'puntos') {
    const o = Math.max(.25, Number($(LAYER_UI.puntos.slider).value) / 100);
    layer.eachLayer(m => { m.setIcon(pointIcon(m.feature, isSelected(m.feature))); m.setOpacity(o); });
  } else layer.setStyle(f => styleFeature(f));
}
function openDetail() { $('detail-panel').classList.add('open'); $('detail-panel').setAttribute('aria-hidden','false'); }
function closeDetail() { $('detail-panel').classList.remove('open'); $('detail-panel').setAttribute('aria-hidden','true'); }

async function getEntityDetail(id, type) {
  if (!db) return null;
  const { data, error } = await db.from('entity_fiches').select('*').eq('geo_id', id).eq('entity_type', type).eq('published', true).maybeSingle();
  if (error) { console.warn(error); return null; }
  return data;
}
async function getRelated(table, foreignKey, id, select='*') {
  if (!db) return [];
  const { data, error } = await db.from(table).select(select).eq(foreignKey, id);
  if (error) { console.warn(error); return []; }
  return data || [];
}
function fichaHtml(text) { return String(text || '').split(/\n{2,}/).map(t => `<p>${esc(t).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\[(\d+)\]/g,'<sup>[$1]</sup>').replace(/\n/g,'<br>')}</p>`).join(''); }
async function renderDetail(feature, type) {
  const p = feature.properties || {};
  const id = featureId(p);
  const local = FICHAS[id];
  $('detail-type').textContent = FICHA_LABEL[type] || 'FICHA HISTÓRICA';
  $('detail-content').innerHTML = `<div class="entity-id">${esc(id)}</div><h3>${esc(local?.name || featureName(p))}</h3><div class="detail-period">${esc(local?.period || 'Espacio histórico de Charcas · Siglo XVII')}</div><p class="empty-state">${db ? 'Consultando ficha documental…' : 'La geometría está disponible. La ficha documental se completará cuando se configure la base de datos.'}</p>`;
  openDetail();
  const entity = await getEntityDetail(id, type);
  if (!entity) {
    $('detail-content').innerHTML = `<div class="entity-id">${esc(id)}</div><h3>${esc(local?.name || featureName(p))}</h3><div class="detail-period">${esc(local?.period || 'Espacio histórico de Charcas · Siglo XVII')}</div><h4>Descripción histórica</h4>${local ? `<div class="ficha-body">${fichaHtml(local.description)}</div>` : `<p>${db ? 'Todavía no se ha publicado una ficha documental para esta entidad.' : 'Esta entidad procede de la capa geográfica. Para mostrar descripciones, personajes, acontecimientos y fuentes, conectá el proyecto con Supabase y cargá su ficha desde Administración.'}</p>`}<h4>Identificación cartográfica</h4><p>Identificador: ${esc(id)}<br>Tipo: ${TYPE_LABEL[type] || type}${p.Titulo ? `<br>Categoría: ${esc(p.Titulo)}` : ''}</p>`;
    return;
  }
  const [people, events, sources, relations] = await Promise.all([
    getRelated('entity_people','geo_id',id,'person_id,relationship,evidence,people(id,full_name,biography,person_offices(start_date,end_date,institution_context,offices(name,institution)))'),
    getRelated('entity_events','geo_id',id,'event_id,relationship,evidence,events(id,title,event_date,description)'),
    getRelated('entity_sources','geo_id',id,'source_id,source_role,sources(id,citation,url)'),
    getRelated('entity_relations','source_geo_id',id,'relation_type,description,target_geo_id')
  ]);
  const list = (items, render) => items.length ? `<ul class="detail-list">${items.map(render).join('')}</ul>` : '<p class="muted">Sin registros asociados publicados.</p>';
  $('detail-content').innerHTML = `<div class="entity-id">${esc(id)}</div><h3>${esc(entity.name || local?.name || featureName(p))}</h3><div class="detail-period">${esc(entity.period || local?.period || 'Siglo XVII')}</div><h4>Descripción histórica</h4><div class="ficha-body">${fichaHtml(entity.description || local?.description || 'Sin descripción incorporada.')}</div><h4>Personas vinculadas</h4>${list(people,x=>`<li><strong>${esc(x.people?.full_name || 'Persona')}</strong>${x.people?.biography?`<br>${esc(x.people.biography)}`:''}${x.people?.person_offices?.length?`<br><em>Trayectoria:</em> ${x.people.person_offices.map(po=>esc(po.offices?.name||'Cargo')+(po.institution_context?' · '+esc(po.institution_context):'')+(po.start_date?' ('+esc(po.start_date):'')+(po.end_date?'–'+esc(po.end_date)+')':po.start_date?')':'')).join('; ')}`:''}</li>`)}<h4>Acontecimientos</h4>${list(events,x=>`<li><strong>${esc(x.events?.title || 'Acontecimiento')}</strong>${x.events?.event_date?` · ${esc(x.events.event_date)}`:''}${x.events?.description?`<br>${esc(x.events.description)}`:''}</li>`)}<h4>Fuentes documentales</h4>${list(sources,x=>`<li>${x.sources?.url?`<a href="${esc(x.sources.url)}" target="_blank" rel="noopener">${esc(x.sources.citation || 'Consultar fuente')}</a>`:esc(x.sources?.citation || 'Fuente')}</li>`)}<h4>Relaciones documentadas</h4>${list(relations,x=>`<li><strong>${esc(x.relation_type)}</strong>${x.target_geo_id?` · ${esc(x.target_geo_id)}`:''}${x.description?`<br>${esc(x.description)}`:''}</li>`)}`;
}

async function fetchGeoJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`No se pudo cargar ${path} (${response.status})`);
  return response.json();
}
function buildLayer(features, layerKey, type) {
  features.forEach(f => { f.properties = f.properties || {}; f.properties.entity_type = type; f.properties.layer_key = layerKey; featureIndex.set(featureId(f.properties), f); });
  const options = { style: f => styleFeature(f), onEachFeature: (f,l) => bindFeature(f,l,type) };
  if (layerKey === 'puntos') options.pointToLayer = (f, latlng) => L.marker(latlng, { icon: pointIcon(f), keyboard: true, title: featureName(f.properties) });
  const layer = L.geoJSON({ type: 'FeatureCollection', features }, options).addTo(map);
  layers[layerKey] = layer; layerCounts[layerKey] = features.length;
  return layer;
}
function refreshLayers() {
  Object.entries(layers).forEach(([key, layer]) => {
    const on = $(LAYER_UI[key].toggle).checked;
    if (on && !map.hasLayer(layer)) layer.addTo(map);
    if (!on && map.hasLayer(layer)) map.removeLayer(layer);
    setLayerOpacity(layer, key);
  });
}
async function initMap() {
  try {
    const [t, au, go] = await Promise.all([
      fetchGeoJSON('./public/data/territorios.geojson'),
      fetchGeoJSON('./public/data/real_audiencia.geojson'),
      fetchGeoJSON('./public/data/tucuman.geojson')
    ]);
    buildLayer(t.features, 'territorio', 'territorio');
    buildLayer(au.features, 'audiencia', 'poder');
    buildLayer(go.features, 'gobernacion', 'poder');
    // La capa de puntos es opcional: si el archivo todavía no existe, el resto del mapa funciona igual.
    try { const pt = await fetchGeoJSON('./public/data/puntos.geojson'); buildLayer(pt.features, 'puntos', 'punto'); } catch (e) { console.warn(e); layerCounts.puntos = 0; }
    refreshLayers();
    $('map-status').textContent = `${layerCounts.territorio} territorios · ${layerCounts.gobernacion + layerCounts.audiencia} espacios de poder · ${layerCounts.puntos || 0} puntos`;
  } catch (e) { console.error(e); $('map-status').textContent = 'No se pudieron cargar los datos. Revisá la carpeta public/data.'; }
}

Object.entries(LAYER_UI).forEach(([key, ui]) => {
  $(ui.toggle).addEventListener('change', refreshLayers);
  $(ui.slider).addEventListener('input', e => { $(ui.output).value = `${e.target.value}%`; setLayerOpacity(layers[key], key); });
});
$('reset-map').addEventListener('click',()=>map.setView([-21.5,-65.2],5));
$('detail-close').addEventListener('click',closeDetail);
$('map').addEventListener('click',e=>{const b=e.target.closest('.popup-open'); if(!b)return; const f=featureIndex.get(b.dataset.featureId); if(f) renderDetail(f,b.dataset.featureType);});
$('menu-toggle').addEventListener('click',()=>$('main-nav')?.classList.toggle('open'));

// Admin panel: CRUD de fichas, personas, acontecimientos, fuentes y relaciones.
const adminModal=$('admin-modal');
function showAdmin(){adminModal.classList.remove('hidden');document.body.style.overflow='hidden';}
function hideAdmin(){adminModal.classList.add('hidden');document.body.style.overflow='';}
$('admin-open')?.addEventListener('click',showAdmin); $('admin-close').addEventListener('click',hideAdmin);
adminModal.addEventListener('click',e=>{if(e.target.dataset.close)hideAdmin();});
function authState(s){session=s;$('admin-auth').classList.toggle('hidden',!!s);$('admin-workspace').classList.toggle('hidden',!s);if(s){$('admin-user').textContent=s.user.email||'Sesión autenticada';renderAdminTab(activeAdminTab);}}
if(db){db.auth.getSession().then(({data})=>authState(data.session));db.auth.onAuthStateChange((_event,s)=>authState(s));}
else {$('login-message').textContent='Configuración pendiente: completá SUPABASE_URL y SUPABASE_ANON_KEY en src/config.js.';$('login-form').querySelector('button').disabled=true;}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();if(!db)return;$('login-message').textContent='Verificando…';const {error}=await db.auth.signInWithPassword({email:$('login-email').value,password:$('login-password').value});$('login-message').textContent=error?error.message:'Acceso correcto.';});
$('logout-button').addEventListener('click',async()=>{if(db)await db.auth.signOut();authState(null);});
document.querySelectorAll('.admin-tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.admin-tab').forEach(x=>x.classList.toggle('active',x===b));activeAdminTab=b.dataset.tab;renderAdminTab(activeAdminTab);}));
const adminDefinitions={
 fichas:{table:'entity_fiches',title:'Fichas históricas',fields:[['geo_id','ID geográfico (TER-0001 / POD-0001)','text'],['entity_type','Tipo (territorio o poder)','text'],['name','Nombre','text'],['period','Período','text'],['description','Descripción histórica','textarea'],['published','Publicar','checkbox']]},
 personas:{table:'people',title:'Personas',fields:[['full_name','Nombre completo','text'],['biography','Biografía','textarea'],['notes','Notas','textarea'],['published','Publicar','checkbox']]},
 eventos:{table:'events',title:'Acontecimientos',fields:[['title','Título','text'],['event_date','Fecha / período','text'],['description','Descripción','textarea'],['published','Publicar','checkbox']]},
 cargos:{table:'offices',title:'Cargos e instituciones',fields:[['name','Denominación del cargo','text'],['institution','Institución','text'],['description','Descripción / contexto','textarea'],['published','Publicar','checkbox']]},
 fuentes:{table:'sources',title:'Fuentes',fields:[['citation','Referencia bibliográfica / documental','textarea'],['url','URL','url'],['notes','Notas','textarea'],['published','Publicar','checkbox']]},
 relaciones:{table:'entity_relations',title:'Relaciones documentadas',fields:[['source_geo_id','ID geográfico de origen','text'],['target_geo_id','ID geográfico de destino','text'],['relation_type','Tipo de relación','text'],['description','Fundamento documental / descripción','textarea'],['source_reference','Referencia de respaldo','textarea'],['published','Publicar','checkbox']]}
};
async function renderAdminTab(tab){
  const def=adminDefinitions[tab]; const host=$('admin-panel');
  if(!db||!session){host.innerHTML='<p class="muted">Iniciá sesión para continuar.</p>';return;}
  host.innerHTML=`<h3>${esc(def.title)}</h3><form class="admin-editor" id="record-form"><input type="hidden" name="record_id">${def.fields.map(([key,label,type])=>`<label>${esc(label)}${type==='textarea'?`<textarea name="${key}"></textarea>`:type==='checkbox'?`<input type="checkbox" name="${key}" ${key==='published'?'checked':''}>`:`<input type="${type}" name="${key}">`}</label>`).join('')}<div class="hero-actions"><button class="button primary" type="submit">Guardar registro</button><button class="subtle-button" id="cancel-edit" type="button">Limpiar formulario</button></div><p id="record-message" class="form-message" aria-live="polite"></p></form>${tab==='relaciones'?`<div class="admin-records"><h3>Vincular personas, acontecimientos o fuentes</h3><form id="link-form" class="admin-editor"><label>Entidad geográfica<input name="geo_id" placeholder="TER-0001 o POD-0001" required></label><label>Tipo de vínculo<select name="link_type"><option value="person">Persona</option><option value="event">Acontecimiento</option><option value="source">Fuente</option></select></label><label>ID del registro relacionado<input name="related_id" placeholder="UUID del registro" required></label><label>Tipo de relación / función<input name="relationship" placeholder="Ej.: autoridad, participación, referencia"></label><label>Fundamento documental<textarea name="evidence"></textarea></label><button class="button primary" type="submit">Crear vínculo</button><p id="link-message" class="form-message" aria-live="polite"></p></form><h3>Registrar cargo en la trayectoria de una persona</h3><form id="office-link-form" class="admin-editor"><label>ID de persona (UUID)<input name="person_id" required></label><label>ID de cargo (UUID)<input name="office_id" required></label><label>Institución / contexto<input name="institution_context"></label><label>Inicio (fecha o período)<input name="start_date"></label><label>Fin (fecha o período)<input name="end_date"></label><label>Fuente / respaldo documental<textarea name="source_reference"></textarea></label><button class="button primary" type="submit">Agregar a la trayectoria</button><p id="office-link-message" class="form-message" aria-live="polite"></p></form></div>`:''}<div class="admin-records" id="admin-records">Cargando registros…</div>`;
  $('record-form').addEventListener('submit',async e=>{
    e.preventDefault(); const form=new FormData(e.currentTarget); const row={};
    for(const [key,,type] of def.fields){const el=e.currentTarget.elements[key];row[key]=type==='checkbox'?el.checked:(form.get(key)||null);}
    const recordId=form.get('record_id');
    const result=recordId?await db.from(def.table).update(row).eq('id',recordId):await db.from(def.table).insert(row);
    $('record-message').textContent=result.error?result.error.message:(recordId?'Cambios guardados.':'Registro guardado.');
    if(!result.error){e.currentTarget.reset();e.currentTarget.elements.record_id.value='';if(e.currentTarget.elements.published)e.currentTarget.elements.published.checked=true;loadAdminRecords(def);}
  });
  $('cancel-edit').addEventListener('click',()=>{ $('record-form').reset(); $('record-form').elements.record_id.value=''; if($('record-form').elements.published)$('record-form').elements.published.checked=true; });
  if(tab==='relaciones') $('link-form').addEventListener('submit',async e=>{
    e.preventDefault(); const f=new FormData(e.currentTarget); const type=f.get('link_type');
    const table=type==='person'?'entity_people':type==='event'?'entity_events':'entity_sources';
    const idField=type==='person'?'person_id':type==='event'?'event_id':'source_id';
    const row={geo_id:f.get('geo_id'),[idField]:f.get('related_id')};
    if(type==='source') row.source_role=f.get('relationship'); else row.relationship=f.get('relationship');
    if(type!=='source') row.evidence=f.get('evidence');
    const {error}=await db.from(table).insert(row); $('link-message').textContent=error?error.message:'Vínculo creado.'; if(!error)e.currentTarget.reset();
  });
  if(tab==='relaciones') $('office-link-form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const row={person_id:f.get('person_id'),office_id:f.get('office_id'),institution_context:f.get('institution_context')||null,start_date:f.get('start_date')||null,end_date:f.get('end_date')||null,source_reference:f.get('source_reference')||null};const {error}=await db.from('person_offices').insert(row);$('office-link-message').textContent=error?error.message:'Cargo incorporado a la trayectoria.';if(!error)e.currentTarget.reset();});
  loadAdminRecords(def);
}
async function loadAdminRecords(def){const host=$('admin-records');const {data,error}=await db.from(def.table).select('*').order('created_at',{ascending:false}).limit(30);if(error){host.textContent=`No se pudieron leer los registros: ${error.message}`;return;}if(!data?.length){host.innerHTML='<p class="muted">Todavía no hay registros.</p>';return;}host.innerHTML=data.map(row=>{const title=row.name||row.full_name||row.title||row.citation||row.relation_type||row.geo_id||'Registro';const subtitle=row.geo_id||row.id||'';return `<div class="admin-record"><span><strong>${esc(title)}</strong><small>${esc(subtitle)} · ${row.published?'Publicado':'Borrador'}</small></span><span><button type="button" data-edit="${esc(row.id)}">Editar</button> <button type="button" data-delete="${esc(row.id)}">Eliminar</button></span></div>`;}).join('');host.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>{const row=data.find(x=>x.id===b.dataset.edit);const form=$('record-form');form.elements.record_id.value=row.id;for(const [key] of def.fields){const el=form.elements[key];if(!el)continue;if(el.type==='checkbox')el.checked=Boolean(row[key]);else el.value=row[key]??'';}form.scrollIntoView({behavior:'smooth',block:'center'});}));host.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.'))return;const {error}=await db.from(def.table).delete().eq('id',b.dataset.delete);if(error)alert(error.message);else loadAdminRecords(def);}));}

initMap();
