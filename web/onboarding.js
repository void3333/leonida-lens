"use strict";
/* Leonida Lens · Estúdio — primeiros passos, guia e aparência.
   - Guia do fotógrafo (menu 07): passo a passo para iniciantes, em abas (sem rolagem).
   - Assistente de primeiro uso em tela cheia: novo estúdio ou continuar o seu (restaurar backup).
   - Aparência: temas prontos + cor de destaque, para o Estúdio e para a galeria online.
   Usa as funções e o estado de app.js (app, api, toast, render, pageTabs…). */

/* ================================================================ GUIA */
const SONY_LOGIN = 'https://id.sonyentertainmentnetwork.com/id/management_ca/';
const SONY_NPSSO = 'https://ca.account.sony.com/api/v1/ssocookie';
const extLink = (href, label) => `<a class="lfn-btn lfn-btn--sm" href="${href}" target="_blank" rel="noreferrer noopener">${label} ↗</a>`;
const NPSSO_SAMPLE = `<div class="g-code">{"npsso":"<mark>k7Qx…(64 letras e números)…9fZa</mark>"}</div><p class="g-note">Copie só a parte destacada: os 64 caracteres entre as aspas, <b>sem</b> as aspas.</p>`;
const SAFETY = [
  '<b>NUNCA digite sua senha da PSN no Estúdio.</b> O app nunca pede senha. A senha só se digita no site da Sony.',
  'O token é como uma <b>chave temporária da sua conta</b>: não mande para ninguém e não poste em print.',
  'No Windows ele fica protegido pelo próprio sistema (DPAPI) e <b>nunca vai para os backups</b>.',
  'Ele pode expirar com o tempo. Se a conexão cair, é só repetir os passos.',
  'A integração é <b>experimental e não oficial</b>: se a Sony mudar algo, pode parar. Plano B: o pendrive.',
];
const CF_COSTS = [
  'O plano gratuito do Cloudflare Pages <b>não pede cartão de crédito</b>.',
  '<b>Não existe cobrança automática.</b> Se um limite do plano grátis for atingido, a Cloudflare não cobra nada: ela só deixa de aceitar novos envios até o próximo ciclo.',
  'Nada é cobrado sem você escolher, por conta própria, um plano pago.',
  'O app não guarda sua senha da Cloudflare. A autorização fica no Wrangler, a ferramenta oficial da Cloudflare, neste PC.',
];

