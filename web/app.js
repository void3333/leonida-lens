"use strict";

const app = {
  pageTab: {}, inspTab: 'campo',
  view: "photos", filter: "all", query: "", photos: [], essays: [], entries: [],
  status: {watch_folder:"", total_photos:0}, activePhoto: null, activeEssay: null,
  journalId: null, busy: false, ideaIndex: 0, previousTotal: null, psn: {connected:false,experimental:true}, pickMap: null, places: null, profile: {}, backup: {}, theme: null
};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const escAttr = escapeHtml;
const icons = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  layers:'<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  refresh:'<path d="M20 11a8 8 0 0 0-14-5L4 8"/><path d="M4 4v4h4M4 13a8 8 0 0 0 14 5l2-2"/><path d="M16 16h4v4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  camera:'<path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  location:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  folder:'<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  arrow:'<path d="m5 12 14 0m-6-6 6 6-6 6"/>',
  chevronleft:'<path d="m15 18-6-6 6-6"/>',
  chevronright:'<path d="m9 18 6-6-6-6"/>',
  close:'<path d="M18 6 6 18M6 6l12 12"/>',
  edit:'<path d="m4 16-.8 4.8L8 20l11-11-4-4L4 16Z"/><path d="m13 7 4 4"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  aperture:'<circle cx="12" cy="12" r="10"/><path d="m14.3 2.3-4 7M20.8 8l-8 .1M18.5 19l-4-7M9.7 21.7l4-7M3.2 16l8-.1M5.5 5l4 7"/>',
  harddrive:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 12h20M6 16h.01M10 16h.01"/>',
  globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v5M12 8h.01"/>'
};
function svg(name, size=17){ return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name]||icons.image}</svg>`; }
function iconify(root=document){ root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=svg(el.dataset.icon);el.removeAttribute('data-icon')}); }
function dateBR(d){ if(!d) return '—'; const [y,m,day]=d.slice(0,10).split('-'); return `${day}/${m}/${y}`; }
function todayLocal(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function short(text,n=130){const s=String(text||'');return s.length>n ? s.slice(0,n-1)+'…' : s;}
function toast(message,error=false){const el=$('#toast');el.textContent=message;try{if(el.showPopover){if(!el.hasAttribute('popover'))el.setAttribute('popover','manual');if(el.matches(':popover-open'))el.hidePopover();el.showPopover();}}catch{}el.className='toast lfn-toast visible'+(error?' error lfn-toast--error':'');clearTimeout(toast._timer);toast._timer=setTimeout(()=>el.className='toast lfn-toast'+(error?' error lfn-toast--error':''),4300);}

/* ---------------------------------------------------------------- arquivo: tombo, série, formatos */
const dateArq = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s||''); return m ? `${m[3]}.${m[2]}.${m[1]}` : '—'; };
function lfnCmp(a, b) { a = a || ''; b = b || ''; return a < b ? -1 : a > b ? 1 : 0; }
function buildAccessions(photos, dateKey, importKey) {
  const sorted = [...photos].sort((a, b) =>
    lfnCmp(a[dateKey], b[dateKey]) || lfnCmp(a[importKey], b[importKey]) || lfnCmp(String(a.id), String(b.id)));
  const seq = Object.create(null), map = new Map();
  for (const p of sorted) {
    const d = p[dateKey] || '';
    const y = /^\d{4}/.test(d) ? d.slice(0, 4) : '0000';
    seq[y] = (seq[y] || 0) + 1;
    map.set(p.id, `LFN-${y}-${String(seq[y]).padStart(4, '0')}`);
  }
  return map;
}
app.acc = new Map(); app.serie = new Map(); app.serieNext = 'SÉRIE 01';
const tombo = p => (app.acc || new Map()).get(p.id) || 'LFN-0000-0000';
function reindex(){
  app.acc = buildAccessions(app.photos, 'date_taken', 'sort_at');
  const es = [...app.essays].sort((a,b)=>lfnCmp(a.created_at,b.created_at)||lfnCmp(String(a.id),String(b.id)));
  app.serie = new Map(es.map((e,i)=>[e.id,'SÉRIE '+String(i+1).padStart(2,'0')]));
  app.serieNext = 'SÉRIE '+String(es.length+1).padStart(2,'0');
}
// "Sem curadoria" = sem título (mesma regra da marca lfn-mark--raw).
const isRaw = p => !p.title;
// Ficha de campo = o que você anota ao tirar a foto: local, ponto no mapa, hora, clima e frase.
const isFieldless = p => !(p.location && p.map_x != null && p.game_time && p.weather && p.notes);
const cmpAcc = (a,b) => lfnCmp(a.date_taken,b.date_taken)||lfnCmp(a.sort_at||a.imported_at,b.sort_at||b.imported_at)||lfnCmp(String(a.id),String(b.id));
const serieOf = id => app.serie.get(id) || 'SÉRIE —';
const pad2 = n => String(n).padStart(2,'0');
function dateRange(list){
  const ds=list.map(p=>p.date_taken).filter(d=>/^\d{4}-\d{2}-\d{2}/.test(d||'')).sort(lfnCmp);
  if(!ds.length) return '—';
  const a=ds[0], b=ds[ds.length-1];
  if(a.slice(0,10)===b.slice(0,10)) return dateArq(a);
  if(a.slice(0,4)===b.slice(0,4)) return `${a.slice(8,10)}.${a.slice(5,7)}–${dateArq(b)}`;
  return `${dateArq(a)}–${dateArq(b)}`;
}
function itens(n){return `${n} ${n===1?'ITEM':'ITENS'}`;}
function complete(p){
  const f=[!!p.title, !!p.location, p.map_x != null, !!(p.game_time || p.weather), !!p.essay_id];
  const n=f.filter(Boolean).length;
  return `<span class="lfn-complete" title="${n} de 5 campos preenchidos" aria-label="${n} de 5 campos">${f.map(on=>`<i${on?' class="on"':''}></i>`).join('')}</span>`;
}
function marks(p){
  const m=[];
  if(p.favorite)m.push('<i class="lfn-mark lfn-mark--fav" title="Selecionada"></i>');
  if(!p.title)m.push('<i class="lfn-mark lfn-mark--raw" title="Sem curadoria"></i>');
  if(p.map_x!=null)m.push('<i class="lfn-mark lfn-mark--geo" title="Georreferenciada"></i>');
  if(!p.location)m.push('<i class="lfn-mark lfn-mark--noloc" title="Local não registrado"></i>');
  return `<span class="lfn-marks">${m.join('')}</span>`;
}
const titleHtml = p => p.title ? escapeHtml(p.title) : '<span class="lfn-untitled">Sem título</span>';
const coord = v => { const r=Math.round(Number(v)); return r<0?'−'+Math.abs(r):String(r); };
const pinText = (x,y) => `X ${coord(x)} · Y ${coord(y)}`;
const footnote = text => `<div class="footnote lfn-label">${text}</div>`;
const FAN_CREDIT = 'Projeto de fã, sem afiliação com Rockstar Games ou Sony. Mapa © Rockstar Games · nomes de lugares: Open GTA 6 Map (CC BY 4.0).';

async function api(path,opts={}){
  const config={...opts};
  if(config.body && !(config.body instanceof Blob)) {config.body=JSON.stringify(config.body);config.headers={...(config.headers||{}),'Content-Type':'application/json'};}
  const resp=await fetch(path,config);let data;
  try{data=await resp.json();}catch{data={error:'Resposta inválida do servidor.'};}
  if(!resp.ok) throw new Error(data?.error||`Erro ${resp.status}`);  // avisos (ex.: pasta desconectada) não derrubam o Estúdio
  return data;
}
async function loadAll(showErrors=true){
  try{
    const [p,e,j,s,psn,prof,bk,site,th]=await Promise.all([api('/api/photos'),api('/api/essays'),api('/api/journal'),api('/api/status'),api('/api/psn/status'),api('/api/profile'),api('/api/backup/status'),api('/api/site/status').catch(()=>({})),api('/api/theme').catch(()=>null)]);
    if(th){app.theme=th;applyStudioTheme();}
    app.photos=p.photos;app.essays=e.essays;app.entries=j.entries;app.status=s;app.psn=psn;app.profile=prof;app.backup=bk;app.site=site;paintDeploy();
    reindex();applyProfile();
    updateSidebar();render();
  }catch(err){if(showErrors)toast('Não foi possível carregar: '+err.message,true);}
}
function updateSidebar(){
  $('#nav-photo-count').textContent=String(app.photos.length);
  const ec=$('#nav-essay-count');if(ec)ec.textContent=app.essays.length?String(app.essays.length):'';
  const jc=$('#nav-journal-count');if(jc)jc.textContent=app.entries.length?String(app.entries.length):'';
  const has=Boolean(app.status.watch_folder);
  $('#sidebar-sync-dot').className='sync-dot lfn-dot'+(app.status.error?' error lfn-dot--danger':(has||app.psn.connected)?' active lfn-dot--ok':'');
  $('#sidebar-sync-title').textContent=app.status.error?'Verifique a procedência':app.psn.connected?'PlayStation conectado':has?'Pasta monitorada':'Biblioteca local';
  $('#sidebar-sync-desc').textContent=has?(app.status.scanning?'VERIFICANDO CAPTURAS…':itens(app.photos.length)+' NO ACERVO'):'SEM PASTA CONFIGURADA';
}
const VIEW_NAMES={photos:'ACERVO',essays:'ENSAIOS',journal:'CADERNO DE CAMPO',sync:'PROCEDÊNCIA',studio:'MEU ESTÚDIO',preview:'PRÉVIA DA GALERIA',guide:'GUIA'};
function setView(view,refresh=true){
  app.view=view;
  $$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
  $('#breadcrumb-page').textContent=VIEW_NAMES[view];
  if(refresh)render();
  document.querySelectorAll('#content .work, #content .lfn-scroll').forEach(el=>el.scrollTo({top:0}));
}
function getVisiblePhotos(){
  let list=[...app.photos];
  if(app.activeEssay && app.view==='photos')list=list.filter(p=>p.essay_id===app.activeEssay);
  if(app.filter==='favorites')list=list.filter(p=>p.favorite);
  if(app.filter==='mapped')list=list.filter(p=>p.map_x!=null);
  if(app.filter==='unreviewed')list=list.filter(isRaw);
  if(app.filter==='nofield')list=list.filter(isFieldless);
  const q=app.query.trim().toLocaleLowerCase('pt-BR');
  if(q)list=list.filter(p=>[p.filename,p.title,p.location,p.notes,p.tags,app.essays.find(e=>e.id===p.essay_id)?.title,tombo(p),p.essay_id?serieOf(p.essay_id):''].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(q)));
  // Ordem de arquivo: dentro de uma série, pela ordem das pranchas; no acervo geral, do tombo mais recente ao mais antigo.
  if(app.activeEssay && app.view==='photos')list.sort(cmpAcc);else list.sort((a,b)=>cmpAcc(b,a));
  return list;
}
function updateCrumbs(){
  const seg=$('#breadcrumb-series');if(!seg)return;
  const e=app.view==='photos'&&app.activeEssay?app.essays.find(x=>x.id===app.activeEssay):null;
  seg.textContent=e?`${serieOf(e.id)} · ${String(e.title||'').toLocaleUpperCase('pt-BR')}`:'SÉRIE GERAL';
}
function render(){
  reindex();
  const target=$('#content');
  if(app.view==='photos')target.innerHTML=renderPhotos();
  else if(app.view==='essays')target.innerHTML=renderEssays();
  else if(app.view==='journal')target.innerHTML=renderJournal();
  else if(app.view==='studio')target.innerHTML=renderStudio();
  else if(app.view==='preview')target.innerHTML=renderPreview();
  else if(app.view==='guide')target.innerHTML=renderGuide();
  else target.innerHTML=renderSync();
  iconify(target);
  renderPauta();updateCrumbs();
  if(app.view==='photos'){
    renderPhotoArea();
    const search=$('#photo-search');if(search){search.value=app.query;search.addEventListener('input',ev=>{app.query=ev.target.value;renderPhotoArea();});}
  }
}
function renderPhotoCard(p){
  const label=p.title||tombo(p);
  return `<button class="photo-card" data-photo="${p.id}" type="button" title="Abrir ficha ${escAttr(tombo(p))} · ${escAttr(label)}">
    <div class="photo-visual"><img loading="lazy" decoding="async" src="${p.thumb_url}" alt="${escAttr(label)}"/></div>
    <div class="photo-info">
      <div class="photo-line1"><span class="photo-codes">${marks(p)}<span class="lfn-accession">${tombo(p)}</span>${complete(p)}</span><time class="photo-date">${app.plates&&app.plates.has(p.id)?`<span class="photo-plate">${app.plates.get(p.id)}</span>`:dateArq(p.date_taken)}</time></div>
      <div class="photo-name">${titleHtml(p)}</div>
      <div class="photo-secondary${p.location?'':' is-empty'}">${p.location?escapeHtml(p.location):'Local não registrado'}</div>
    </div>
  </button>`;
}
function filterCounts(){
  let base=[...app.photos];
  if(app.activeEssay)base=base.filter(p=>p.essay_id===app.activeEssay);
  return {all:base.length,favorites:base.filter(p=>p.favorite).length,unreviewed:base.filter(isRaw).length,nofield:base.filter(isFieldless).length,mapped:base.filter(p=>p.map_x!=null).length};
}
function renderPhotoArea(){
  const area=$('#photo-area');if(!area)return;
  const ps=getVisiblePhotos();
  app.plates=null;
  if(app.activeEssay){const inEssay=app.photos.filter(p=>p.essay_id===app.activeEssay).sort(cmpAcc);app.plates=new Map(inEssay.map((p,i)=>[p.id,'PRANCHA '+pad2(i+1)]));}
  $('#photo-count-label').textContent=itens(ps.length);
  area.innerHTML=ps.length?`<div class="photo-grid">${ps.map(renderPhotoCard).join('')}</div>`:
    app.photos.length?`<div class="lfn-empty"><div class="lfn-empty-title">Nenhum item corresponde a este filtro.</div><p>Ajuste os filtros, a busca ou volte para todo o acervo.</p></div>`:
    `<div class="lfn-empty"><div class="lfn-empty-title">Seu acervo ainda está vazio.</div><p>Importe as primeiras capturas para abrir o catálogo.</p><div class="empty-actions"><button class="lfn-btn lfn-btn--primary" data-action="import">Importar fotografias</button><button class="lfn-btn" data-action="go-sync">Configurar procedência</button></div></div>`;
}
const ideas=[
  ['A cidade que não olha para você','Encontre uma cena em que a arquitetura seja mais expressiva do que os personagens. Observe, não provoque.'],
  ['Uma história fora do quadro','Fotografe um indício de que alguma coisa aconteceu, sem mostrar o acontecimento.'],
  ['O intervalo entre duas pessoas','Procure uma fotografia cujo assunto principal seja o espaço que separa duas figuras.'],
  ['Depois da chuva','Se o tempo mudar naturalmente, observe o que permanece na rua quando todos vão embora.'],
  ['Um lugar, dois horários','Revisite um local conhecido quando a luz estiver diferente. Não tente repetir a mesma cena.'],
  ['A espera','Escolha uma composição interessante e permita que o movimento da rua complete ou não a imagem.'],
  ['Tudo aquilo que não é atração','Dedique atenção a um lugar aparentemente comum: estacionamento, serviço, corredor ou vitrine.'],
  ['Cor sem espetáculo','Procure duas cores que conversem numa cena cotidiana. Evite aumentar artificialmente a saturação.'],
  ['Pessoa e território','Faça uma fotografia na qual seja impossível separar o sujeito do ambiente onde vive.'],
  ['Sem imagem hoje','Saia para conhecer um lugar, mas não tire nenhuma foto nos primeiros 20 minutos. Veja o que muda na sua atenção.']
];
function currentIdea(){return ideas[app.ideaIndex % ideas.length];}
function renderPauta(){
  const el=$('#pauta');if(!el)return;
  const [t,d]=currentIdea();
  el.innerHTML=`<div class="lfn-label">IDEIA DO DIA · ${pad2(app.ideaIndex % ideas.length + 1)}/${pad2(ideas.length)}</div><div class="pauta-title lfn-serif">${escapeHtml(t)}</div><p class="pauta-text">${escapeHtml(d)}</p><button class="lfn-link" type="button" data-action="new-idea">OUTRA IDEIA ↻</button>`;
}
// Abas de página: cada aba cabe na tela, sem rolagem. tabs = [[chave, rótulo, html], ...]
function pageTabs(group,tabs){
 const on=app.pageTab[group]&&tabs.some(t=>t[0]===app.pageTab[group])?app.pageTab[group]:tabs[0][0];
 return `<div class="ptabs-wrap" data-tab="${on}" data-group="${group}"><nav class="ptabs" role="tablist">${tabs.map(([k,l])=>`<button type="button" class="lfn-tab${k===on?' is-on':''}" role="tab" aria-selected="${k===on}" data-ptab="${group}:${k}" data-k="${k}">${l}</button>`).join('')}</nav>
 ${tabs.map(([k,,html])=>`<section class="ptab-pane${k===on?' is-on':''}" data-k="${k}">${html}</section>`).join('')}</div>`;
}
function pageHead(title,{label='',dek='',dekSerif=true,sub='',actions=''}={}){
  return `<header class="page-head"><div class="page-head-main">${label?`<div class="lfn-label page-label">${label}</div>`:''}<h1 class="page-title lfn-serif">${title}</h1>${dek?`<p class="page-dek${dekSerif?' is-serif':''}">${dek}</p>`:''}${sub?`<div class="page-sub">${sub}</div>`:''}</div>${actions?`<div class="header-actions">${actions}</div>`:''}</header>`;
}
function renderPhotos(){
 const all=app.photos, activeEssay=app.essays.find(e=>e.id===app.activeEssay);
 const scope=activeEssay?all.filter(p=>p.essay_id===activeEssay.id):all;
 const n=scope.length, fav=scope.filter(p=>p.favorite).length, withEssay=scope.filter(p=>p.essay_id).length, geo=scope.filter(p=>p.map_x!=null).length;
 const lastImp=scope.map(p=>p.imported_at||'').sort(lfnCmp).pop();
 const c=filterCounts();
 const tab=(f,label)=>`<button data-filter="${f}" class="filter-chip lfn-tab ${app.filter===f?'active':''}" type="button">${label}<span class="lfn-tab-count">${c[f]}</span></button>`;
 const head=activeEssay
  ? pageHead(escapeHtml(activeEssay.title),{label:serieOf(activeEssay.id),sub:`${itens(n)} · ${dateRange(scope)}`,actions:`<button class="lfn-link" data-action="all-photos" type="button">← TODO O ACERVO</button><button class="lfn-btn" data-action="import" type="button">Adicionar fotos</button>`})
  : pageHead('Acervo',{sub:`${itens(n)} · ${dateRange(scope)}`,actions:`<button class="lfn-btn" data-action="import" type="button">Adicionar fotos</button>`});
 return `<div class="view view-photos">${head}
 <div class="lfn-extent extent"><div><b>${n}</b><span>${n===1?'Item':'Itens'}</span></div><div><b>${fav}</b><span>Favoritas</span></div><div><b>${withEssay}</b><span>Em ensaio</span></div><div><b>${geo}</b><span>Georreferenciadas</span></div><div><b>${app.entries.length}</b><span>Registros de campo</span></div><div class="extent-last"><span>Última entrada</span><b class="is-mono">${dateArq(lastImp)}</b></div></div>
 <div class="toolbar"><div class="filters">${tab('all','Todas')}${tab('favorites','Favoritas')}${tab('nofield','Sem ficha de campo')}${tab('unreviewed','Sem título')}${tab('mapped','No mapa')}</div><span class="toolbar-spacer"></span><span id="photo-count-label" class="toolbar-count lfn-mono">${itens(getVisiblePhotos().length)}</span><label class="searchbox"><input id="photo-search" class="lfn-input lfn-input--line" autocomplete="off" placeholder="Buscar por título, local ou tombo…" aria-label="Buscar no acervo"/></label></div>
 <div class="work lfn-scroll"><div id="photo-area"></div>${footnote('Imagens guardadas numa biblioteca local · a nuvem PlayStation só é consultada se você conectar a conta (opcional) · <button class="lfn-link linkbutton" data-action="go-sync" type="button">Ver procedência →</button>')}</div></div>`;
}
/* ---------------------------------------------------------------- ENSAIOS: pautas com 20 vagas */
function slotMeta(sl){
 const where=sl.location||'LOCAL SECRETO';
 return [where,sl.game_time,sl.weather].filter(Boolean).map(escapeHtml).join(' · ');
}
function renderEssays(){
 const es=[...app.essays].sort((a,b)=>lfnCmp(a.created_at,b.created_at)||lfnCmp(String(a.id),String(b.id)));
 if(!es.length){
  return `<div class="view view-noTool">${pageHead('Ensaios',{label:'PROJETOS',dek:'Um ensaio é uma pergunta que você volta para responder.'})}
  <div class="ess-empty"><p>Nenhum ensaio ainda. Comece com 10 ensaios-pauta prontos (documental, forense, esportes, animais e mais), cada um com 20 fotos planejadas: título, local, hora, clima e frase de campo.</p>
  <div class="row-actions"><button class="lfn-btn lfn-btn--primary" data-action="essay-seed" type="button">+ Criar 10 ensaios-pauta</button><button class="lfn-btn" data-action="new-essay" type="button">Ensaio em branco</button></div></div></div>`;
 }
 if(!app.essayOpen||!es.some(e=>e.id===app.essayOpen))app.essayOpen=es[0].id;
 const cur=es.find(e=>e.id===app.essayOpen);
 const list=es.map(e=>{
  const inSlots=new Set((e.slots||[]).map(sl=>sl.photo_id).filter(Boolean));
  const loose=app.photos.filter(p=>p.essay_id===e.id&&!inSlots.has(p.id)).length;
  const total=(e.slots.length||0)+loose,filled=(e.filled||0)+loose,pct=total?Math.round(filled*100/total):0;
  return `<button class="ess-row${e.id===cur.id?' is-on':''}" data-action="essay-open" data-id="${e.id}" type="button">
   <span class="ess-row-top"><span class="ess-code">${escapeHtml(serieOf(e.id))}</span><span class="ess-state ${e.published?'is-pub':''}">${e.published?'NO SITE':'RASCUNHO'}</span></span>
   <b>${escapeHtml(e.title)}</b><small>${escapeHtml(e.genre||'—')}</small>
   <span class="ess-bar"><i style="width:${pct}%"></i></span><span class="ess-count">${filled}/${total||'—'} FOTOS</span></button>`;}).join('');
 const slots=(cur.slots||[]).map((sl,i)=>{
  const ph=sl.photo_id&&app.photos.find(p=>p.id===sl.photo_id);
  return `<article class="slot${ph?' is-filled':''}">
   <button class="slot-media" data-action="slot-pick" data-id="${sl.id}" type="button" title="${ph?'Trocar foto':'Escolher foto para esta pauta'}">
    ${ph?`<img src="${ph.thumb_url}" alt="" loading="lazy" decoding="async"/>`:`<span class="slot-plus">+</span><span class="slot-hint">escolher foto</span>`}
    <span class="slot-n">P${pad2(i+1)}</span></button>
   <div class="slot-body"><b>${escapeHtml(sl.title||'Sem título')}</b><small>${slotMeta(sl)||'LOCAL SECRETO'}</small>${sl.phrase?`<p>“${escapeHtml(sl.phrase)}”</p>`:''}
   <div class="slot-tools"><button data-action="slot-edit" data-id="${sl.id}" type="button">editar pauta</button>${ph?`<button data-action="slot-clear" data-id="${sl.id}" type="button">tirar foto</button><button data-action="slot-open-photo" data-id="${ph.id}" type="button">ficha</button>`:''}</div></div></article>`;}).join('');
 const slotPhotos=new Set((cur.slots||[]).map(sl=>sl.photo_id).filter(Boolean));
 const loosePh=app.photos.filter(p=>p.essay_id===cur.id&&!slotPhotos.has(p.id));
 const looseHtml=loosePh.length?`<div class="ess-progress"><span>Outras fotos deste ensaio · ${loosePh.length}</span><span>ligadas pela ficha (aba Arquivo → Ensaio)</span></div>
   <div class="slot-grid">${loosePh.map(ph=>`<article class="slot is-filled"><button class="slot-media" data-action="slot-open-photo" data-id="${ph.id}" type="button" title="Abrir ficha"><img src="${ph.thumb_url}" alt="" loading="lazy" decoding="async"/></button>
    <div class="slot-body"><b>${escapeHtml(ph.title||'Sem título')}</b><small>${escapeHtml(ph.location||'LOCAL SECRETO')}</small></div></article>`).join('')}</div>`:'';
 const rules=(cur.rules||[]).length?`<ul class="ess-rules">${cur.rules.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul>`:'';
 return `<div class="view view-noTool"><div class="ess-layout">
  <aside class="ess-list lfn-scroll"><div class="ess-list-head"><span>ENSAIOS · ${es.length}</span><span><button class="lfn-linkbtn" data-action="new-essay" type="button">+ novo</button> <button class="lfn-linkbtn" data-action="essay-seed" type="button" title="Recria os ensaios-pauta que faltarem">+ pautas</button></span></div>${list}</aside>
  <section class="ess-detail lfn-scroll">
   <header class="ess-head"><div><span class="ess-kicker">${escapeHtml(serieOf(cur.id))} · ${escapeHtml(cur.genre||'ENSAIO')}</span><h1>${escapeHtml(cur.title)}</h1>
    ${cur.description?`<p class="ess-manifesto">${escapeHtml(cur.description)}</p>`:''}${rules}</div>
    <div class="ess-actions">
     <button class="lfn-btn ${cur.published?'':'lfn-btn--primary'}" data-action="essay-publish" data-id="${cur.id}" type="button">${cur.published?'✓ Publicado · tirar do site':'Publicar no site'}</button>
     <button class="lfn-btn" data-action="essay-edit" data-id="${cur.id}" type="button">Editar</button>
     <button class="lfn-btn" data-action="essay-acervo" data-id="${cur.id}" type="button">Ver fotos</button>
     <button class="lfn-btn" data-action="essay-preview" data-id="${cur.id}" type="button">Prévia</button>
     <button class="lfn-btn lfn-btn--danger" data-action="essay-delete" data-id="${cur.id}" type="button">Excluir</button>
    </div></header>
   <div class="ess-progress"><span>${cur.filled||0} de ${(cur.slots||[]).length} pautas fotografadas</span><span>${cur.published?'Aparece no site quando tiver fotos publicadas':'Rascunho: não aparece no site'}</span></div>
   <div class="slot-grid">${slots}<button class="slot slot-add" data-action="essay-add-slot" data-id="${cur.id}" type="button">+ adicionar pauta</button></div>
   ${looseHtml}
  </section></div></div>`;
}
async function essayCall(path,method='POST',body={}){
 try{const r=await api(path,{method,body});if(r.essays)app.essays=r.essays;if(path.includes('/assign')||path.includes('/clear')||path.includes('/delete'))await loadAll(false);else{reindex();render();}return r;}
 catch(err){toast(err.message,true);return null;}
}
function openSlotPicker(slotId){
 const owner=new Map();app.essays.forEach(e=>(e.slots||[]).forEach(s=>{if(s.photo_id)owner.set(s.photo_id,e.title);}));
 const ps=[...app.photos].sort((a,b)=>(owner.has(a.id)-owner.has(b.id))||cmpAcc(b,a));
 dialogShow('#formDialog',`<div class="form-wrap picker"><div class="dlg-body"><h2 class="dialog-title">Escolher foto para a pauta</h2>
  <p class="dialog-desc">A foto herda título, local, hora, clima e frase da pauta — só nos campos que ainda estiverem vazios.</p>
  <input class="lfn-input picker-search" id="picker-search" placeholder="buscar por tombo, título, local…" autocomplete="off"/>
  <div class="picker-grid lfn-scroll">${ps.map(p=>`<button class="pick" data-action="slot-assign" data-slot="${slotId}" data-pick="${p.id}" data-q="${escAttr([tombo(p),p.title,p.location,p.filename].join(' ').toLowerCase())}" type="button">
   <img src="${p.thumb_url}" alt="" loading="lazy" decoding="async"/><span>${escapeHtml(tombo(p))}</span>${owner.has(p.id)?`<em>em: ${escapeHtml(owner.get(p.id))}</em>`:''}</button>`).join('')}</div></div>
  <div class="form-footer"><button class="lfn-btn" data-action="close-form" type="button">Cancelar</button></div></div>`);
 const s=$('#picker-search');s.focus();s.addEventListener('input',()=>{const q=s.value.trim().toLowerCase();$$('.pick').forEach(b=>{b.hidden=q&&!b.dataset.q.includes(q);});});
}
const WEATHERS=['','Ensolarado','Nublado','Chuva','Tempestade','Neblina','Pôr do sol','Noite limpa','Calor úmido','Vento forte','Garoa'];
function openSlotEditor(slotId){
 let sl=null;app.essays.forEach(e=>(e.slots||[]).forEach(s=>{if(s.id===slotId)sl=s;}));if(!sl)return;
 loadPlaces();
 dialogShow('#formDialog',`<div class="form-wrap"><form id="slot-form" class="dlg-form" data-id="${sl.id}"><div class="dlg-body"><h2 class="dialog-title">Pauta</h2>
  <p class="dialog-desc">Local vazio = <b>local secreto</b>. Hora e clima são opcionais.</p>
  <div class="form-field lfn-field"><label>Título</label><input class="lfn-input" name="title" maxlength="140" value="${escAttr(sl.title)}"/></div>
  <div class="form-field lfn-field"><label>Local em Leonida</label><input class="lfn-input" name="location" maxlength="120" list="places-list" value="${escAttr(sl.location)}" placeholder="vazio = local secreto"/></div>
  <div class="form-row-2"><div class="form-field lfn-field"><label>Hora no jogo</label><input class="lfn-input" name="game_time" maxlength="40" value="${escAttr(sl.game_time)}" placeholder="opcional · 06:12"/></div>
  <div class="form-field lfn-field"><label>Clima</label><select class="lfn-input" name="weather">${WEATHERS.map(w=>`<option value="${escAttr(w)}" ${w===sl.weather?'selected':''}>${w||'— não anotar —'}</option>`).join('')}</select></div></div>
  <div class="form-field lfn-field"><label>Frase de campo <button class="lfn-linkbtn" data-action="suggest-into" data-target="phrase" type="button">sugerir</button></label><textarea class="lfn-input" name="phrase" maxlength="2000" rows="3">${escapeHtml(sl.phrase)}</textarea></div></div>
  <div class="form-footer"><button class="lfn-btn" data-action="close-form" type="button">Cancelar</button><button class="lfn-btn lfn-btn--primary" type="submit">Salvar pauta</button></div></form></div>`);
}
function openEssayEditor(id){
 const e=app.essays.find(x=>x.id===id);if(!e)return;
 dialogShow('#formDialog',`<div class="form-wrap"><form id="essay-edit-form" class="dlg-form" data-id="${e.id}"><div class="dlg-body"><h2 class="dialog-title">Editar ensaio</h2>
  <div class="form-field lfn-field"><label>Título</label><input class="lfn-input" name="title" maxlength="110" required value="${escAttr(e.title)}"/></div>
  <div class="form-field lfn-field"><label>Gênero</label><input class="lfn-input" name="genre" maxlength="60" value="${escAttr(e.genre||'')}" placeholder="Documental, forense, esportes…"/></div>
  <div class="form-field lfn-field"><label>Manifesto</label><textarea class="lfn-input" name="description" maxlength="1500" rows="5">${escapeHtml(e.description||'')}</textarea></div></div>
  <div class="form-footer"><button class="lfn-btn" data-action="close-form" type="button">Cancelar</button><button class="lfn-btn lfn-btn--primary" type="submit">Salvar</button></div></form></div>`);
}

/* ---------------------------------------------------------------- frases e títulos sugeridos */
let PHRASES=null;
async function phraseLib(){
 if(PHRASES)return PHRASES;
 try{PHRASES=await (await fetch('/vendor/lfn-frases.json')).json();}catch{PHRASES={titles:[],phrases:[]};}
 return PHRASES;
}
async function suggestInto(form,field){
 const lib=await phraseLib();const pool=field==='title'?lib.titles:lib.phrases;
 if(!pool||!pool.length)return toast('Biblioteca de frases indisponível.',true);
 const el=form?.querySelector(`[name="${field}"]`);if(!el)return;
 let pick;do{pick=pool[Math.floor(Math.random()*pool.length)];}while(pool.length>1&&pick===el.value);
 el.value=pick;el.dispatchEvent(new Event('input',{bubbles:true}));el.focus();
}

/* ---------------------------------------------------------------- PRÉVIA da galeria */
function renderPreview(){
 const pub=app.previewPublic!==false;
 const src=`/galeria/${pub?'?publico=1':''}${app.previewHash||'#/'}`;
 return `<div class="view view-noTool preview-view">
  <div class="preview-bar"><span class="preview-title">PRÉVIA DA GALERIA</span>
   <span class="seg"><button data-action="preview-mode" data-mode="public" aria-pressed="${pub}" type="button">Como visitante</button><button data-action="preview-mode" data-mode="all" aria-pressed="${!pub}" type="button">Tudo (incl. rascunhos)</button></span>
   <span class="preview-tools"><button class="lfn-linkbtn" data-action="preview-reload" type="button">recarregar</button><a class="lfn-linkbtn" href="${src}" target="_blank" rel="noopener">abrir em janela ↗</a></span></div>
  <iframe class="preview-frame" id="preview-frame" src="${src}" title="Prévia da galeria"></iframe></div>`;
}

function renderJournal(){
 const head=pageHead('Caderno de campo',{dek:'O que não cabe numa foto.',actions:`<button class="lfn-btn lfn-btn--primary" data-action="new-journal" type="button">Novo registro</button>`});
 const rows=app.entries.map(j=>`<button class="journal-entry" data-journal="${j.id}" type="button"><div class="meta">${dateArq(j.day_at)}${j.time?`<br/>${escapeHtml(j.time)}`:''}</div><div class="journal-main"><h3 class="lfn-serif">${escapeHtml(j.title)}</h3><p>${escapeHtml(j.body||'Sem anotações adicionais.')}</p></div><div class="loc">${escapeHtml(j.place||'—')}</div></button>`).join('');
 return `<div class="view view-noTool">${head}
 <div class="journal-grid"><section class="work lfn-scroll journal-ledger">${app.entries.length?`<div class="lfn-rule"><span>Registros</span><span class="lfn-rule-count">${app.entries.length}</span></div><div class="journal-list">${rows}</div>`:
 `<div class="lfn-empty"><div class="lfn-empty-title">Um caderno ainda em branco.</div><p>Basta registrar, de vez em quando, o que ficou na memória depois de uma saída.</p><button class="lfn-btn lfn-btn--primary" data-action="new-journal" type="button">Novo registro</button></div>`}</section>
 <aside class="field-guide lfn-scroll"><div class="lfn-label">GUIA DE CAMPO</div><h3 class="lfn-serif">Olhar é diferente de encontrar.</h3><p>Uma cidade desconhecida não se revela num passeio turístico. Ela começa a se tornar familiar quando você reconhece as ruas, descobre onde gosta de sentar e percebe o que mudou desde sua última visita.</p><p>Volte aos lugares por curiosidade. Não porque o aplicativo mandou.</p><footer class="lfn-label">A DATA REGISTRADA É A DO SEU CADERNO, NÃO UM CALENDÁRIO OFICIAL DE LEONIDA.</footer></aside></div></div>`;
}
const metaRow=(k,v,cls='is-mono')=>`<div><dt>${k}</dt><dd class="${cls}">${v}</dd></div>`;
function renderPsnPanel(){
 const p=app.psn||{}, connected=!!p.connected;
 const stamp=p.last_sync?new Date(p.last_sync).toLocaleString('pt-BR'):'—';
 return `<section class="psn-panel psn-grid"><div class="psn-a">
  <div class="lfn-rule"><span>PlayStation Network · experimental</span></div>
  <p class="sec-lead">O PC consulta as capturas enviadas pelo PS5 à nuvem Sony e incorpora as fotos ao acervo. A galeria na nuvem é diferente da Galeria de mídia do console.</p>
  <div class="inline-alert">Esta integração usa interfaces não documentadas da Sony e pode falhar ou deixar de funcionar. Não é afiliada à PlayStation. Não insira sua senha da PSN aqui. Se a Sony mudar algo, use a pasta/pendrive como alternativa.</div>
  <dl class="lfn-meta">${metaRow('Conta',connected?`<span class="lfn-dot lfn-dot--ok"></span> CONECTADA · ${escapeHtml(p.storage||'PROTEGIDA')}`:'<span class="lfn-dot"></span> NÃO CONECTADA')}${metaRow('Situação',p.syncing?'SINCRONIZANDO…':connected?'PRONTA':'AGUARDANDO TOKEN')}${metaRow('Última leitura',escapeHtml(stamp))}${connected?metaRow('Novas fotos',Number(p.last_added||0))+metaRow('Vistas / ignoradas',`${Number(p.last_found||0)} / ${Number(p.last_skipped||0)}`):''}</dl></div><div class="psn-b">
  <details class="psn-steps"><summary class="lfn-label">COMO CONECTAR · 3 PASSOS</summary>
   <ol class="step-list"><li><span class="step-index">01</span><p>No PS5: Configurações → Capturas e transmissões → Capturas → ligue o <b>envio automático</b> para o PlayStation App (com o app no celular, na mesma conta).</p></li>
   <li><span class="step-index">02</span><p>No PC, entre na sua conta no site oficial da Sony. Depois acesse a página oficial de sessão e copie o texto que aparece (o valor npsso). Nunca copie nem cole a senha.</p></li>
   <li><span class="step-index">03</span><p>Cole no campo abaixo e clique em Conectar. O valor é usado uma única vez e não fica salvo; a conexão fica guardada de forma protegida pelo Windows. As fotos começam a chegar sozinhas.</p></li></ol></details>
  ${connected?`<div class="row-actions"><button class="lfn-btn lfn-btn--primary" data-action="psn-sync" type="button" ${p.syncing?'disabled':''}>${p.syncing?'Sincronizando…':'Buscar fotos na nuvem'}</button>
    <button class="lfn-btn lfn-btn--ghost danger-text" data-action="psn-disconnect" type="button">Desconectar e apagar sessão</button></div>
    <div class="psn-options"><label class="check"><input id="psn-only-gta" type="checkbox" ${p.only_gta?'checked':''}/> Importar somente jogos GTA</label>
    <label class="check"><input id="psn-auto" type="checkbox" ${p.auto?'checked':''}/> Nova leitura a cada 15 minutos com o app aberto</label>
    <button class="lfn-btn lfn-btn--sm" data-action="psn-options" type="button">Salvar opções</button></div>`:
    `<div class="row-actions"><a class="lfn-btn lfn-btn--sm" href="https://id.sonyentertainmentnetwork.com/id/management_ca/" target="_blank" rel="noreferrer noopener">Entrar no site da Sony ↗</a>
    <a class="lfn-btn lfn-btn--sm" href="https://ca.account.sony.com/api/v1/ssocookie" target="_blank" rel="noreferrer noopener">Página de sessão Sony ↗</a><button class="lfn-btn lfn-btn--sm" type="button" data-action="open-guide" data-topic="token">Guia: pegar o token</button></div>
    <form id="psn-connect-form" class="psn-form" autocomplete="off"><div class="form-field lfn-field"><label for="psn-session">Valor npsso · token confidencial</label>
    <div class="inline-input"><input id="psn-session" class="lfn-input lfn-input--mono" type="password" name="npsso" required autocomplete="off" spellcheck="false" placeholder="Cole aqui o texto da página de sessão"/><button class="lfn-btn lfn-btn--primary" type="submit">Conectar</button></div></div></form>
    <p class="hint">O token concede acesso à sua conta: mantenha-o privado. Se não quiser usar a integração experimental, continue com a importação por USB.</p>`}
  ${(app.psnError||p.last_error)?`<div class="inline-alert is-danger">${escapeHtml(app.psnError||p.last_error)}</div>`:''}
  ${footnote('Fontes: <a class="lfn-link" href="https://www.playstation.com/pt-br/support/games/ps5-game-captures-ps-app/" rel="noreferrer" target="_blank">Instruções Sony ↗</a> · <a class="lfn-link" href="https://github.com/CallMeTak/playstation-clip-viewer" rel="noreferrer" target="_blank">PS Clips Viewer ↗</a> · Limite da nuvem: 14 dias')}
 </div></section>`;
}
function renderSync(){
 const s=app.status, has=!!s.watch_folder, last=s.last_scan?new Date(s.last_scan).toLocaleString('pt-BR'):'NUNCA';
 const head=pageHead('Procedência',{dek:'De onde vêm as imagens.',dekSerif:false,actions:`<button class="lfn-btn" data-action="open-guide" data-topic="fotos" type="button">Guia passo a passo</button><button class="lfn-btn" data-action="import" type="button">Importação manual</button>`});
 const dot=s.error?'lfn-dot--danger':has?'lfn-dot--ok':'';
 const pane1=`<div class="two-col tab-cols"><div class="col">   <div class="lfn-rule"><span>Pasta local</span><span class="lfn-rule-count">${has?'CONECTADA':'NÃO CONFIGURADA'}</span></div>
   <div class="form-field lfn-field"><label for="watch-folder">Pasta observada</label><input id="watch-folder" class="path-input lfn-input lfn-input--mono" placeholder="C:\\Users\\...\\Leonida Inbox" value="${escAttr(s.watch_folder||'')}" spellcheck="false"/></div>
   <div class="row-actions"><button class="lfn-btn lfn-btn--sm" data-action="pick-folder" type="button">Escolher pasta</button><button class="lfn-btn lfn-btn--sm" data-action="save-folder" type="button">Salvar caminho</button></div>
   <dl class="lfn-meta">${metaRow('Situação',`<span class="lfn-dot ${dot}"></span> ${escapeHtml(s.status||'Aguardando')}`,'')}${metaRow('Última verificação',escapeHtml(last))}${metaRow('Arquivos encontrados',s.last_checked||0)}${metaRow('Novas fotos',s.last_added||0)}${metaRow('Total',itens(s.total_photos||0))}${metaRow('Miniaturas',s.thumbnails_enabled?'ATIVAS':'OPCIONAL (PILLOW)')}</dl>
   ${s.error?`<div class="inline-alert is-danger">${escapeHtml(s.error)}</div>`:''}
   <div class="row-actions"><button class="lfn-btn lfn-btn--primary" data-action="scan" type="button">Verificar agora</button><a class="lfn-btn" href="/api/export" download="leonida-lens-export.json">Exportar catálogo</a></div>
</div><div class="col">   <div class="lfn-rule"><span>Importação manual</span></div>
   <div class="manual-row"><p>Selecione arquivos JPG, PNG ou WEBP, ou arraste-os para a janela.</p><button class="lfn-btn lfn-btn--sm" data-action="import" type="button">Importar arquivos</button></div>
</div></div>`;
 const pane2=renderPsnPanel();
 const pane3=`<div class="tab-narrow">   <div class="lfn-rule"><span>Como funciona</span><span class="lfn-rule-count">04</span></div>
   <ol class="step-list">
    <li class="step"><span class="step-index">01</span><div><h4>No PS5</h4><p>Ative o upload automático de capturas. Ao fotografar no jogo, salve a captura pelo botão Criar do DualSense.</p></div></li>
    <li class="step"><span class="step-index">02</span><div><h4>Alternativa segura: pendrive</h4><p>Na Galeria de mídia, use Copiar para unidade USB. Depois conecte o pendrive no PC e selecione a pasta. Nenhuma conta Sony é necessária.</p></div></li>
    <li class="step"><span class="step-index">03</span><div><h4>No PC</h4><p>Copie as imagens para uma pasta fixa, como <span class="lfn-mono">Imagens\\Leonida Inbox</span>, e escolha essa pasta aqui.</p></div></li>
    <li class="step"><span class="step-index">04</span><div><h4>Aqui no Leonida Lens</h4><p>Com o app aberto, a pasta é verificada a cada ~14 segundos e cada arquivo novo ganha uma cópia no acervo privado.</p></div></li>
   </ol>
   <div class="row-actions"><button class="lfn-btn lfn-btn--sm" data-action="open-guide" data-topic="fotos" type="button">Abrir o guia completo (com “deu errado?”)</button></div>
   ${footnote('Originais em LeonidaFieldNotes/originals · o acervo funciona mesmo com a pasta observada desconectada · <a class="lfn-link" href="https://www.playstation.com/pt-br/support/games/ps5-media-gallery-view-screenshots/" target="_blank" rel="noreferrer">Galeria de mídia e USB ↗</a>')}
</div>`;
 return `<div class="view view-noTool view-tabs">${head}
 ${pageTabs('sync',[['pasta','Pasta e importação',pane1],['psn','PlayStation',pane2],['como','Como funciona',pane3]])}
 </div>`;
}
/* ---------------------------------------------------------------- perfil, onboarding e backup */
function initials(name){const w=String(name||'Leonida Field').trim().split(/\s+/);return((w[0]||'L')[0]+((w[1]||w[0]||'F')[0])).toUpperCase();}
function applyProfile(){
 const name=app.profile.studio_name;
 $('.brand-subtitle').textContent=name?name.toUpperCase():'LEONIDA LENS';
 $('.avatar').textContent=initials(name);
 document.title=(name?name+' — ':'')+'Leonida Lens';
}
function bytesBR(n){n=Number(n||0);if(n<1024**2)return (n/1024).toFixed(0)+' KB';if(n<1024**3)return (n/1024**2).toFixed(1)+' MB';return (n/1024**3).toFixed(2)+' GB';}
function whenBR(iso){return iso?new Date(iso).toLocaleString('pt-BR'):'Nunca';}
function whenArq(iso){if(!iso)return '—';const d=new Date(iso);if(isNaN(d))return '—';return `${pad2(d.getDate())}.${pad2(d.getMonth()+1)}.${d.getFullYear()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;}

function renderStudio(){
 const b=app.backup||{},p=app.profile||{};
 const lastCopy=b.last_folder_backup||b.last_snapshot;
 const head=pageHead(escapeHtml(p.studio_name||'Seu estúdio'),{label:'FICHA DO FUNDO',actions:`<button class="lfn-btn" data-action="open-guide" type="button">Guia</button><button class="lfn-btn" data-action="open-wizard" type="button">Primeiros passos</button>`});
 const pane1=`<div class="two-col tab-cols"><div class="col">   <div class="lfn-rule"><span>Identidade</span></div>
   <form id="profile-form" class="profile-form"><div class="form-row-2"><div class="form-field lfn-field"><label>Nome do estúdio</label><input class="lfn-input" name="studio_name" required minlength="2" maxlength="60" value="${escAttr(p.studio_name||'')}"/></div>
   <div class="form-field lfn-field"><label>Assinatura</label><input class="lfn-input" name="photographer" maxlength="60" value="${escAttr(p.photographer||'')}"/></div></div>
   <div class="row-actions"><button class="lfn-btn lfn-btn--primary lfn-btn--sm" type="submit">Salvar</button><span class="lfn-label">APARECE NO ESTÚDIO E NA GALERIA</span></div></form>
</div><div class="col">   <div class="lfn-rule"><span>Onde ficam seus dados</span></div>
   <dl class="lfn-meta paths">${metaRow('Pasta do app',escapeHtml(b.data_dir||'—'),'is-mono is-path')}${metaRow('Originais',`${itens(app.photos.length)} · ${bytesBR(b.originals_bytes)}`)}${metaRow('Cópias do banco',`${b.snapshots||0} · ÚLTIMA ${escapeHtml(whenArq(b.last_snapshot))}`)}${metaRow('Token Sony','NUNCA ENTRA EM BACKUPS')}</dl>
   ${footnote(FAN_CREDIT)}
</div></div>`;
 const pane2=`<div class="tab-narrow">${renderSiteBlock()}</div>`;
 const pane3=`<div class="tab-narrow">   <div class="lfn-rule"><span>Cópia de segurança</span><span class="lfn-rule-count">ÚLTIMA CÓPIA: ${escapeHtml(whenArq(lastCopy))}</span></div>
   <div class="backup-block"><div><h4>Backup completo (.zip)</h4><p>Banco + todas as fotos originais num único arquivo. Guarde onde quiser.</p></div>
    <div class="row-actions"><a class="lfn-btn lfn-btn--primary lfn-btn--sm" href="/api/backup/full" download>Baixar backup</a><a class="lfn-btn lfn-btn--sm" href="/api/export" download="leonida-catalogo.json">Só o catálogo (JSON)</a></div></div>
   <div class="backup-block"><div><h4>Backup automático em pasta</h4><p>${b.backup_folder?`Copiando para <span class="lfn-mono">${escapeHtml(b.backup_folder)}</span> a cada 30 min. Último: <span class="lfn-mono">${escapeHtml(whenArq(b.last_folder_backup))}</span>.`:'Escolha um HD externo, pendrive ou pasta do OneDrive/Google Drive.'}</p>
    ${b.last_error?`<div class="inline-alert is-danger">${escapeHtml(b.last_error)}</div>`:''}</div>
    <div class="row-actions"><button class="lfn-btn lfn-btn--sm" data-action="pick-backup-folder" type="button">${b.backup_folder?'Trocar pasta':'Escolher pasta'}</button>${b.backup_folder?`<button class="lfn-btn lfn-btn--sm" data-action="backup-now" type="button" ${b.running?'disabled':''}>${b.running?'Copiando…':'Fazer backup agora'}</button>`:''}</div></div>
   <div class="backup-block"><div><h4>Restaurar backup</h4><p>Traz de volta fotos e dados de um .zip ou da pasta do backup automático; antes, o estado atual é guardado. Use também para mudar de computador.</p></div>
    <div class="row-actions"><button class="lfn-btn lfn-btn--sm" data-action="restore-backup" type="button">Escolher arquivo .zip</button><button class="lfn-btn lfn-btn--sm" data-wz-open-restore type="button">Restaurar de uma pasta</button></div></div>
</div>`;
 return `<div class="view view-noTool view-tabs">${head}
 ${pageTabs('studio',[['id','Identidade e dados',pane1],['look','Aparência',renderLookPane()],['site','Galeria online',pane2],['backup','Backup',pane3]])}
 </div>`;
}
/* ---------------------------------------------------------------- Sincronizar e publicar (botão fixo no topo) */
const SYNC_STEPS={start:'Preparando…',cloud:'Buscando na nuvem PlayStation…',folder:'Verificando a pasta…',site:'Enviando para o site…'};
function hhmm(iso){if(!iso)return '';const d=new Date(iso);return isNaN(d)?'':`${pad2(d.getDate())}/${pad2(d.getMonth()+1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;}
function paintDeploy(stepText){
 const el=$('#deploy-status');if(!el)return;
 const s=app.site||{};
 el.className='deploy-status';
 if(stepText){el.classList.add('is-busy');el.innerHTML=`<i></i>${escapeHtml(stepText)}`;return;}
 if(s.deploying){el.classList.add('is-busy');el.innerHTML='<i></i>Enviando site…';return;}
 if(s.last_error){el.classList.add('is-error');el.innerHTML=`<i></i><span title="${escAttr(s.last_error)}">Site com aviso</span>`;return;}
 if(s.url){el.classList.add('is-live');el.innerHTML=`<i></i><a href="${escAttr(s.url)}" target="_blank" rel="noopener" title="Abrir a galeria online">Site no ar${s.last_deploy?' · '+escapeHtml(hhmm(s.last_deploy)):''}</a>`;return;}
 el.innerHTML='<i></i>Site não conectado';
}
let syncPoll=null;
async function syncAll(){
 const btn=$('#btn-sync-all');if(!btn||btn.disabled)return;
 btn.disabled=true;btn.classList.remove('is-done');btn.classList.add('is-busy');
 const label=btn.querySelector('.deploy-label');
 try{await api('/api/sync-all',{method:'POST',body:{}});}
 catch(err){btn.disabled=false;btn.classList.remove('is-busy');toast('Não foi possível sincronizar: '+err.message,true);return;}
 clearInterval(syncPoll);
 syncPoll=setInterval(async()=>{
  let st;try{st=await api('/api/sync-all');}catch{return;}
  const txt=SYNC_STEPS[st.step]||'Sincronizando…';
  label.textContent=txt.replace('…','');paintDeploy(txt);
  if(st.running)return;
  clearInterval(syncPoll);
  const r=st.result||{added:0,notes:[],site:{}};
  try{app.site=await api('/api/site/status');}catch{}
  await loadAll(false);
  btn.disabled=false;btn.classList.remove('is-busy');
  const parts=[r.added?`${r.added} foto(s) nova(s)`:'Nenhuma foto nova'];
  if(r.site&&r.site.updated)parts.push(/já está/.test(r.site.message||'')?'site já estava em dia':'site atualizado');
  const warn=(r.notes||[]).filter(n=>!/não conectada/.test(n));
  toast(parts.join(' · ')+(warn.length?' — '+warn[0]:''),warn.length>0);
  if((r.notes||[]).some(n=>/não conectada/.test(n))&&!r.added&&!(r.site&&r.site.updated))toast((r.notes||[]).join(' '),true);
  btn.classList.add('is-done');label.textContent=r.added?`+${r.added} · Publicado`:'Tudo em dia';
  paintDeploy();
  setTimeout(()=>{btn.classList.remove('is-done');label.textContent='Sincronizar e publicar';},4500);
 },1200);
}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();syncAll();}});

async function refreshBackup(){try{app.backup=await api('/api/backup/status');}catch{}try{app.site=await api('/api/site/status');}catch{}}
function renderSiteBlock(){
 const s=app.site||{},hidden=app.photos.filter(p=>p.public===false).length;
 const state=s.deploying?'ENVIANDO…':s.pending?'ATUALIZAÇÃO NA FILA':s.last_error?'ATENÇÃO':s.url?'NO AR':'DESLIGADA';
 const connected=s.logged_in===true;
 const body=!s.enabled||!s.url&&!connected
  ?`<p>Publique a Galeria para outras pessoas visitarem (sem login, só visualização). Cada foto nova que entrar no Estúdio aparece no site sozinha. Hospedagem grátis na Cloudflare.</p>
    <div class="row-actions"><button class="lfn-btn lfn-btn--primary lfn-btn--sm" data-action="site-login" type="button" ${s.login_open?'disabled':''}>${s.login_open?'Aguardando você no navegador…':'Conectar Cloudflare e publicar'}</button></div>
    <p class="lfn-label" style="margin-top:10px">UMA VEZ SÓ: ENTRE NA CLOUDFLARE (OU CRIE A CONTA GRÁTIS) E CLIQUE EM ALLOW</p>
    <p>Plano gratuito: não pede cartão de crédito e não tem cobrança automática (se um limite for atingido, a Cloudflare só pausa novos envios). Cada pessoa usa a própria conta, então cada galeria é separada. <button class="lfn-linkbtn" type="button" data-action="open-guide" data-topic="site">ver o guia</button></p>`
  :`<dl class="lfn-meta">${metaRow('Endereço',s.url?`<a href="${escAttr(s.url)}" target="_blank" rel="noopener" class="lfn-mono">${escapeHtml(s.url.replace('https://',''))}</a>`:'—')}${metaRow('Publicadas',`${s.published_count||0} · ${hidden} oculta(s)`)}${metaRow('Última atualização',escapeHtml(whenArq(s.last_deploy)))}${metaRow('Sincronização',s.enabled?'AUTOMÁTICA':'PAUSADA')}</dl>
    ${s.last_error?`<div class="inline-alert is-danger">${escapeHtml(s.last_error)}</div>`:''}
    <div class="row-actions">${s.url?`<a class="lfn-btn lfn-btn--primary lfn-btn--sm" href="${escAttr(s.url)}" target="_blank" rel="noopener">Abrir site ↗</a>`:''}<button class="lfn-btn lfn-btn--sm" data-action="site-publish" type="button" ${s.deploying?'disabled':''}>${s.deploying?'Enviando…':'Atualizar agora'}</button><button class="lfn-btn lfn-btn--sm" data-action="site-toggle" type="button">${s.enabled?'Pausar':'Retomar'}</button>${connected?'':`<button class="lfn-btn lfn-btn--sm" data-action="site-login" type="button">Reconectar</button>`}</div>
    <p class="lfn-label" style="margin-top:10px">PARA ESCONDER UMA FOTO: ABRA A FICHA E DESMARQUE “PUBLICAR NA GALERIA ONLINE”</p>`;
 return `<div class="lfn-rule"><span>Galeria online</span><span class="lfn-rule-count">${state}</span></div><div class="backup-block site-block">${body}</div>`;
}
async function pickBackupFolder(){
 try{const r=await api('/api/pick-folder',{method:'POST',body:{purpose:'backup'}});
  if(r.cancelled)return;toast('Pasta de backup definida. Primeira cópia em andamento…');await refreshBackup();
  if(wizardOpen())renderWizard();else render();
 }catch(err){toast(err.message,true);}
}
async function restoreBackup(file){
 if(!file)return;
 if(wizardOpen()){wizardRestoreZip(file);return;}
 if(!confirm(`Restaurar "${file.name}"?\n\nOs dados atuais serão substituídos pelos do backup (uma cópia de segurança do estado atual é guardada antes).`))return;
 toast('Restaurando backup… não feche o app.');
 try{const data=await uploadRestore(file);
  toast(`Backup restaurado: ${data.photos} fotos.`);await afterRestore();render();
 }catch(err){toast('Não foi possível restaurar: '+err.message,true);}
}

/* ---- mapa colorido ou P&B (mesma preferência da galeria: chave lfn.mapcolor) */
function mapColorOn(){try{return localStorage.getItem('lfn.mapcolor')==='1';}catch{return false;}}
function setMapColorPref(on){try{localStorage.setItem('lfn.mapcolor',on?'1':'0');}catch{}document.body.classList.toggle('map-color',on);}
document.body.classList.toggle('map-color',mapColorOn());
/* ---- ficha de campo rápida */
const WEATHER=['Ensolarado','Nublado','Chuva','Tempestade','Neblina','Pôr do sol','Noite limpa'];
const fieldOf=p=>({location:p.location||'',map_x:p.map_x??null,map_y:p.map_y??null,game_time:p.game_time||'',weather:p.weather||''});
const hasField=f=>!!(f&&(f.location||f.map_x!=null||f.game_time||f.weather));
const fieldSummary=f=>[f.location||(f.map_x!=null?'ponto no mapa':''),f.game_time,f.weather].filter(Boolean).join(' · ');
// "Igual à anterior": a última ficha salva nesta sessão; senão, a foto capturada logo antes desta que tenha ficha.
function repeatSource(photo){
 if(hasField(app.lastField)&&app.lastField.id!==photo.id)return app.lastField;
 const before=[...app.photos].sort(cmpAcc).filter(p=>p.id!==photo.id&&cmpAcc(p,photo)<0&&hasField(fieldOf(p)));
 const p=before.pop();return p?{...fieldOf(p),id:p.id}:null;
}
// 1840 → 18:40 · 640 → 06:40 · 18h40 → 18:40 (texto livre como "Amanhecer" fica como está)
function normTime(v){
 const s=String(v||'').trim();if(!s||/[a-gi-z]/i.test(s))return s;
 const d=s.replace(/\D/g,'');if(!/^\d{3,4}$/.test(d))return s;
 const h=Number(d.slice(0,d.length-2)),m=Number(d.slice(-2));
 return h<24&&m<60?`${pad2(h)}:${pad2(m)}`:s;
}
function fillField(form,f){
 form.location.value=f.location||'';form.game_time.value=f.game_time||'';form.weather.value=f.weather||'';
 if(f.map_x!=null)app.setPin?.(f.map_x,f.map_y,true);else app.clearPin?.();
 syncWeatherChips(form);form.dataset.dirty='1';
}
function syncWeatherChips(form){$$('[data-weather]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.weather===form.weather.value.trim())));}
function dialogShow(dialog,html){const d=$(dialog);d.querySelector('div').innerHTML=html;if(!d.open)d.showModal();}
function openPhoto(photoId){
 const photo=app.photos.find(p=>p.id===photoId);if(!photo)return;
 reindex();
 app.activePhoto=photoId;
 const list=getVisiblePhotos(),index=list.findIndex(p=>p.id===photoId);
 const prev=index>0?list[index-1]?.id:null,next=index>=0?list[index+1]?.id:null;
 const essaysSorted=[...app.essays].sort((a,b)=>lfnCmp(a.created_at,b.created_at)||lfnCmp(String(a.id),String(b.id)));
 const opts=[`<option value="">Nenhum ensaio</option>`,...essaysSorted.map(e=>`<option value="${e.id}" ${photo.essay_id===e.id?'selected':''}>${serieOf(e.id)} · ${escapeHtml(e.title)}</option>`)].join('');
 const t=tombo(photo), dims=photo.width&&photo.height?`${photo.width} × ${photo.height}`:'—';
 const rep=repeatSource(photo);
 const ticks=list.length&&index>=0?`<div class="lfn-ruler viewer-ruler"><div class="lfn-ruler-ticks">${list.map((p,i)=>`<i${i===index?' class="on"':''}></i>`).join('')}</div><span class="lfn-ruler-count">${pad2(index+1)} / ${pad2(list.length)}</span></div>`:'<div class="viewer-ruler"></div>';
 dialogShow('#photoDialog',`<div class="photo-dialog-layout"><div class="photo-viewer">
 <div class="viewer-stage"><img src="${photo.image_url}" alt="${escAttr(photo.title||t)}"/>
 <div class="viewer-file">${escapeHtml(photo.filename)}</div>
 ${prev?`<button class="viewer-nav prev" data-photo-nav="${prev}" aria-label="Foto anterior" type="button">${svg('chevronleft',20)}</button>`:''}
 ${next?`<button class="viewer-nav next" data-photo-nav="${next}" aria-label="Próxima foto" type="button">${svg('chevronright',20)}</button>`:''}</div>
 ${ticks}
 <div class="viewer-bottom lfn-tarja"><span>${escapeHtml(photo.filename)}</span><span>${dims} · ${dateArq(photo.date_taken)} · ${t}</span></div></div>
 <div class="inspector"><header class="close-row"><div><div class="lfn-label">FICHA CATALOGRÁFICA</div><div class="insp-id"><span class="lfn-accession lfn-accession--lg">${t}</span>${complete(photo)}${photo.favorite?'<span class="lfn-stamp lfn-stamp--accent">SELECIONADA</span>':''}</div></div><button class="lfn-btn lfn-btn--ghost close-btn" data-action="close-photo" aria-label="Fechar" type="button">${svg('close',18)}</button></header>
 <form id="photo-edit-form" data-id="${photo.id}" data-tab="${app.inspTab||'campo'}">
 <nav class="insp-tabs" role="tablist"><button type="button" class="lfn-tab" data-insp-tab="campo">Campo</button><button type="button" class="lfn-tab" data-insp-tab="arquivo">Arquivo</button></nav>
 <div class="insp-body">
 <section class="insp-group insp-field insp-pane" data-pane="campo">
 ${rep?`<button type="button" class="field-repeat" data-action="field-repeat" title="Copia local, ponto no mapa, hora e clima"><b>↺ Igual à anterior</b><span>${escapeHtml(fieldSummary(rep))}</span></button>`:''}
 <div class="form-field lfn-field"><label>Lugar / bairro</label><input class="lfn-input" name="location" id="pick-location" maxlength="120" value="${escAttr(photo.location||'')}" placeholder="Digite e escolha um lugar de Leonida" list="places-list" autocomplete="off"/></div>
 <div class="form-field lfn-field"><div id="pick-map" class="pick-map lfn-map"></div>
 <div class="pick-row"><span id="pick-status">${photo.map_x!=null?pinText(photo.map_x,photo.map_y):'Nenhum ponto · clique no local da foto'}</span><span class="pick-actions"><button type="button" class="lfn-link linkbutton" data-action="map-color" aria-pressed="${mapColorOn()}" title="Mapa oficial colorido ou preto e branco">${mapColorOn()?'P&amp;B':'COR'}</button><button type="button" class="lfn-link linkbutton" data-action="clear-pin">LIMPAR PONTO</button></span></div>
 <input type="hidden" name="map_x" value="${photo.map_x??''}"/><input type="hidden" name="map_y" value="${photo.map_y??''}"/></div>
 <div class="form-row-2"><div class="form-field lfn-field"><label>Hora no jogo</label><input class="lfn-input lfn-input--mono" name="game_time" id="pick-time" maxlength="40" value="${escAttr(photo.game_time||'')}" placeholder="1840 → 18:40" inputmode="numeric" autocomplete="off"/></div>
 <div class="form-field lfn-field"><label>Clima</label><input class="lfn-input" name="weather" id="pick-weather" maxlength="60" value="${escAttr(photo.weather||'')}" placeholder="Toque abaixo ou digite" autocomplete="off"/></div></div>
 <div class="weather-chips" role="group" aria-label="Clima">${WEATHER.map(w=>`<button type="button" class="lfn-chip" data-weather="${escAttr(w)}" aria-pressed="${photo.weather===w}">${escapeHtml(w)}</button>`).join('')}</div>
 <div class="form-field lfn-field"><label>Frase de campo <button class="lfn-linkbtn" data-action="suggest-into" data-target="notes" type="button">sugerir</button></label><textarea class="lfn-input" name="notes" maxlength="6000" rows="2" placeholder="vazio = frase automática no site">${escapeHtml(photo.notes||'')}</textarea></div></section>
 <section class="insp-group insp-pane" data-pane="arquivo"><div class="lfn-rule"><span>Identificação</span></div>
 <div class="form-field lfn-field"><label>Título <button class="lfn-linkbtn" data-action="suggest-into" data-target="title" type="button">sugerir</button></label><input class="lfn-input" name="title" maxlength="140" value="${escAttr(photo.title||'')}" placeholder="vazio = título automático"/></div>
 <div class="form-field lfn-field"><label>Ensaio</label><select class="lfn-input" name="essay_id">${opts}</select></div>
 <div class="lfn-rule"><span>Avaliação</span></div>
 <div class="rating-line"><div class="star-row" id="star-row">${[1,2,3,4,5].map(i=>`<button type="button" class="star-btn ${photo.rating>=i?'selected':''}" data-rate="${i}" aria-label="${i} estrelas">★</button>`).join('')}</div><input id="photo-rating" name="rating" type="hidden" value="${photo.rating||0}"/>
 <label class="fav-toggle"><input name="favorite" type="checkbox" ${photo.favorite?'checked':''}/><span>Selecionada (favorita)</span></label>
 <label class="fav-toggle"><input name="public" type="checkbox" ${photo.public!==false?'checked':''}/><span>Publicar na galeria online</span></label></div>
 <div class="lfn-rule"><span>Arquivo</span></div>
 <dl class="lfn-meta lfn-meta--compact">${metaRow('Data da captura',dateArq(photo.date_taken))}${metaRow('Dimensões',dims)}${metaRow('Arquivo original',escapeHtml(photo.filename))}${metaRow('ID interno',escapeHtml(String(photo.id).slice(0,6)))}</dl></section>
 </div>
 <div class="footer"><div class="footer-actions">${next?`<button class="lfn-btn lfn-btn--primary" type="submit" data-next="${next}" title="Ctrl+Enter">Salvar e próxima →</button><button class="lfn-btn" type="submit">Salvar</button>`:`<button class="lfn-btn lfn-btn--primary" type="submit">Salvar ficha</button>`}<a class="lfn-btn lfn-btn--ghost" href="/galeria/#/foto/${photo.id}" title="Tela cheia com zoom">Galeria ↗</a></div><div class="lfn-label footer-note">CTRL+ENTER SALVA E AVANÇA · ← → SALVAM SOZINHO</div></div></form></div></div>`);
 const ae=document.activeElement;if(ae&&ae!==document.body&&ae.closest('#photoDialog'))ae.blur();
 initViewerZoom();
 initPickMap(photo);
}
// Zoom da foto na ficha: clique amplia no ponto clicado; arrastar move; clique sem arrastar volta ao normal.
function initViewerZoom(){
 const stage=document.querySelector('#photoDialog .viewer-stage'),img=stage?.querySelector('img');if(!img)return;
 let drag=null,moved=false;
 stage.addEventListener('click',e=>{
  if(e.target.closest('.viewer-nav'))return;
  if(moved){moved=false;return;}
  if(stage.classList.contains('is-zoom')){stage.classList.remove('is-zoom');stage.scrollTo(0,0);return;}
  if(e.target!==img)return;
  const r=img.getBoundingClientRect(),fx=(e.clientX-r.left)/r.width,fy=(e.clientY-r.top)/r.height;
  stage.classList.add('is-zoom');
  requestAnimationFrame(()=>{stage.scrollLeft=img.offsetWidth*fx-stage.clientWidth/2;stage.scrollTop=img.offsetHeight*fy-stage.clientHeight/2;});
 });
 stage.addEventListener('pointerdown',e=>{if(!stage.classList.contains('is-zoom')||e.button!==0)return;drag={x:e.clientX,y:e.clientY,l:stage.scrollLeft,t:stage.scrollTop};moved=false;stage.setPointerCapture(e.pointerId);});
 stage.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>4){moved=true;stage.classList.add('is-panning');}stage.scrollLeft=drag.l-dx;stage.scrollTop=drag.t-dy;});
 stage.addEventListener('pointerup',()=>{drag=null;stage.classList.remove('is-panning');});
 img.draggable=false;
}
async function loadPlaces(){
 if(app.places)return app.places;
 try{const r=await fetch('/vendor/leonida-places.json');app.places=(await r.json()).places;}catch{app.places=[];}
 let dl=document.getElementById('places-list');
 if(!dl){dl=document.createElement('datalist');dl.id='places-list';document.body.appendChild(dl);}
 dl.innerHTML=app.places.map(p=>`<option value="${escAttr(p.n)}">${escapeHtml(p.a)}</option>`).join('');
 return app.places;
}
function initPickMap(photo){
 if(app.pickMap){app.pickMap.remove();app.pickMap=null;}
 const el=document.getElementById('pick-map');if(!el||!window.LeonidaMap)return;
 const form=document.getElementById('photo-edit-form');
 const map=LeonidaMap.create(el,{style:'night'});app.pickMap=map;
 let marker=null;
 const pinIcon=window.L&&L.divIcon?L.divIcon({className:'lfn-pin',iconSize:[14,14]}):null;
 const setPin=(x,y,pan,initial)=>{
  const ll=LeonidaMap.toLatLng(x,y);
  if(marker)marker.setLatLng(ll);else marker=L.marker(ll,pinIcon?{draggable:true,icon:pinIcon}:{draggable:true}).addTo(map).on('dragend',()=>{const q=LeonidaMap.fromLatLng(marker.getLatLng());setPin(q.x,q.y,false);});
  form.map_x.value=x.toFixed(2);form.map_y.value=y.toFixed(2);
  document.getElementById('pick-status').textContent=pinText(x,y);
  if(!initial)form.dataset.dirty='1';
  if(ghost){map.removeLayer(ghost);ghost=null;}
  if(pan)map.setView(ll,Math.max(map.getZoom(),2.5));
 };
 app.setPin=setPin;
 app.clearPin=()=>{if(marker){map.removeLayer(marker);marker=null;}form.map_x.value='';form.map_y.value='';form.dataset.dirty='1';document.getElementById('pick-status').textContent='Nenhum ponto · clique no local da foto';};
 // Sem ponto ainda: o mapa já abre onde foi o último ponto, com uma marca fantasma (clique nela = mesmo lugar).
 let ghost=null;const last=app.lastPin;
 if(photo.map_x!=null)setPin(photo.map_x,photo.map_y,true,true);
 else if(last){
  map.setView(LeonidaMap.toLatLng(last.x,last.y),2.5,{animate:false});
  ghost=L.marker(LeonidaMap.toLatLng(last.x,last.y),{icon:L.divIcon({className:'lfn-pin lfn-pin--ghost',iconSize:[14,14]}),title:'Último ponto · clique para usar o mesmo'}).addTo(map).on('click',()=>setPin(last.x,last.y,false));
 }
 map.on('click',e=>{const q=LeonidaMap.fromLatLng(e.latlng);setPin(q.x,q.y,false);});
 setTimeout(()=>map.invalidateSize(),80);
 setTimeout(()=>{if(app.pickMap===map){map.invalidateSize();if(marker)map.setView(marker.getLatLng(),Math.max(map.getZoom(),2.5),{animate:false});else if(last)map.setView(LeonidaMap.toLatLng(last.x,last.y),2.5,{animate:false});}},250);
 form.addEventListener('input',()=>{form.dataset.dirty='1';});
 form.addEventListener('change',()=>{form.dataset.dirty='1';});
 const time=document.getElementById('pick-time');time?.addEventListener('blur',()=>{time.value=normTime(time.value);});
 document.getElementById('pick-weather')?.addEventListener('input',()=>syncWeatherChips(form));
 loadPlaces().then(places=>{
  const input=document.getElementById('pick-location');if(!input)return;
  input.addEventListener('change',()=>{const hit=places.find(p=>p.n.toLowerCase()===input.value.trim().toLowerCase());if(hit)setPin(hit.x,hit.y,true);});
 });
}
function openEssayForm(){
 reindex();
 dialogShow('#formDialog',`<div class="form-wrap"><header class="dlg-head"><span class="lfn-label">NOVO ENSAIO · ${app.serieNext}</span><button class="lfn-btn lfn-btn--ghost close-btn" data-action="close-form" type="button" aria-label="Fechar">${svg('close',16)}</button></header>
 <form id="essay-form" class="dlg-form"><div class="dlg-body lfn-scroll"><h2 class="dialog-title lfn-serif">Novo ensaio</h2><p class="dialog-desc">Uma ideia aberta, não uma obrigação. Você poderá atribuir fotografias depois.</p>
 <div class="form-fields"><div class="form-field lfn-field"><label>Título da série</label><input class="lfn-input" name="title" maxlength="110" required placeholder="Ex.: Vidas à margem da avenida" autofocus/></div><div class="form-field lfn-field"><label>Qual é a sua curiosidade?</label><textarea class="lfn-input" name="description" maxlength="1500" placeholder="Algo que você percebeu e gostaria de explorar…"></textarea></div></div></div>
 <div class="form-footer"><button class="lfn-btn lfn-btn--ghost" data-action="close-form" type="button">Cancelar</button><button class="lfn-btn lfn-btn--primary" type="submit">Abrir série</button></div></form></div>`);
}
function openJournalForm(id=null){
 const entry=id?app.entries.find(j=>j.id===id):null;
 app.journalId=id;
 dialogShow('#formDialog',`<div class="form-wrap"><header class="dlg-head"><span class="lfn-label">${entry?'EDITAR REGISTRO DE CAMPO':'NOVO REGISTRO DE CAMPO'}</span><button class="lfn-btn lfn-btn--ghost close-btn" data-action="close-form" type="button" aria-label="Fechar">${svg('close',16)}</button></header>
 <form id="journal-form" class="dlg-form"><div class="dlg-body lfn-scroll"><h2 class="dialog-title lfn-serif">${entry?escapeHtml(entry.title):'O que ficou na memória?'}</h2><p class="dialog-desc">Uma linha verdadeira vale mais que uma página inventada.</p>
 <div class="form-fields"><div class="form-field lfn-field"><label>Título</label><input class="lfn-input" name="title" required maxlength="140" value="${escAttr(entry?.title||'')}" placeholder="Ex.: A esquina que parecia vazia"/></div>
 <div class="form-row-2"><div class="form-field lfn-field"><label>Local</label><input class="lfn-input" name="place" maxlength="130" value="${escAttr(entry?.place||'')}" placeholder="Ex.: Ocean Beach"/></div>
 <div class="form-field lfn-field"><label>Data do registro (real)</label><input class="lfn-input lfn-input--mono" type="date" name="day_at" required value="${escAttr(entry?.day_at||todayLocal())}"/></div></div>
 <div class="form-field lfn-field"><label>Anotação</label><textarea class="lfn-input" name="body" maxlength="10000" style="min-height:155px" placeholder="Onde fui, o que percebi, o que quero revisitar…">${escapeHtml(entry?.body||'')}</textarea></div></div></div>
 <div class="form-footer"><button class="lfn-btn lfn-btn--ghost" data-action="close-form" type="button">Cancelar</button><button class="lfn-btn lfn-btn--primary" type="submit">${entry?'Salvar registro':'Guardar no caderno'}</button></div></form></div>`);
}
async function savePhotoForm(form){
 const id=form.dataset.id;
 if(form.game_time)form.game_time.value=normTime(form.game_time.value);
 const fd=new FormData(form);
 const payload={title:fd.get('title'),location:fd.get('location'),essay_id:fd.get('essay_id')||null,notes:fd.get('notes'),game_time:fd.get('game_time'),weather:fd.get('weather'),map_x:fd.get('map_x')||null,map_y:fd.get('map_y')||null,public:fd.has('public'),rating:Number(fd.get('rating')),favorite:fd.has('favorite')};
 const result=await api('/api/photos/'+id,{method:'PATCH',body:payload});
 const i=app.photos.findIndex(p=>p.id===id);if(i>=0)app.photos[i]=result.photo;
 const f=fieldOf(result.photo);
 if(hasField(f))app.lastField={...f,id};
 if(f.map_x!=null)app.lastPin={x:f.map_x,y:f.map_y};
 form.dataset.dirty='';
 return result.photo;
}
async function refreshAfterSave(){
 try{app.essays=(await api('/api/essays')).essays;}catch{}
 reindex();render();
}
async function updatePhoto(form,nextId){
 const id=form.dataset.id;
 await savePhotoForm(form);
 const code=app.acc.get(id)||'LFN-0000-0000';
 if(nextId&&app.photos.some(p=>p.id===nextId)){openPhoto(nextId);toast(`Ficha ${code} salva · próxima`);}
 else{$('#photoDialog').close();toast(`Ficha ${code} atualizada`);}
 refreshAfterSave();
}
// Navegar com ← → ou pelas setas da foto: se a ficha foi mexida, salva antes de trocar.
async function goPhoto(id){
 const form=document.getElementById('photo-edit-form');
 if(form&&form.dataset.dirty){
  try{await savePhotoForm(form);toast(`Ficha ${app.acc.get(form.dataset.id)||''} salva`);refreshAfterSave();}
  catch(err){toast(err.message,true);return;}
 }
 openPhoto(id);
}
// Fechar pelo X ou com Esc também guarda o que foi digitado (como as setas fazem).
async function closePhotoSaving(){
 const form=document.getElementById('photo-edit-form');
 if(form&&form.dataset.dirty){
  try{await savePhotoForm(form);toast(`Ficha ${app.acc.get(form.dataset.id)||''} salva`);refreshAfterSave();}
  catch(err){toast(err.message,true);return;}
 }
 $('#photoDialog').close();
}
async function createEssay(form){
 const fd=new FormData(form);const result=await api('/api/essays',{method:'POST',body:{title:fd.get('title'),description:fd.get('description')}});
 app.essays=(await api('/api/essays')).essays;reindex();$('#formDialog').close();
 const code=result?.essay?.id?serieOf(result.essay.id):'Ensaio';
 toast(`${code} aberta. Abra uma ficha para incluir fotos.`);setView('essays');
}
async function saveJournal(form){
 const fd=new FormData(form),payload={title:fd.get('title'),place:fd.get('place'),day_at:fd.get('day_at'),body:fd.get('body')};
 const id=app.journalId;
 await api(id?'/api/journal/'+id:'/api/journal',{method:id?'PATCH':'POST',body:payload});
 app.entries=(await api('/api/journal')).entries;$('#formDialog').close();toast('Registro salvo no caderno.');updateSidebar();render();
}
async function chooseFolder(){
 try{
  toast('Abrindo o seletor de pastas…');
  const d=await api('/api/pick-folder',{method:'POST',body:{}});
  if(d.ok){app.status=(await api('/api/status'));toast('Pasta conectada. Iniciando verificação.');render();updateSidebar();}
 }catch(e){toast(e.message,true);}
}
async function saveFolder(){
 try{const path=$('#watch-folder')?.value||'';const d=await api('/api/settings',{method:'POST',body:{watch_folder:path}});app.status=(await api('/api/status'));toast('Pasta monitorada atualizada.');render();updateSidebar();}
 catch(e){toast(e.message,true);}
}
async function scanNow(){
 try{await api('/api/scan',{method:'POST',body:{}});toast('Verificação solicitada. Aguarde alguns segundos.');}
 catch(e){toast(e.message,true);}
}
async function importFiles(fileList){
 const files=[...fileList].filter(f=>/\.(jpe?g|png|webp)$/i.test(f.name));
 if(!files.length)return toast('Selecione imagens JPG, PNG ou WEBP.',true);
 let added=0,duplicates=0,failed=0;app.busy=true;
 for(let i=0;i<files.length;i++){
  const f=files[i];toast(`Importando ${i+1} de ${files.length}: ${short(f.name,45)}`);
  try{
   const r=await api('/api/import',{method:'POST',headers:{'X-File-Name':encodeURIComponent(f.name),'X-File-Modified':String(f.lastModified||''),'Content-Type':'application/octet-stream'},body:f});
   if(r.created)added++;else duplicates++;
  }catch(e){failed++;console.error('Importação',f.name,e);}
 }
 app.busy=false;await loadAll(false);
 toast(`${added} nova(s) fotografia(s), ${duplicates} duplicada(s)${failed?`, ${failed} falha(s)`:''}.`,failed>0);
}
function bindEvents(){
 document.addEventListener('click',async e=>{
  const nav=e.target.closest('[data-view]');if(nav){setView(nav.dataset.view);return;}
  const photo=e.target.closest('[data-photo]');if(photo){openPhoto(photo.dataset.photo);return;}
  const itab=e.target.closest('[data-insp-tab]');if(itab){app.inspTab=itab.dataset.inspTab;const f=itab.closest('form');f.dataset.tab=app.inspTab;if(app.inspTab==='campo')setTimeout(()=>app.pickMap?.invalidateSize(),30);return;}
  const ptab=e.target.closest('[data-ptab]');if(ptab){const [g,k]=ptab.dataset.ptab.split(':');app.pageTab[g]=k;showPageTab(ptab.closest('.ptabs-wrap'),k);return;}
  const pnav=e.target.closest('[data-photo-nav]');if(pnav){goPhoto(pnav.dataset.photoNav);return;}
  const wx=e.target.closest('[data-weather]');if(wx){const form=wx.closest('form');if(form){form.weather.value=form.weather.value===wx.dataset.weather?'':wx.dataset.weather;form.dataset.dirty='1';syncWeatherChips(form);}return;}
  const essay=e.target.closest('[data-essay]');if(essay){app.activeEssay=essay.dataset.essay;app.filter='all';app.query='';setView('photos');return;}
  const journal=e.target.closest('[data-journal]');if(journal){openJournalForm(journal.dataset.journal);return;}
  const filter=e.target.closest('[data-filter]');if(filter){app.filter=filter.dataset.filter;$$('[data-filter]').forEach(x=>x.classList.toggle('active',x.dataset.filter===app.filter));renderPhotoArea();return;}
  const rate=e.target.closest('[data-rate]');if(rate){const rating=Number(rate.dataset.rate);$('#photo-rating').value=rating;$$('[data-rate]').forEach(x=>x.classList.toggle('selected',Number(x.dataset.rate)<=rating));return;}
  if(await onboardingClick(e))return;
  const action=e.target.closest('[data-action]');if(!action)return;
  switch(action.dataset.action){
   case 'import':$('#fileInput').click();break;
   case 'clear-pin':app.clearPin?.();break;
   case 'map-color':{const on=!mapColorOn();setMapColorPref(on);action.textContent=on?'P&B':'COR';action.setAttribute('aria-pressed',String(on));break;}
   case 'field-repeat':{const form=action.closest('form');const ph=app.photos.find(p=>p.id===form?.dataset.id);const src=ph&&repeatSource(ph);if(src){fillField(form,src);toast('Local, ponto, hora e clima copiados. Ajuste o que mudou.');}break;}
   case 'open-wizard':openWizard(0);break;
   case 'open-guide':openGuide(action.dataset.topic,action.dataset.sub);break;
   case 'essay-seed':{const r=await essayCall('/api/essays/seed');if(r)toast(r.created?`${r.created} ensaio(s)-pauta criados. Escolha as fotos de cada pauta.`:'Os ensaios-pauta já existem.');break;}
   case 'essay-open':app.essayOpen=action.dataset.id;render();break;
   case 'essay-publish':{const e=app.essays.find(x=>x.id===action.dataset.id);if(e){const r=await essayCall(`/api/essays/${e.id}`,'PATCH',{published:!e.published});if(r)toast(e.published?'Ensaio tirado do site.':'Ensaio publicado. Use “Sincronizar e publicar” para mandar ao site.');}break;}
   case 'essay-edit':openEssayEditor(action.dataset.id);break;
   case 'essay-delete':{const e=app.essays.find(x=>x.id===action.dataset.id);if(e&&confirm(`Excluir o ensaio "${e.title}"? As fotos continuam no acervo.`)){await essayCall(`/api/essays/${e.id}/delete`);app.essayOpen=null;render();}break;}
   case 'essay-add-slot':await essayCall(`/api/essays/${action.dataset.id}/add-slot`);break;
   case 'essay-acervo':app.activeEssay=action.dataset.id;app.filter='all';app.query='';setView('photos');break;
   case 'essay-preview':app.previewHash=`#/ensaio/${action.dataset.id}`;app.previewPublic=false;setView('preview');break;
   case 'slot-pick':openSlotPicker(action.dataset.id);break;
   case 'slot-assign':await essayCall(`/api/slots/${action.dataset.slot}/assign`,'POST',{photo_id:action.dataset.pick});$('#formDialog').close();toast('Foto colocada na pauta.');break;
   case 'slot-clear':await essayCall(`/api/slots/${action.dataset.id}/clear`);break;
   case 'slot-edit':openSlotEditor(action.dataset.id);break;
   case 'slot-open-photo':openPhoto(action.dataset.id);break;
   case 'suggest-into':await suggestInto(action.closest('form'),action.dataset.target);break;
   case 'preview-mode':app.previewPublic=action.dataset.mode==='public';render();break;
   case 'preview-reload':{const f=$('#preview-frame');if(f)f.src=f.src;break;}
   case 'site-login':try{const r=await api('/api/site/login',{method:'POST',body:{}});toast(r.message);await refreshBackup();render();}catch(err){toast(err.message,true);}break;
   case 'site-toggle':try{app.site=await api('/api/site/enable',{method:'POST',body:{enabled:!app.site?.enabled}});render();}catch(err){toast(err.message,true);}break;
   case 'site-publish':try{action.disabled=true;action.textContent='Enviando…';const r=await api('/api/site/publish',{method:'POST',body:{}});toast(r.message);}catch(err){toast(err.message,true);}await refreshBackup();render();break;
   case 'pick-backup-folder':await pickBackupFolder();break;
   case 'backup-now':try{action.disabled=true;const r=await api('/api/backup/run',{method:'POST',body:{}});toast(`Backup concluído: ${r.copied} foto(s) nova(s) copiada(s).`);}catch(err){toast(err.message,true);}await refreshBackup();render();break;
   case 'restore-backup':$('#restoreInput').click();break;
   case 'go-sync':setView('sync');break;
   case 'new-idea':app.ideaIndex++;renderPauta();break;
   case 'all-photos':app.activeEssay=null;app.filter='all';app.query='';render();break;
   case 'new-essay':openEssayForm();break;
   case 'new-journal':openJournalForm();break;
   case 'close-form':$('#formDialog').close();break;
   case 'close-photo':await closePhotoSaving();break;
   case 'pick-folder':await chooseFolder();break;
   case 'save-folder':await saveFolder();break;
   case 'scan':await scanNow();break;
   case 'psn-sync': await psnAction('/api/psn/sync',{},'Verificando a nuvem da Sony…');break;
   case 'psn-disconnect':if(confirm('Desconectar a conta Sony e apagar os tokens salvos neste PC? As fotos já importadas serão preservadas.')) await psnAction('/api/psn/disconnect',{},'Sessão Sony removida deste PC.');break;
   case 'psn-options': await psnAction('/api/psn/options',{auto:!!$('#psn-auto')?.checked,only_gta:!!$('#psn-only-gta')?.checked},'Opções da nuvem salvas.');break;
  }
 });
 document.addEventListener('submit',async e=>{
  if(e.target.id==='psn-connect-form'){e.preventDefault();await connectPsn(e.target);return;}
  if(e.target.id==='slot-form'){e.preventDefault();const fd=new FormData(e.target);const r=await essayCall(`/api/slots/${e.target.dataset.id}`,'PATCH',Object.fromEntries(fd.entries()));if(r){$('#formDialog').close();toast('Pauta salva.');}return;}
  if(e.target.id==='essay-edit-form'){e.preventDefault();const fd=new FormData(e.target);const r=await essayCall(`/api/essays/${e.target.dataset.id}`,'PATCH',Object.fromEntries(fd.entries()));if(r){$('#formDialog').close();toast('Ensaio salvo.');}return;}
  if(await onboardingSubmit(e))return;
  if(e.target.id==='profile-form'){e.preventDefault();const fd=new FormData(e.target);try{app.profile=await api('/api/profile',{method:'POST',body:{studio_name:fd.get('studio_name'),photographer:fd.get('photographer')}});applyProfile();toast('Ficha do fundo atualizada.');render();}catch(err){toast(err.message,true);}return;}
  if(!['photo-edit-form','essay-form','journal-form'].includes(e.target.id))return;
  e.preventDefault();const form=e.target;const button=form.querySelector('button[type=submit]');if(button)button.disabled=true;
  try{if(form.id==='photo-edit-form')await updatePhoto(form,e.submitter?.dataset.next);else if(form.id==='essay-form')await createEssay(form);else await saveJournal(form);}
  catch(err){toast(err.message,true);if(button)button.disabled=false;}
 });
 $('#fileInput').addEventListener('change',e=>{importFiles(e.target.files);e.target.value='';});
 $('#restoreInput').addEventListener('change',e=>{restoreBackup(e.target.files[0]);e.target.value='';});
 $('#open-quick-import').addEventListener('click',()=>$('#fileInput').click());
 $('#btn-sync-all').addEventListener('click',syncAll);
 $('#photoDialog').addEventListener('close',()=>{if(app.pickMap){app.pickMap.remove();app.pickMap=null;}});
 $('#photoDialog').addEventListener('cancel',e=>{const f=document.getElementById('photo-edit-form');if(f&&f.dataset.dirty){e.preventDefault();closePhotoSaving();}});
 document.addEventListener('keydown',e=>{
  if($('#photoDialog').open && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){
   const list=getVisiblePhotos(),i=list.findIndex(p=>p.id===app.activePhoto);
   if(e.key==='ArrowRight' && list[i+1]){goPhoto(list[i+1].id);}
   if(e.key==='ArrowLeft' && list[i-1]){goPhoto(list[i-1].id);}
  }
  if($('#photoDialog').open && e.key==='Enter' && (e.ctrlKey||e.metaKey)){
   const form=document.getElementById('photo-edit-form');
   if(form){e.preventDefault();form.requestSubmit(form.querySelector('[data-next]')||undefined);}
  }
 });
 ['dragenter','dragover'].forEach(type=>document.addEventListener(type,e=>{if(![...e.dataTransfer.types].includes('Files'))return;e.preventDefault();$('#content').classList.add('drop-highlight');}));
 ['dragleave','drop'].forEach(type=>document.addEventListener(type,e=>{if(type==='drop' || e.target===document.documentElement)$('#content').classList.remove('drop-highlight');}));
 document.addEventListener('drop',e=>{e.preventDefault();$('#content').classList.remove('drop-highlight');if(e.dataTransfer?.files?.length)importFiles(e.dataTransfer.files);});
}
async function psnAction(path,body,message){
 try{const result=await api(path,{method:'POST',body});
  if(path==='/api/psn/sync'){app.psn.syncing=true;}else{app.psn=result;}
  toast(message);render();
 }catch(err){toast(err.message,true);}
}
async function connectPsn(form){
 const field=form.querySelector('#psn-session');const npsso=(field?.value||'').trim();
 if(field)field.value='';
 const button=form.querySelector('button[type=submit]');if(button)button.disabled=true;
 try{const result=await api('/api/psn/connect',{method:'POST',body:{npsso}});app.psn=result;app.psnError='';toast('Conta Sony conectada. Buscando suas fotos…');render();}
 catch(err){app.psnError=err.message;toast('Falha Sony: '+err.message,true);if(button)button.disabled=false;render();}
}
function keepScroll(fn){
 const regions=[...document.querySelectorAll('#content .lfn-scroll')].map(el=>el.scrollTop);
 fn();
 document.querySelectorAll('#content .lfn-scroll').forEach((el,i)=>{if(regions[i])el.scrollTop=regions[i];});
}
async function refreshStatus(){
 try{
  const [s,psn]=await Promise.all([api('/api/status'),api('/api/psn/status')]);
  if(!$('#btn-sync-all')?.disabled){try{app.site=await api('/api/site/status');paintDeploy();}catch{}}
  const changed=app.previousTotal!==null && (s.total_photos!==app.previousTotal);
  app.status=s;app.psn=psn;app.previousTotal=s.total_photos;
  updateSidebar();
  if(changed){await loadAll(false);toast('Novas fotografias incorporadas ao acervo.');}
  else if(app.view==='studio'){await refreshBackup();if(!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))keepScroll(render);}
  else if(app.view==='sync'){
    // Keep form intact while user types; update status panel only if not focused on path.
    if(!['watch-folder','psn-session','psn-only-gta','psn-auto'].includes(document.activeElement?.id) && !document.querySelector('.psn-steps[open]'))keepScroll(render);
  }
 }catch(e){console.warn('Status indisponível:',e.message);}
}
(async()=>{iconify();bindEvents();renderPauta();await loadAll();app.previousTotal=app.status.total_photos;renderPhotoArea();setInterval(refreshStatus,8000);
 const m=location.hash.match(/^#foto=([0-9a-f-]{36})$/);if(m){history.replaceState(null,'',location.pathname);openPhoto(m[1]);}
 if(!app.profile.onboarded)openWizard(0);})();