// tópico → abas → passos. Cada aba: passos curtos, o que aparece na tela e uma dica "deu errado?".
const GUIDE = [
 {k:'fotos', label:'Do PS5 para o app', subs:[
  {k:'tirar', label:'Tirar a foto', steps:[
   ['Enquadre a cena', 'No GTA VI, prepare a cena. Se o jogo tiver modo foto, use-o para escolher o ângulo e esconder a interface.'],
   ['Aperte o botão Criar', 'É o botão pequeno à esquerda do touchpad do DualSense (o de três risquinhos).'],
   ['Escolha “Captura de tela”', 'O menu de criação aparece na parte de baixo da tela. Selecione a captura de tela.'],
   ['Pronto: a foto está no PS5', 'Ela vai para a Galeria de mídia do console. Agora ela precisa chegar ao PC (próximas abas).'],
  ], see:'Um aviso rápido no canto da tela do PS5 dizendo que a captura foi salva.',
  tip:'Não apareceu o aviso? Algumas cenas do jogo bloqueiam capturas. Tente de novo logo depois. Dica: em Configurações → Capturas e transmissões dá para fazer o botão Criar tirar a foto direto.'},
  {k:'envio', label:'Envio automático', steps:[
   ['Abra as configurações do PS5', 'Configurações → Capturas e transmissões → Capturas.'],
   ['Ligue o envio automático', 'Ative a opção de enviar as capturas automaticamente para o PlayStation App (o nome pode variar um pouco, como “Carregar automaticamente”).'],
   ['Instale o PlayStation App no celular', 'Entre com a <b>mesma conta</b> PSN do console. Não precisa fazer mais nada nele.'],
   ['As fotos sobem para a nuvem da Sony', 'Cada captura nova vai para a nuvem e fica lá por cerca de <b>14 dias</b>. É de lá que o Estúdio busca.'],
  ], see:'No PlayStation App, na área de capturas, as fotos novas aparecem alguns minutos depois de tiradas.',
  tip:'As fotos não sobem? Confira se o PS5 está na internet e se a conta do app é a mesma do console. Em modo de repouso, deixe ligado “Permanecer conectado à internet”.'},
  {k:'baixa', label:'O Estúdio baixa sozinho', steps:[
   ['Conecte a conta uma única vez', 'Use o token npsso (veja o tópico “Token npsso”). Leva dois minutos.'],
   ['Deixe o Estúdio aberto', 'Com a opção ligada em Procedência → PlayStation, ele procura fotos novas na nuvem a cada <b>15 minutos</b>.'],
   ['Quer agora? Sincronize', 'Clique em <b>Sincronizar e publicar</b> no topo da tela (ou aperte Ctrl+S).'],
   ['Veja no Acervo', 'As fotos novas entram com um número de tombo, como LFN-2026-0001, e ficam guardadas neste PC.'],
  ], see:'No topo, o botão mostra o andamento (“Buscando na nuvem PlayStation…”) e depois “+3 · Publicado” ou “Tudo em dia”.',
  tip:'Uma foto antiga não veio? A Sony apaga da nuvem depois de cerca de 14 dias. Para fotos antigas, use o pendrive (próxima aba).',
  actions:'<button class="lfn-btn lfn-btn--sm" type="button" data-goto="sync:psn">Ir para Procedência → PlayStation</button>'},
  {k:'pendrive', label:'Sem conta: pendrive', steps:[
   ['Copie as fotos no PS5', 'Galeria de mídia → selecione as fotos → menu (…) → <b>Copiar para unidade USB</b>.'],
   ['Leve o pendrive ao PC', 'Copie as fotos para uma pasta fixa, por exemplo <span class="lfn-mono">Imagens\\Leonida Inbox</span>.'],
   ['Escolha a pasta no Estúdio', 'Procedência → Pasta e importação → <b>Escolher pasta</b>.'],
   ['O Estúdio vigia a pasta', 'Com o app aberto, ele olha a pasta a cada ~14 segundos e importa as fotos novas. Também dá para arrastar arquivos para a janela.'],
  ], see:'Em Procedência, a situação muda para “Pasta monitorada” e o total de fotos aumenta.',
  tip:'O PS5 não reconhece o pendrive? Ele precisa estar formatado em exFAT ou FAT32.',
  actions:'<button class="lfn-btn lfn-btn--sm" type="button" data-goto="sync:pasta">Ir para Procedência → Pasta</button>'},
 ]},
 {k:'token', label:'Token npsso', subs:[
  {k:'pegar', label:'Pegar o token', steps:[
   ['Entre no site da Sony', 'No navegador do PC, entre no site oficial da Sony com sua conta PSN. <b>A senha você digita só lá</b>, no site da Sony.'],
   ['Abra a página de sessão', 'Depois de entrar, abra a página oficial <span class="lfn-mono">ca.account.sony.com/api/v1/ssocookie</span> no mesmo navegador.'],
   ['Ache o valor npsso', 'A página mostra só um texto curto, parecido com o exemplo ao lado.'],
   ['Copie o texto', 'Aperte Ctrl+A e Ctrl+C: pode copiar a linha inteira, com chaves e aspas. O Estúdio separa o valor de <span class="lfn-mono">npsso</span> sozinho.'],
  ], see:NPSSO_SAMPLE,
  tip:'A página mostrou um erro ou veio vazia? Você não está logado nesse navegador. Volte ao passo 1, entre de novo e reabra a página.',
  actions:`${extLink(SONY_LOGIN,'1. Site da Sony')}${extLink(SONY_NPSSO,'2. Página de sessão')}`},
  {k:'colar', label:'Colar no Estúdio', steps:[
   ['Abra a aba PlayStation', 'No menu: Procedência → aba <b>PlayStation</b>.'],
   ['Cole o valor', 'Clique no campo “Valor npsso” e aperte Ctrl+V.'],
   ['Clique em Conectar', 'Em poucos segundos a conta aparece como <b>CONECTADA</b>. O valor colado não é salvo: ele é trocado por uma sessão protegida.'],
   ['Pronto', 'A primeira busca começa sozinha ao conectar. Depois, com o Estúdio aberto, ele confere a cada 15 minutos. Para buscar na hora: <b>Buscar fotos na nuvem</b>.'],
  ], see:'Conta: ● CONECTADA · PROTEGIDA. Situação: PRONTA.',
  tip:'A Sony recusou o token? Ele vence se você sair da conta no site ou depois de um tempo. Entre de novo no site da Sony, reabra a página de sessão e copie o valor novo. Pode colar a linha inteira, com chaves e aspas: o Estúdio separa sozinho.',
  actions:'<button class="lfn-btn lfn-btn--sm" type="button" data-goto="sync:psn">Ir para Procedência → PlayStation</button>'},
  {k:'seguranca', label:'Segurança', warn:SAFETY,
   tip:'Acha que alguém viu seu token? Clique em “Desconectar e apagar sessão” em Procedência → PlayStation e depois saia da conta no site da Sony; o token antigo deixa de valer.'},
 ]},
 {k:'site', label:'Galeria online', subs:[
  {k:'oque', label:'O que é', steps:[
   ['Um site só para ver', 'A galeria online mostra suas fotos publicadas. Visitantes não fazem login, não comentam, não curtem: só olham.'],
   ['Hospedado na Cloudflare', 'O site fica na Cloudflare (uma empresa de hospedagem), numa conta <b>sua</b>.'],
   ['Cada pessoa, sua galeria', 'Cada um usa a própria conta. Por isso cada galeria é separada e tem endereço próprio, como <span class="lfn-mono">lfn-seu-estudio.pages.dev</span>.'],
   ['O Estúdio continua no seu PC', 'Só vai para o site o que você publicar. O resto nunca sai deste computador.'],
  ], see:'Em Meu estúdio → Galeria online: o endereço do site, quantas fotos estão publicadas e a última atualização.',
  tip:'Não quer site? Tudo bem: o Estúdio funciona igual sem ele. Dá para ligar depois.'},
  {k:'conectar', label:'Conectar', steps:[
   ['Antes: crie a conta (grátis)', 'Em <b>dash.cloudflare.com/sign-up</b> crie uma conta com e-mail e senha e <b>confirme o e-mail</b> que a Cloudflare manda. Não precisa de cartão.'],
   ['Clique em Conectar', 'Meu estúdio → Galeria online → <b>Conectar Cloudflare e publicar</b>.'],
   ['O navegador abre sozinho', 'Na 1ª vez o Estúdio prepara a ferramenta da Cloudflare antes: pode levar alguns minutos. Quando a página abrir, entre na sua conta.'],
   ['Clique em Allow (Permitir)', 'A Cloudflare pergunta se o Wrangler (a ferramenta oficial dela) pode publicar por você. Clique em <b>Allow</b>.'],
   ['Volte ao Estúdio', 'Ele fica conectado, cria o site e publica. Aparece <b>NO AR</b> com o endereço.'],
  ], see:'No topo do Estúdio: “SITE NO AR · data e hora”. Clicar nele abre a galeria.',
  tip:'O navegador não abriu, ou você fechou a página sem clicar em Allow? Clique em Conectar de novo. A primeira publicação pode levar alguns minutos, e o endereço novo (….pages.dev) pode levar até ~5 minutos para abrir: se aparecer “não é possível acessar”, espere e recarregue, não precisa publicar de novo.',
  actions:'<button class="lfn-btn lfn-btn--sm" type="button" data-goto="studio:site">Ir para Meu estúdio → Galeria online</button>'},
  {k:'custos', label:'Custos', warn:CF_COSTS,
   tip:'Viu um aviso de limite na Cloudflare? Nada é cobrado: espere o próximo ciclo ou publique menos vezes seguidas.'},
  {k:'outro', label:'Outro PC ou outra pessoa', steps:[
   ['Continuar o seu estúdio', 'No PC novo, use o assistente → <b>Continuar meu estúdio</b> e restaure o backup.'],
   ['Entre na MESMA conta Cloudflare', 'Assim a galeria continua <b>no mesmo endereço</b>, com as mesmas fotos.'],
   ['Outra pessoa?', 'Ela escolhe <b>Novo estúdio</b> e usa a conta Cloudflare <b>dela</b>. A galeria dela fica separada, com outro endereço.'],
  ], tip:'O site do PC antigo não atualiza mais? Só um PC deve publicar o mesmo estúdio por vez: use o novo e deixe o antigo fechado.'},
 ]},
 {k:'publicar', label:'Publicar e sincronizar', subs:[
  {k:'botao', label:'O botão', steps:[
   ['Sincronizar e publicar', 'O botão no topo (ou Ctrl+S) busca fotos novas na nuvem Sony e na pasta, e atualiza o site.'],
   ['O site também se atualiza sozinho', 'Quando algo público muda (foto nova, ficha editada, ensaio publicado), o Estúdio manda a atualização em seguida.'],
   ['Quanto tempo leva', 'De alguns segundos a poucos minutos, conforme quantas fotos novas precisam subir.'],
   ['Como saber que terminou', 'O botão mostra “Publicado” ou “Tudo em dia”, e o topo mostra “SITE NO AR” com a hora.'],
  ], see:'Durante o envio: “ENVIANDO SITE…” no topo. Depois: “SITE NO AR · 24/11 21:30”.',
  tip:'Ficou “SITE COM AVISO”? Passe o mouse sobre o aviso para ler o motivo. Quase sempre é internet ou login da Cloudflare: em Meu estúdio → Galeria online, clique em Reconectar.'},
  {k:'oque', label:'O que aparece', steps:[
   ['Fotos', 'Toda foto nova vem marcada para publicar. Para esconder uma, abra a ficha → aba <b>Arquivo</b> → desmarque <b>Publicar na galeria online</b>.'],
   ['Ensaios', 'Um ensaio só aparece no site depois que você clica em <b>Publicar</b> nele (menu Ensaios).'],
   ['O que nunca vai para o site', 'O Estúdio, fotos não publicadas, sua assinatura de RP, o token da Sony e os backups.'],
  ], tip:'Uma foto não apareceu? Veja se “Publicar na galeria online” está marcado na ficha (aba Arquivo) e clique em Sincronizar e publicar.'},
  {k:'compartilhar', label:'Compartilhar', steps:[
   ['Abra o site', 'Clique em “SITE NO AR” no topo ou em Meu estúdio → Galeria online → <b>Abrir site</b>.'],
   ['Copie o endereço', 'Copie o endereço da barra do navegador e mande para quem quiser.'],
   ['Funciona em qualquer tela', 'A galeria funciona no computador e no celular, sem instalar nada.'],
  ], tip:'Quer ver como o visitante vê, sem publicar? Use a Prévia da galeria (menu 06) e clique em “Como visitante”.'},
 ]},
 {k:'ficha', label:'Ficha e backup', subs:[
  {k:'ficha', label:'Ficha de campo', steps:[
   ['Abra a foto', 'No Acervo, clique numa foto. A ficha abre ao lado da imagem.'],
   ['Marque onde foi', 'Na aba Campo, digite o local e clique no mapa para pôr o pino.'],
   ['Hora e clima', 'Escreva a hora do jogo e escolha o clima. O PS5 não guarda isso: só você sabe.'],
   ['Título e nota', 'Na aba <b>Arquivo</b>, dê um título; a frase da foto (a nota de campo) fica na aba Campo.'],
   ['Atalhos', '<b>↺ Igual à anterior</b> copia local, ponto, hora e clima da última ficha. <b>Ctrl+Enter</b> salva e vai para a próxima foto.'],
  ], tip:'O pino caiu no lugar errado? Clique de novo no mapa ou use “limpar ponto”.'},
  {k:'backup', label:'Backup', steps:[
   ['Escolha uma pasta de backup', 'Meu estúdio → Backup → <b>Escolher pasta</b>. Use uma pasta do OneDrive ou Google Drive: assim a cópia também vai para a nuvem.'],
   ['Cópias automáticas', 'O app copia fotos e banco para lá a cada 30 minutos (e guarda cópias do banco a cada 6 horas).'],
   ['Um arquivo único', '<b>Baixar backup</b> gera um .zip com tudo, para guardar onde quiser.'],
  ], see:'Em Meu estúdio → Backup: “Copiando para … a cada 30 min. Último: data e hora.”',
  tip:'Apareceu “pasta não acessível”? O HD ou pendrive foi desconectado. Ligue de novo ou escolha outra pasta.',
  actions:'<button class="lfn-btn lfn-btn--sm" type="button" data-goto="studio:backup">Ir para Meu estúdio → Backup</button>'},
  {k:'pc', label:'Levar para outro PC', steps:[
   ['Instale o Estúdio no PC novo', 'Abra o app: o assistente de primeiros passos aparece.'],
   ['Escolha “Continuar meu estúdio”', 'Aponte a pasta do backup automático (ex.: OneDrive) ou o arquivo .zip.'],
   ['Confira o resumo', 'Fotos, fichas, ensaios, tema e endereço da galeria voltam.'],
   ['Conecte de novo', 'Cole o token da Sony de novo (ele nunca vai no backup) e entre na mesma conta da Cloudflare.'],
  ], tip:'O OneDrive ainda está baixando? Espere a sincronização terminar antes de restaurar, senão faltam fotos.'},
 ]},
];

function guideSub(s){
 const steps=s.steps?`<ol class="g-steps">${s.steps.map(([t,p],i)=>`<li><span class="g-n">${pad2(i+1)}</span><div><h4>${t}</h4><p>${p}</p></div></li>`).join('')}</ol>`:'';
 const warn=s.warn?`<ul class="g-warn">${s.warn.map(w=>`<li>${w}</li>`).join('')}</ul>`:'';
 const side=[s.see?`<div class="g-box"><span class="lfn-label">NA TELA VOCÊ VAI VER</span><div class="g-see">${s.see}</div></div>`:'',
  s.tip?`<div class="g-box is-tip"><span class="lfn-label">DEU ERRADO?</span><p>${s.tip}</p></div>`:'',
  s.actions?`<div class="row-actions g-actions">${s.actions}</div>`:''].join('');
 return `<div class="g-sub${s.steps?'':' is-list'}"><div class="g-main">${steps}${warn}</div><aside class="g-side">${side}</aside></div>`;
}
const RELEASES='https://github.com/void3333/leonida-lens/releases/latest';
fetch('/api/health').then(r=>r.json()).then(h=>{window.LFN_VERSION=h.version||'';}).catch(()=>{});
function renderGuide(){
 const head=pageHead('Guia do fotógrafo',{label:'PARA QUEM ESTÁ COMEÇANDO',dek:'Do PS5 até a galeria online, em passos curtos. Cada aba tem um “deu errado?”.',dekSerif:false,
  actions:`<a class="lfn-btn" href="${RELEASES}" target="_blank" rel="noreferrer noopener" title="Baixe o instalador mais novo e instale por cima: nada se perde">Leonida Lens ${escapeHtml(window.LFN_VERSION||'')} · versões novas ↗</a><button class="lfn-btn" data-action="open-wizard" type="button">Primeiros passos</button>`});
 const topics=GUIDE.map((t,i)=>[t.k,`${pad2(i+1)} · ${t.label}`,`<div class="g-topic">${pageTabs('g-'+t.k,t.subs.map((s,j)=>[s.k,`${j+1}. ${s.label}`,guideSub(s)]))}</div>`]);
 return `<div class="view view-noTool view-tabs guide-view">${head}${pageTabs('guide',topics)}</div>`;
}
function openGuide(topic,sub){
 if(topic)app.pageTab.guide=topic;
 if(topic&&sub)app.pageTab['g-'+topic]=sub;
 setView('guide');
}
function showPageTab(wrap,k){
 if(!wrap)return;
 wrap.dataset.tab=k;
 [...wrap.children].forEach(el=>{
  if(el.classList.contains('ptabs'))[...el.children].forEach(b=>{const on=b.dataset.k===k;b.classList.toggle('is-on',on);b.setAttribute('aria-selected',String(on));});
  if(el.classList.contains('ptab-pane'))el.classList.toggle('is-on',el.dataset.k===k);
 });
}

/* ================================================================ APARÊNCIA */
const T=()=>window.LFNThemes;
function themeOf(target){return (app.theme&&app.theme[target])||{preset:'codigo',accent:''};}
function applyStudioTheme(){
 const t=themeOf('studio');if(!T())return;
 T().apply(t.preset,t.accent);T().remember('studio',t.preset,t.accent);
}
function lookMock(target,preset,accent){
 const k=T().tokens(preset,accent);
 const v=`--m-bg:${k.bg};--m-sf:${k.surface};--m-rule:${k.rule};--m-ink:${k.ink};--m-ink3:${k.ink3};--m-ac:${k.accent};--m-ac2:${k.accent2};--m-aci:${k.accentInk}`;
 if(target==='gallery')return `<span class="lk-mock lk-gal" style="${v}"><i class="lk-photo"></i><i class="lk-pill"><i></i><i></i><i></i></i><i class="lk-cap"><i></i><i></i></i><i class="lk-card"><i></i><i></i></i></span>`;
 return `<span class="lk-mock" style="${v}"><i class="lk-side"><i class="lk-on"></i><i></i><i></i><i></i></i><i class="lk-main"><i class="lk-title"></i><i class="lk-thumbs"><i></i><i></i><i></i></i><i class="lk-btn"></i></i></span>`;
}
function lookCards(target){
 const cur=themeOf(target);
 return T().order.map(id=>{const p=T().presets[id],on=id===cur.preset;
  return `<button type="button" class="lk-card${on?' is-on':''}" data-look="${target}:${id}" aria-pressed="${on}" title="${escAttr(p.desc)}">${lookMock(target,id,on?cur.accent:'')}<span class="lk-name">${escapeHtml(p.name)}${id==='codigo'?' <em>padrão</em>':''}</span></button>`;}).join('');
}
function renderLook(target,{compact=false}={}){
 const cur=themeOf(target),tk=T().tokens(cur.preset,cur.accent);
 const title=target==='studio'?'Estúdio':'Galeria online';
 const sub=target==='studio'?'Como o app aparece neste PC. Muda na hora.':'Como os visitantes veem o seu site. Vai junto na próxima publicação.';
 return `<div class="look${compact?' is-compact':''}" data-look-target="${target}">
  <div class="lfn-rule"><span>${title}</span><span class="lfn-rule-count">${escapeHtml(T().presets[cur.preset].name)}${cur.accent?' · COR PRÓPRIA':''}</span></div>
  <p class="look-sub">${sub}</p>
  <div class="lk-grid" data-look-grid="${target}">${lookCards(target)}</div>
  <div class="look-accent"><label class="lk-swatch"><input type="color" data-look-accent="${target}" value="${tk.accent}" aria-label="Cor de destaque: ${title}"/><span style="background:${tk.accent}"></span></label>
   <div class="look-accent-text"><b>Cor de destaque</b><small>${cur.accent?'Escolhida por você. O texto sobre ela fica sempre legível.':'A do tema. Clique no quadrado para escolher outra.'}</small></div>
   ${cur.accent?`<button type="button" class="lfn-linkbtn" data-look-reset="${target}">usar a do tema</button>`:''}
   ${target==='gallery'&&!compact?`<button type="button" class="lfn-btn lfn-btn--sm" data-look-preview>Ver na prévia</button>`:''}</div>
 </div>`;
}
function renderLookPane(){
 return `<div class="two-col tab-cols look-cols"><div class="col">${renderLook('studio')}</div><div class="col">${renderLook('gallery')}</div></div>`;
}
async function saveTheme(target,part){
 app.theme=app.theme||{studio:{preset:'codigo',accent:''},gallery:{preset:'codigo',accent:''}};
 app.theme[target]={...themeOf(target),...part};
 if(target==='studio')applyStudioTheme();
 refreshLook(target);
 try{const r=await api('/api/theme',{method:'POST',body:{[target]:app.theme[target]}});app.theme=r;}
 catch(err){toast('Não foi possível salvar o tema: '+err.message,true);}
}
function refreshLook(target){
 document.querySelectorAll(`[data-look-target="${target}"]`).forEach(el=>{
  const compact=el.classList.contains('is-compact');
  const tmp=document.createElement('div');tmp.innerHTML=renderLook(target,{compact});el.replaceWith(tmp.firstElementChild);
 });
}
document.addEventListener('input',e=>{
 const inp=e.target.closest?.('[data-look-accent]');if(!inp)return;
 const target=inp.dataset.lookAccent;
 app.theme=app.theme||{};app.theme[target]={...themeOf(target),accent:inp.value};
 if(target==='studio')T().apply(app.theme.studio.preset,inp.value);
 const sw=inp.nextElementSibling;if(sw)sw.style.background=inp.value;
 const grid=document.querySelector(`[data-look-grid="${target}"]`);if(grid)grid.innerHTML=lookCards(target);
});
document.addEventListener('change',e=>{
 const inp=e.target.closest?.('[data-look-accent]');if(!inp)return;
 saveTheme(inp.dataset.lookAccent,{accent:inp.value});
});

/* ================================================================ ASSISTENTE (tela cheia) */
const wz={open:false,step:'welcome',mode:'',visited:new Set(),restore:{state:'idle'},found:null,photoMode:'',sitePoll:null,restoredSite:''};
const WZ_TITLES={welcome:'Boas-vindas',mode:'Novo ou continuar',restore:'Restaurar backup',identity:'Identidade',look:'Aparência',photos:'Fotos',site:'Galeria online',backup:'Backup',done:'Pronto'};
function wzSteps(){return ['welcome','mode',...(wz.mode==='continue'?['restore']:[]),'identity','look','photos','site','backup','done'];}
function wizardOpen(){return wz.open;}
function openWizard(){
 wz.open=true;wz.step='welcome';wz.mode='';wz.visited=new Set(['welcome']);wz.restore={state:'idle'};wz.found=null;wz.restoredSite='';
 wz.photoMode=app.psn?.connected?'psn':app.status?.watch_folder?'folder':'';
 let el=$('#wizard');
 if(!el){el=document.createElement('div');el.id='wizard';el.className='wz';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Primeiros passos');document.body.appendChild(el);}
 el.hidden=false;document.body.classList.add('has-wizard');
 renderWizard();
}
function closeWizard(){
 wz.open=false;clearInterval(wz.sitePoll);wz.sitePoll=null;
 const el=$('#wizard');if(el){el.hidden=true;el.innerHTML='';}
 document.body.classList.remove('has-wizard');
}
function wzGo(step){wz.step=step;wz.visited.add(step);if(step==='site')startSitePoll();else{clearInterval(wz.sitePoll);wz.sitePoll=null;}renderWizard();if(step==='restore'&&!wz.found)findBackupFolders();}
function wzMove(delta){const s=wzSteps(),i=s.indexOf(wz.step);const n=s[Math.min(s.length-1,Math.max(0,i+delta))];wzGo(n);}

const wzList=items=>`<ol class="wz-points">${items.map((t,i)=>`<li><span class="g-n">${pad2(i+1)}</span><p>${t}</p></li>`).join('')}</ol>`;
const wzChoice=(attr,on,title,desc,note='')=>`<button type="button" class="wz-choice${on?' is-on':''}" ${attr} aria-pressed="${on}"><i class="wiz-radio"></i><span><strong>${title}</strong><span>${desc}</span></span>${note?`<em class="lfn-label">${note}</em>`:''}</button>`;
const okLine=(on,text)=>`<div class="wz-state${on?' is-ok':''}"><i></i>${text}</div>`;

function wzWelcome(){
 return {title:'Bem-vindo ao seu estúdio de fotografia em Leonida.',lead:'Este app é o arquivo pessoal de um fotógrafo no GTA VI. Ele roda <b>só neste computador</b>: nenhuma conta nossa, nenhum servidor nosso.',
  body:`<div class="wz-cols"><div>${wzList([
   '<b>Guarda suas fotos do PS5</b> num acervo organizado aqui no PC, cada uma com um número de tombo.',
   '<b>Você preenche a ficha de campo</b>: onde foi, que horas eram no jogo, o clima e uma frase.',
   '<b>Publica uma galeria online</b> (opcional) para outras pessoas verem suas fotos, no computador e no celular.'])}</div>
   <div class="wz-aside"><span class="lfn-label">COMO ESTE ASSISTENTE FUNCIONA</span><p>São ${wzSteps().length} etapas curtas, uns 5 minutos. Você pode <b>pular</b> qualquer uma e voltar depois em <b>Meu estúdio → Primeiros passos</b>.</p><p>Ficou com dúvida em algum momento? O <b>Guia</b> (menu 07) explica tudo com calma, com uma dica de “deu errado?” em cada parte.</p><p>O app abre em tela cheia: <b>F11</b> sai da tela cheia e <b>Alt+F4</b> fecha o app.</p></div></div>`,
  next:'Começar →'};
}
function wzMode(){
 const has=app.photos.length;
 return {title:'É a primeira vez ou você já tem um estúdio?',lead:'Escolha uma opção. Dá para mudar de ideia voltando aqui.',
  body:`<div class="wz-choices is-big">
   ${wzChoice('data-wz-mode="new"',wz.mode==='new','Novo estúdio','É a primeira vez. Vou criar meu estúdio do zero: meu nome, meu tema e, se quiser, minha própria galeria online.','PRIMEIRA VEZ')}
   ${wzChoice('data-wz-mode="continue"',wz.mode==='continue','Continuar meu estúdio','Já uso o Leonida Lens em outro PC. Quero trazer tudo: fotos, fichas, ensaios, tema e o mesmo endereço da galeria.','TROCA DE PC')}
  </div>
  <div class="wz-aside is-row"><p><b>Outra pessoa vai usar este PC?</b> Ela deve escolher <b>Novo estúdio</b>: terá o próprio nome, o próprio tema e uma galeria separada, na conta Cloudflare dela.</p>${has?`<p class="wz-warn">Este PC já tem ${itens(has).toLowerCase()} no acervo. “Continuar” substitui esse acervo pelo do backup (antes, uma cópia de segurança é guardada).</p>`:''}</div>`,
  next:'Continuar →',disabled:!wz.mode};
}
function wzRestore(){
 const r=wz.restore;
 if(r.state==='running'){
  const pct=r.total?Math.round(100*r.done/r.total):r.upload!=null?Math.round(r.upload*100):0;
  return {title:'Restaurando o seu estúdio…',lead:'<b>Não feche o app.</b> Com muitas fotos isso pode levar alguns minutos.',
   body:`<div class="wz-progress"><div class="wz-phase">${escapeHtml(r.phase||'Preparando…')}</div><div class="wz-bar big"><i style="width:${pct}%"></i></div>
    <div class="lfn-label">${r.total?`${r.done} DE ${r.total} FOTOS`:r.upload!=null?`ENVIANDO O ARQUIVO · ${pct}%`:'AGUARDE'}</div></div>`,next:'Continuar →',disabled:true,noBack:true};
 }
 if(r.state==='done'){
  const x=r.result||{};
  return {title:'Estúdio restaurado.',lead:'Tudo voltou para este PC. Confira o resumo e siga para as próximas etapas.',
   body:`<div class="wz-summary"><div class="wz-big-ok">✓</div><dl class="lfn-meta">${metaRow('Estúdio',escapeHtml(x.studio_name||app.profile.studio_name||'—'))}${metaRow('Fotos',`${Number(x.photos||0)} · ${Number(x.files_restored||0)} ARQUIVO(S) COPIADO(S)`)}${metaRow('Backup feito em',escapeHtml(whenArq(x.created_at)))}${metaRow('Tema',escapeHtml(T().presets[themeOf('studio').preset].name))}${metaRow('Galeria online',app.site?.url?`<span class="lfn-mono">${escapeHtml(app.site.url.replace('https://',''))}</span>`:'NÃO HAVIA SITE')}</dl>
    <p class="hint">O estado anterior deste PC foi guardado em <span class="lfn-mono">${escapeHtml(x.safety_snapshot||'backups')}</span>. O token da Sony não vem no backup: você cola de novo na etapa Fotos.</p></div>`,next:'Continuar →'};
 }
 const found=wz.found;
 const pick=r.pick;
 const folders=found===null?'<p class="hint">Procurando backups no OneDrive, Google Drive e pendrives…</p>'
  :found.length?found.map(f=>wzChoice(`data-wz-folder="${escAttr(f.folder)}"`,pick?.kind==='folder'&&pick.folder===f.folder,escapeHtml(f.studio_name||'Estúdio sem nome'),`${Number(f.photos||0)} fotos · backup de ${escapeHtml(whenArq(f.created_at))}<br><span class="lfn-mono wz-path">${escapeHtml(f.folder)}</span>`)).join('')
  :'<p class="hint">Não achei um backup automático nos lugares comuns. Use “Procurar a pasta…”.</p>';
 const chosenFolder=pick?.kind==='folder'&&!(found||[]).some(f=>f.folder===pick.folder)?wzChoice(`data-wz-folder="${escAttr(pick.folder)}"`,true,escapeHtml(pick.studio_name||'Estúdio sem nome'),`${Number(pick.photos||0)} fotos · backup de ${escapeHtml(whenArq(pick.created_at))}<br><span class="lfn-mono wz-path">${escapeHtml(pick.folder)}</span>`):'';
 const zipCard=pick?.kind==='zip'?wzChoice('data-wz-zip',true,escapeHtml(pick.file.name),`${bytesBR(pick.file.size)} · arquivo .zip escolhido`):'';
 return {title:'De onde vem o seu backup?',lead:'Escolha <b>uma</b> das duas opções. Antes de restaurar, o estado atual deste PC é guardado numa cópia de segurança.',
  body:`<div class="wz-cols is-even"><div class="wz-panel"><span class="lfn-label">A · PASTA DO BACKUP AUTOMÁTICO</span><p>Se no outro PC você escolheu uma pasta de backup (OneDrive, Google Drive, HD externo), aponte para ela aqui.</p>
    <div class="wz-choices">${folders}${chosenFolder}</div>
    <div class="row-actions"><button class="lfn-btn lfn-btn--sm" type="button" data-wz-act="pick-restore-folder">Procurar a pasta…</button></div></div>
   <div class="wz-panel"><span class="lfn-label">B · ARQUIVO .ZIP</span><p>Se você baixou um <b>Backup completo (.zip)</b> em Meu estúdio → Backup, escolha o arquivo.</p>
    <div class="wz-choices">${zipCard}</div>
    <div class="row-actions"><button class="lfn-btn lfn-btn--sm" type="button" data-action="restore-backup">Escolher arquivo .zip…</button></div></div></div>
   ${r.state==='error'?`<div class="inline-alert is-danger">Não deu certo: ${escapeHtml(r.error||'')}</div>`:''}
   <div class="wz-aside is-row"><p><b>O que volta:</b> fotos, fichas, ensaios, nome do estúdio, tema e o endereço da galeria. <b>O que não volta:</b> o token da Sony (é protegido por PC) e o login da Cloudflare. Você refaz os dois nas próximas etapas.</p>
   <p class="wz-tip"><b>Deu errado?</b> Se o OneDrive ainda está baixando os arquivos, espere terminar. Sem backup? Volte e escolha “Novo estúdio”.</p></div>`,
  next:pick?'Restaurar agora':'Continuar →',nextAct:pick?'do-restore':'',disabled:!pick};
}
function wzIdentity(){
 const p=app.profile||{};
 return {title:'Como se chama o seu estúdio?',lead:wz.restore.state==='done'?'Isso veio do backup. Confira e ajuste se quiser.':'Pode ser o nome de uma agência, de um jornal ou só o seu nome de fotógrafo.',
  body:`<form id="wz-identity" class="wz-cols" autocomplete="off"><div class="form-fields">
   <div class="form-field lfn-field"><label for="wz-name">Nome do estúdio / agência</label><input id="wz-name" class="lfn-input" name="studio_name" required minlength="2" maxlength="60" value="${escAttr(p.studio_name||'')}" placeholder="Ex.: Vice Lens Photography"/></div>
   <div class="form-field lfn-field"><label for="wz-sig">Assinatura no RP · opcional</label><input id="wz-sig" class="lfn-input" name="photographer" maxlength="60" value="${escAttr(p.photographer||'')}" placeholder="Ex.: Lucia Caminos"/></div></div>
   <div class="wz-aside">${wzList(['O <b>nome</b> aparece no topo do Estúdio e da galeria online.','A <b>assinatura</b> é o nome do seu fotógrafo no roleplay. Ela fica só no Estúdio: <b>não vai para o site</b>.','Dá para trocar os dois quando quiser, em Meu estúdio.'])}</div></form>`,
  next:'Salvar e continuar →',nextAct:'save-identity'};
}
function wzLook(){
 return {title:'Escolha a aparência.',lead:'O Estúdio muda na hora, aqui mesmo. A galeria online pode ter outro tema. Depois dá para trocar em <b>Meu estúdio → Aparência</b>.',
  body:`<div class="wz-cols is-even">${renderLook('studio',{compact:true})}${renderLook('gallery',{compact:true})}</div>`,next:'Continuar →'};
}
function wzPhotos(){
 const m=wz.photoMode,p=app.psn||{},folder=app.status?.watch_folder;
 const tabs=`<div class="wz-seg" role="tablist">${[['psn','Nuvem PlayStation'],['folder','Pasta ou pendrive'],['later','Decido depois']].map(([k,l])=>`<button type="button" role="tab" data-wz-photo="${k}" aria-selected="${m===k}" class="${m===k?'is-on':''}">${l}</button>`).join('')}</div>`;
 let body='';
 if(!m)body=`<div class="wz-cols is-even"><div class="wz-panel"><span class="lfn-label">NUVEM PLAYSTATION · AUTOMÁTICO</span><p>O PS5 manda as fotos para a nuvem da Sony e o Estúdio busca de lá sozinho. Precisa de um token (uma chave temporária) que você copia do site da Sony. Experimental.</p></div>
  <div class="wz-panel"><span class="lfn-label">PASTA OU PENDRIVE · SEM CONTA</span><p>Você copia as fotos do PS5 para um pendrive, passa para uma pasta do PC e o Estúdio importa sozinho. Funciona sempre, sem conta nenhuma.</p></div></div>`;
 if(m==='psn')body=p.connected
  ?`<div class="wz-cols"><div>${okLine(true,`CONTA SONY CONECTADA · ${escapeHtml(p.storage||'PROTEGIDA')}`)}${wzList(['Com o Estúdio aberto, ele busca fotos novas a cada 15 minutos (opção em Procedência → PlayStation).','Para buscar na hora, use <b>Sincronizar e publicar</b> no topo (Ctrl+S).','Lembre: a Sony guarda as capturas por cerca de 14 dias.'])}</div><div class="wz-aside"><span class="lfn-label">SEGURANÇA</span><ul class="g-warn">${SAFETY.slice(1,3).map(w=>`<li>${w}</li>`).join('')}</ul></div></div>`
  :`<div class="wz-cols"><div>${wzList([
    'No PS5: Configurações → Capturas e transmissões → Capturas → ligue o <b>envio automático</b> para o PlayStation App (com o app no celular, na mesma conta).',
    `No navegador do PC, <b>entre no site da Sony</b> com sua conta PSN. A senha você digita só lá.`,
    `Abra a <b>página de sessão</b>. Ela mostra <span class="lfn-mono">{"npsso":"…"}</span>. Copie esse texto (pode ser a linha inteira) com Ctrl+A e Ctrl+C.`,
    'Cole no campo ao lado e clique em <b>Conectar</b>.'])}
    <div class="row-actions">${extLink(SONY_LOGIN,'Site da Sony')}${extLink(SONY_NPSSO,'Página de sessão')}</div></div>
   <div class="wz-aside"><form id="wz-psn-form" class="psn-form" autocomplete="off"><div class="form-field lfn-field"><label for="wz-npsso">Valor npsso · token confidencial</label>
    <div class="inline-input"><input id="wz-npsso" class="lfn-input lfn-input--mono" type="password" name="npsso" required autocomplete="off" spellcheck="false" placeholder="Cole aqui o texto da página de sessão"/><button class="lfn-btn lfn-btn--primary" type="submit">Conectar</button></div></div></form>
    ${wz.psnError?`<div class="inline-alert is-danger">${escapeHtml(wz.psnError)}</div>`:''}
    <ul class="g-warn">${SAFETY.map(w=>`<li>${w}</li>`).join('')}</ul></div></div>`;
 if(m==='folder')body=`<div class="wz-cols"><div>${wzList([
   'No PS5: Galeria de mídia → selecione as fotos → menu (…) → <b>Copiar para unidade USB</b>. O pendrive precisa estar em exFAT ou FAT32.',
   'No PC, copie as fotos para uma pasta fixa, por exemplo <span class="lfn-mono">Imagens\\Leonida Inbox</span>.',
   'Clique em <b>Escolher pasta</b> e aponte essa pasta. Com o app aberto, ele importa as fotos novas a cada ~14 segundos.',
   'Também dá para <b>arrastar fotos</b> para a janela do Estúdio a qualquer momento.'])}</div>
   <div class="wz-aside">${okLine(!!folder,folder?'PASTA MONITORADA':'NENHUMA PASTA AINDA')}${folder?`<p class="lfn-mono wz-path">${escapeHtml(folder)}</p>`:''}<div class="row-actions"><button class="lfn-btn ${folder?'':'lfn-btn--primary'} lfn-btn--sm" type="button" data-wz-act="pick-watch-folder">${folder?'Trocar pasta':'Escolher pasta'}</button></div></div></div>`;
 if(m==='later')body=`<div class="wz-aside is-row"><p>Sem problema. Quando quiser, vá em <b>Procedência</b> (menu 04) ou siga o <b>Guia → Do PS5 para o app</b>. Enquanto isso, dá para arrastar fotos JPG/PNG para a janela.</p></div>`;
 return {title:'Como as fotos chegam aqui?',lead:'No PS5, as fotos saem com o botão <b>Criar</b> do controle. Escolha como elas vêm para o PC (dá para usar os dois jeitos).',body:tabs+body,next:'Continuar →'};
}
function wzSite(){
 const s=app.site||{},url=s.url||wz.restoredSite;
 const cont=wz.mode==='continue'&&url;
 const state=s.logged_in?okLine(true,'CLOUDFLARE CONECTADA'+(s.url?` · ${escapeHtml(s.url.replace('https://',''))}`:'')):s.login_open?okLine(false,'AGUARDANDO VOCÊ NO NAVEGADOR… (CLIQUE EM ALLOW)'):okLine(false,'AINDA NÃO CONECTADA');
 return {title:'Galeria online',lead:cont?`Sua galeria vai continuar <b>no mesmo endereço</b>: <span class="lfn-mono">${escapeHtml(url.replace('https://',''))}</span>. Para isso, entre na <b>mesma conta</b> da Cloudflare que você usava.`
   :'Um site só para ver suas fotos (sem login, sem comentários). Ele fica numa conta Cloudflare <b>sua</b>: é o <b>seu</b> site, separado de qualquer outro, com endereço próprio.',
  body:`<div class="wz-cols"><div>${wzList([
    'Clique em <b>Conectar Cloudflare</b>. O navegador abre a página da Cloudflare.',
    cont?'Entre na <b>mesma conta</b> de antes (e-mail e senha da Cloudflare).':'Crie uma conta grátis (e-mail e senha) ou entre, se já tiver.',
    'A Cloudflare pergunta se o <b>Wrangler</b> (a ferramenta oficial dela) pode publicar por você: clique em <b>Allow</b> (Permitir).',
    'Volte para cá. O Estúdio fica conectado e publica sozinho sempre que algo público mudar.'])}
    <div class="row-actions">${state}<button class="lfn-btn lfn-btn--primary lfn-btn--sm" type="button" data-wz-act="site-login" ${s.login_open||s.logged_in?'disabled':''}>${s.logged_in?'Conectado':'Conectar Cloudflare'}</button></div></div>
   <div class="wz-aside"><span class="lfn-label">QUANTO CUSTA</span><ul class="g-warn is-calm">${CF_COSTS.map(w=>`<li>${w}</li>`).join('')}</ul></div></div>`,
  next:'Continuar →',skip:!s.logged_in};
}
function wzBackup(){
 const b=app.backup||{};
 return {title:'Proteja suas fotos.',lead:'O app já guarda cópias do banco neste PC. Mas se o PC quebrar, só um backup <b>fora dele</b> salva tudo.',
  body:`<div class="wz-cols"><div>${wzList([
   'Escolha uma pasta do <b>OneDrive</b> ou do <b>Google Drive</b> (ou um HD externo). Assim a cópia também vai para a nuvem.',
   'O app copia as fotos e o banco para lá <b>a cada 30 minutos</b>, sozinho.',
   'Trocou de PC? No assistente, escolha <b>Continuar meu estúdio</b> e aponte essa mesma pasta.',
   'O token da Sony <b>nunca</b> entra no backup.'])}</div>
   <div class="wz-aside">${okLine(!!b.backup_folder,b.backup_folder?'PASTA DE BACKUP DEFINIDA':'NENHUMA PASTA AINDA')}${b.backup_folder?`<p class="lfn-mono wz-path">${escapeHtml(b.backup_folder)}</p>`:''}
    <div class="row-actions"><button class="lfn-btn ${b.backup_folder?'':'lfn-btn--primary'} lfn-btn--sm" type="button" data-action="pick-backup-folder">${b.backup_folder?'Trocar pasta':'Escolher pasta de backup'}</button></div>
    <p class="wz-tip"><b>Deu errado?</b> “Pasta não acessível” quer dizer que o HD ou pendrive foi desconectado. Ligue de novo ou escolha outra.</p></div></div>`,
  next:'Continuar →',skip:!b.backup_folder};
}
function wzDone(){
 const p=app.profile||{},s=app.site||{},b=app.backup||{},psn=app.psn||{};
 const row=(ok,k,v)=>`<li class="${ok?'is-ok':''}"><i></i><b>${k}</b><span>${v}</span></li>`;
 return {title:`Pronto, ${escapeHtml(p.studio_name||'seu estúdio')} está montado.`,lead:'Resumo do que ficou configurado. O que ficou para depois está em Meu estúdio e no Guia.',
  body:`<div class="wz-cols"><ul class="wz-check">
   ${row(!!p.studio_name,'Estúdio',escapeHtml(p.studio_name||'sem nome'))}
   ${row(true,'Aparência',`Estúdio: ${escapeHtml(T().presets[themeOf('studio').preset].name)} · Galeria: ${escapeHtml(T().presets[themeOf('gallery').preset].name)}`)}
   ${row(psn.connected||!!app.status?.watch_folder,'Fotos',[psn.connected?'nuvem PlayStation conectada':'',app.status?.watch_folder?'pasta monitorada':''].filter(Boolean).join(' · ')||'para depois (Procedência)')}
   ${row(!!s.logged_in,'Galeria online',s.logged_in?(s.url?escapeHtml(s.url.replace('https://','')):'conectada, publicando…'):'para depois (Meu estúdio → Galeria online)')}
   ${row(!!b.backup_folder,'Backup',b.backup_folder?escapeHtml(b.backup_folder):'para depois (Meu estúdio → Backup)')}
  </ul><div class="wz-aside"><span class="lfn-label">PRÓXIMOS PASSOS</span>${wzList(['Tire fotos no PS5 com o botão <b>Criar</b>.','Clique em <b>Sincronizar e publicar</b> (Ctrl+S) para trazer as novas.','Abra uma foto e preencha a <b>ficha de campo</b>.','Dúvidas? Menu <b>07 · Guia</b>.'])}</div></div>`,
  next:'Abrir o acervo →',nextAct:'finish',noSkip:true};
}
const WZ_RENDER={welcome:wzWelcome,mode:wzMode,restore:wzRestore,identity:wzIdentity,look:wzLook,photos:wzPhotos,site:wzSite,backup:wzBackup,done:wzDone};

function renderWizard(){
 const el=$('#wizard');if(!el||!wz.open)return;
 const steps=wzSteps(),i=steps.indexOf(wz.step),v=WZ_RENDER[wz.step]();
 const rail=steps.map((k,j)=>{const cls=k===wz.step?'is-on':wz.visited.has(k)?'is-done':'';
  return `<li class="${cls}"><button type="button" data-wz-step="${k}" ${wz.visited.has(k)&&wz.restore.state!=='running'?'':'disabled'}><span>${pad2(j+1)}</span>${WZ_TITLES[k]}</button></li>`;}).join('');
 const canClose=app.profile?.onboarded;
 el.innerHTML=`<aside class="wz-rail"><div class="wz-brand"><b class="brand-title">Leonida Lens</b><small>PRIMEIROS PASSOS</small></div>
  <ol class="wz-list">${rail}</ol>
  <div class="wz-railfoot lfn-label">LOCAL · NADA SAI DESTE PC</div></aside>
 <section class="wz-main">
  <header class="wz-head"><span class="lfn-label">ETAPA ${pad2(i+1)} DE ${pad2(steps.length)} · ${WZ_TITLES[wz.step].toUpperCase()}</span><div class="wz-bar"><i style="width:${Math.round(100*(i+1)/steps.length)}%"></i></div>${canClose?'<button class="lfn-linkbtn wz-close" type="button" data-wz-act="close">fechar o assistente ×</button>':''}</header>
  <div class="wz-body" data-step="${wz.step}"><h1 class="wz-title">${v.title}</h1>${v.lead?`<p class="wz-lead">${v.lead}</p>`:''}<div class="wz-content">${v.body}</div></div>
  <footer class="wz-nav">${i>0&&!v.noBack?'<button class="lfn-btn lfn-btn--ghost" type="button" data-wz-act="back">← Voltar</button>':'<span></span>'}
   <span class="wz-spacer"></span>${v.skip?'<button class="lfn-btn" type="button" data-wz-act="skip">Pular por enquanto</button>':''}
   <button class="lfn-btn lfn-btn--primary" type="button" data-wz-act="${v.nextAct||'next'}" ${v.disabled?'disabled':''}>${v.next}</button></footer>
 </section>`;
 iconify(el);
}

/* ---------------------------------------------------------------- restaurar (assistente e Meu estúdio) */
function uploadRestore(file,onProgress){
 return new Promise((resolve,reject)=>{
  const x=new XMLHttpRequest();x.open('POST','/api/backup/restore');x.setRequestHeader('Content-Type','application/zip');
  x.upload.onprogress=e=>{if(e.lengthComputable&&onProgress)onProgress(e.loaded/e.total);};
  x.onload=()=>{let d={};try{d=JSON.parse(x.responseText);}catch{d={error:'Resposta inválida do servidor.'};}if(x.status>=400||d.error)reject(new Error(d.error||`Erro ${x.status}`));else resolve(d);};
  x.onerror=()=>reject(new Error('Envio interrompido.'));
  x.send(file);
 });
}
async function afterRestore(){
 await loadAll(false);await refreshBackup();
 try{app.profile=await api('/api/profile');}catch{}
 applyProfile();
}
function pollRestore(){
 const t=setInterval(async()=>{
  if(wz.restore.state!=='running'){clearInterval(t);return;}
  try{const st=await api('/api/backup/restore-status');if(st.running){Object.assign(wz.restore,{phase:st.phase,done:st.done,total:st.total});if(st.total)wz.restore.upload=null;renderWizard();}}catch{}
 },500);
}
async function runRestore(job){
 wz.restore={...wz.restore,state:'running',phase:'Conferindo o backup…',done:0,total:0,upload:null};renderWizard();pollRestore();
 try{const result=await job();
  await afterRestore();wz.restoredSite=app.site?.url||'';
  wz.restore={state:'done',result};
 }catch(err){wz.restore={...wz.restore,state:'error',error:err.message};}
 renderWizard();
}
function wizardRestoreZip(file){
 wz.restore={state:'idle',pick:{kind:'zip',file}};renderWizard();
}
async function findBackupFolders(){
 try{const r=await api('/api/backup/find-folders');wz.found=r.folders||[];}catch{wz.found=[];}
 if(wz.open&&wz.step==='restore')renderWizard();
}
function startSitePoll(){
 clearInterval(wz.sitePoll);
 wz.sitePoll=setInterval(async()=>{
  if(!wz.open||wz.step!=='site'){clearInterval(wz.sitePoll);return;}
  const before=JSON.stringify([app.site?.logged_in,app.site?.login_open,app.site?.url]);
  try{app.site=await api('/api/site/status');}catch{return;}
  if(JSON.stringify([app.site?.logged_in,app.site?.login_open,app.site?.url])!==before)renderWizard();
 },3000);
}

async function wzAction(act){
 switch(act){
  case 'back':wzMove(-1);return;
  case 'skip':case 'next':
   if(wz.step==='mode'&&!wz.mode)return;
   wzMove(1);return;
  case 'close':closeWizard();render();return;
  case 'save-identity':{const f=$('#wz-identity');if(!f.reportValidity())return;const fd=new FormData(f);
   try{app.profile=await api('/api/profile',{method:'POST',body:{studio_name:String(fd.get('studio_name')||'').trim(),photographer:String(fd.get('photographer')||'').trim()}});applyProfile();wzMove(1);}
   catch(err){toast(err.message,true);}return;}
  case 'do-restore':{const pick=wz.restore.pick;if(!pick)return;
   if(app.photos.length&&!confirm(`Substituir o acervo atual deste PC (${app.photos.length} fotos) pelo do backup?\n\nUma cópia de segurança do estado atual é guardada antes.`))return;
   if(pick.kind==='zip')await runRestore(()=>uploadRestore(pick.file,p=>{wz.restore.upload=p;if(!wz.restore.total)renderWizard();}));
   else await runRestore(()=>api('/api/backup/restore-folder',{method:'POST',body:{folder:pick.folder}}));
   return;}
  case 'pick-restore-folder':{try{toast('Abrindo o seletor de pastas…');const r=await api('/api/pick-folder',{method:'POST',body:{purpose:'restore'}});
    if(r.cancelled)return;if(r.ok===false){toast(r.error||'Essa pasta não tem um backup.',true);return;}
    wz.restore={state:'idle',pick:{kind:'folder',...r}};renderWizard();}catch(err){toast(err.message,true);}return;}
  case 'pick-watch-folder':{try{toast('Abrindo o seletor de pastas…');const d=await api('/api/pick-folder',{method:'POST',body:{}});
    if(d.ok){app.status=await api('/api/status');updateSidebar();toast('Pasta conectada. Verificando as fotos…');}renderWizard();}catch(err){toast(err.message,true);}return;}
  case 'site-login':{try{const r=await api('/api/site/login',{method:'POST',body:{}});toast(r.message);app.site=await api('/api/site/status');renderWizard();}catch(err){toast(err.message,true);}return;}
  case 'finish':{try{app.profile=await api('/api/profile',{method:'POST',body:{onboarded:true}});}catch(err){toast(err.message,true);return;}
   closeWizard();applyProfile();setView('photos');toast(`Estúdio ${app.profile.studio_name||''} pronto! O Guia fica no menu 07.`);return;}
 }
}

/* ---------------------------------------------------------------- eventos (chamados por app.js) */
async function onboardingClick(e){
 const t=e.target;
 const look=t.closest('[data-look]');if(look){const [target,preset]=look.dataset.look.split(':');await saveTheme(target,{preset,accent:''});return true;}
 const reset=t.closest('[data-look-reset]');if(reset){await saveTheme(reset.dataset.lookReset,{accent:''});return true;}
 if(t.closest('[data-look-preview]')){app.previewHash='';app.previewPublic=false;setView('preview');return true;}
 const go=t.closest('[data-goto]');if(go){const [view,tab]=go.dataset.goto.split(':');if(tab)app.pageTab[view]=tab;setView(view);return true;}
 if(t.closest('[data-wz-open-restore]')){openWizard();wz.mode='continue';wz.visited.add('mode');wzGo('restore');return true;}
 if(!wz.open||!t.closest('#wizard'))return false;
 const step=t.closest('[data-wz-step]');if(step){wzGo(step.dataset.wzStep);return true;}
 const mode=t.closest('[data-wz-mode]');if(mode){wz.mode=mode.dataset.wzMode;renderWizard();return true;}
 const folder=t.closest('[data-wz-folder]');if(folder){const f=(wz.found||[]).find(x=>x.folder===folder.dataset.wzFolder)||(wz.restore.pick?.folder===folder.dataset.wzFolder?wz.restore.pick:null);
  if(f)wz.restore={state:'idle',pick:{kind:'folder',...f}};renderWizard();return true;}
 const ph=t.closest('[data-wz-photo]');if(ph){wz.photoMode=ph.dataset.wzPhoto;renderWizard();return true;}
 const act=t.closest('[data-wz-act]');if(act){await wzAction(act.dataset.wzAct);return true;}
 return false;
}
async function onboardingSubmit(e){
 if(e.target.id==='wz-identity'){e.preventDefault();await wzAction('save-identity');return true;}
 if(e.target.id==='wz-psn-form'){e.preventDefault();
  const field=$('#wz-npsso'),npsso=(field?.value||'').trim();if(field)field.value='';
  const btn=e.target.querySelector('button[type=submit]');if(btn)btn.disabled=true;
  try{app.psn=await api('/api/psn/connect',{method:'POST',body:{npsso}});wz.psnError='';toast('Conta Sony conectada. Buscando suas fotos…');}
  catch(err){wz.psnError=err.message;toast('Falha Sony: '+err.message,true);}
  renderWizard();return true;}
 return false;
}
