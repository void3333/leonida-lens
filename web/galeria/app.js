// Leonida · PROJEÇÃO — uma fotografia por vez, em tela cheia; a interface assume as cores de cada imagem.
import PhotoSwipeLightbox from "/vendor/photoswipe-lightbox.esm.min.js";
import PhotoSwipeDynamicCaption from "/vendor/photoswipe-dynamic-caption.esm.js";

const PUBLIC = Boolean(window.LFN_PUBLIC);
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOBILE = matchMedia("(max-width: 820px), (pointer: coarse) and (max-height: 500px)");   // mesma regra do gallery-mobile.css
const isM = () => MOBILE.matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad2 = (n) => String(n).padStart(2, "0");
const ICON = {
  pin: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cloud: '<path d="M17.5 19H8a5 5 0 1 1 1.6-9.7A6 6 0 0 1 21 12.5 3.5 3.5 0 0 1 17.5 19Z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  zoom: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  edit: '<path d="m4 16-.8 4.8L8 20l11-11-4-4L4 16Z"/><path d="m13 7 4 4"/>',
  play: '<path d="M7 4v16l13-8Z"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
};
const svg = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const dateBR = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ""; };

const S = {
  photos: [], essays: [], byId: new Map(), essayById: new Map(), acc: new Map(), serie: new Map(), profile: {},
  set: { kind: "all", id: null }, list: [], index: 0, view: "proj", layer: null,
  playing: false, playTimer: null, map: null, mapStyle: "night", idxFilter: "all", viewer: null,
};

/* ================================================================ dados */
const cmp = (a, b) => { a = a || ""; b = b || ""; return a < b ? -1 : a > b ? 1 : 0; };
function buildAccessions(photos) {                      // mesma regra do Estúdio: LFN-AAAA-NNNN
  const at = (p) => p.captured_at || p.published_at;
  const sorted = [...photos].sort((a, b) => cmp(a.taken_on, b.taken_on) || cmp(at(a), at(b)) || cmp(String(a.id), String(b.id)));
  const seq = {}, map = new Map();
  for (const p of sorted) {
    const y = /^\d{4}/.test(p.taken_on || "") ? p.taken_on.slice(0, 4) : "0000";
    seq[y] = (seq[y] || 0) + 1;
    map.set(p.id, `LFN-${y}-${String(seq[y]).padStart(4, "0")}`);
  }
  for (const p of photos) if (p.accession) map.set(p.id, p.accession);   // site público: tombos do acervo inteiro
  return map;
}
const tombo = (p) => S.acc.get(p.id) || "LFN-0000-0000";
const hasPos = (p) => p.map_x != null && p.map_y != null;
const accSeq = (p) => { const m = /(\d{4})-(\d{4})$/.exec(tombo(p)); return m ? Number(m[1]) * 10000 + Number(m[2]) : 0; };
function autoPick(list, p, mult) { return list && list.length ? list[(accSeq(p) * mult) % list.length] : ""; }
const titleOf = (p) => p.title || autoPick(S.lib?.titles, p, 37) || p.location || `Registro ${tombo(p).slice(-4)}`;
const essaysOrdered = () => [...S.essays].sort((a, b) => cmp(a.created_at, b.created_at) || cmp(String(a.id), String(b.id)));
const essayPhotos = (id) => S.photos.filter((p) => p.essay_id === id).sort((a, b) => ((a.essay_pos ?? 9999) - (b.essay_pos ?? 9999)) || cmp(tombo(a), tombo(b)));
const journeyPhotos = () => [...S.photos].sort((a, b) => cmp(tombo(a), tombo(b)));   // desde o início
const allPhotos = () => [...S.photos].sort((a, b) => cmp(tombo(b), tombo(a)));   // mais recente primeiro

/* tema escolhido no Estúdio (Meu estúdio → Aparência); ?tema=…&destaque=… só para prévias */
function applyTheme(theme) {
  const T = window.LFNThemes; if (!T) return;
  const q = new URLSearchParams(location.search);
  const preset = q.get("tema") || theme?.preset || "codigo";
  const accent = q.has("destaque") ? (q.get("destaque") ? "#" + q.get("destaque").replace(/^#/, "") : "") : (theme?.accent || "");
  T.apply(preset, accent);
  if (!q.get("tema")) T.remember("gallery", preset, accent);
}
async function load() {
  try {
    const visitor = new URLSearchParams(location.search).get("publico") === "1";
    const r = await fetch(window.LFN_CATALOG || (visitor ? "/api/catalog?publico=1" : "/api/catalog"), { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const c = await r.json();
    S.photos = c.photos || []; S.essays = c.essays || []; S.profile = c.profile || {};
    applyTheme(c.theme);
  } catch { S.photos = []; S.essays = []; }
  S.byId = new Map(S.photos.map((p) => [p.id, p]));
  S.essayById = new Map(S.essays.map((e) => [e.id, e]));
  S.acc = buildAccessions(S.photos);
  try { const lr = await fetch("/vendor/lfn-frases.json"); if (lr.ok) S.lib = await lr.json(); } catch { /* sem biblioteca */ }
  S.serie = new Map(essaysOrdered().map((e, i) => [e.id, e.serie || `Série ${pad2(i + 1)}`]));
}
function listFor(set) {
  if (set.kind === "essay") return essayPhotos(set.id);
  if (set.kind === "fav") return allPhotos().filter((p) => p.favorite);
  if (set.kind === "journey") return journeyPhotos();
  return allPhotos();
}

/* ================================================================ cor da fotografia */
const colorCache = new Map();
function hsl(h, s, l) { return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`; }
function analyze(p) {
  if (colorCache.has(p.id)) return colorCache.get(p.id);
  const job = new Promise((resolve) => {
    const fallback = { c1: "#2B0E2E", c2: "#FF3D8B", c3: "#FFC857", hue: 330 };
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const N = 28, cv = document.createElement("canvas"); cv.width = N; cv.height = N;
        const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, N, N);
        const d = cx.getImageData(0, 0, N, N).data;
        const buckets = new Array(24).fill(0);
        let lumSum = 0;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, c = mx - mn;
          lumSum += l;
          if (c < .08 || l < .08 || l > .95) continue;
          let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
          h = (h * 60 + 360) % 360;
          buckets[Math.floor(h / 15)] += c * (1 - Math.abs(l - .5));
        }
        const order = buckets.map((w, i) => [w, i]).sort((a, b) => b[0] - a[0]);
        if (!order[0][0]) return resolve(fallback);
        const h1 = order[0][1] * 15 + 7.5;
        const second = order.find(([w, i]) => w > 0 && Math.min(Math.abs(i * 15 - h1), 360 - Math.abs(i * 15 - h1)) > 40);
        const h2 = second ? second[1] * 15 + 7.5 : (h1 + 38) % 360;
        const dark = lumSum / (d.length / 4) < .3;
        resolve({ hue: h1, c1: hsl(h1, 55, dark ? 16 : 20), c2: hsl(h1, 88, 62), c3: hsl(h2, 90, 68) });
      } catch { resolve(fallback); }
    };
    img.onerror = () => resolve(fallback);
    img.src = p.thumb;
  });
  colorCache.set(p.id, job);
  return job;
}
const MONO_UI = true;   // padrão do Estúdio: interface preto e branco (as fotos são a única cor)
async function paint(p) {
  if (MONO_UI) return;
  const c = await analyze(p);
  const root = document.documentElement.style;
  root.setProperty("--c1", c.c1); root.setProperty("--c2", c.c2); root.setProperty("--c3", c.c3);
}

/* ================================================================ palco */
let showToken = 0, ambientFlip = false;
const kbFor = (id) => ["kb-a", "kb-b", "kb-c"][[...id].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 3];
function fitClass(p) {
  const box = $("#shots").getBoundingClientRect();
  const r = (p.width / p.height) / ((box.width || innerWidth) / (box.height || innerHeight));
  return r < .78 || r > 1.4 ? "is-contain" : "";
}
const PORTRAIT_M = matchMedia("(max-width: 820px) and (orientation: portrait)");
function sizeFrame(p) {   // celular em pé: a moldura assume a proporção da foto, sem cortar o enquadramento
  const root = document.documentElement.style;
  if (!isM() || !PORTRAIT_M.matches || !p) { root.removeProperty("--ph"); return; }
  const w = innerWidth, h = Math.min(Math.max(w * (p.height / p.width), w * .56), innerHeight * .58);
  root.setProperty("--ph", `${Math.round(h)}px`);
}
function putOnStage(p, dir = 1) {
  const token = ++showToken;
  sizeFrame(p);
  const img = new Image();
  img.className = "shot";
  img.alt = p.title || "";
  img.decoding = "async";
  img.src = p.preview;
  const fit = fitClass(p);
  if (fit) img.classList.add(fit);
  img.style.setProperty("--kb", kbFor(p.id));
  paint(p);
  const ready = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
  return ready.then(() => {
    if (token !== showToken) return false;
    const shots = $("#shots");
    for (const old of $$(".shot:not(.leave)", shots)) {
      old.classList.remove("enter", "from-left");
      old.classList.add("leave"); if (dir < 0) old.classList.add("to-left");
      setTimeout(() => old.remove(), 1100);
    }
    if (!REDUCE) { img.classList.add("enter", "kb"); if (dir < 0) img.classList.add("from-left"); }
    shots.appendChild(img);
    const amb = ambientFlip ? $("#ambient-a") : $("#ambient-b"), other = ambientFlip ? $("#ambient-b") : $("#ambient-a");
    ambientFlip = !ambientFlip;
    amb.src = p.thumb; amb.classList.add("on"); other.classList.remove("on");
    return true;
  });
}

function show(i, dir = 1, { silent = false, unsealed = false } = {}) {
  const n = S.list.length;
  if (!n) return;
  i = ((i % n) + n) % n;
  const p = S.list[i];
  if (S.set.kind === "essay" && !unsealed && !seal.isOpen(p.id)) {   // foto de ensaio ainda lacrada: pergunta antes
    setPlaying(false);
    openPreroll(p, S.set.id, () => { seal.open(p.id); show(i, dir, { silent, unsealed: true }); },
      () => { location.hash = `#/ensaio/${S.set.id}`; });
    return;
  }
  S.index = i;
  const cap = $("#caption");
  cap.classList.remove("is-in"); if (!REDUCE) cap.classList.add("is-out");
  $("#epigraph")?.classList.remove("is-in");
  putOnStage(p, dir).then((ok) => {
    if (!ok) return;
    renderCaption(p); renderGhost(); markReel(); renderFieldCard(p); renderEpigraph(p);
    const sh = $("#m-sheet"); if (sh) sh.scrollTop = 0;
    if (S.set.kind === "journey") journeyChapter(p);
  });
  preloadAround(i);
  document.title = `${titleOf(p)} — ${S.profile.studio_name || "Leonida"}`;
  if (!silent && S.view === "proj") {
    const h = S.set.kind === "essay" ? `#/ensaio/${S.set.id}/${p.id}` : S.set.kind === "fav" ? `#/favoritas/${p.id}` : S.set.kind === "journey" ? `#/desde/${p.id}` : `#/foto/${p.id}`;
    if (location.hash !== h) history.replaceState(null, "", h);
  }
  if (S.playing) schedulePlay();
}
const next = () => S.list.length > 1 && show(S.index + 1, 1);
const prev = () => S.list.length > 1 && show(S.index - 1, -1);
function preloadAround(i) {
  for (const k of [1, -1, 2]) {
    const p = S.list[(i + k + S.list.length) % S.list.length];
    if (p) { const im = new Image(); im.decoding = "async"; im.src = p.preview; if (!MONO_UI) analyze(p); }
  }
}

/* ---------------------------------------------------------------- legenda */
function chip(icon, text, small, href) {
  const inner = `${svg(icon)}<span>${esc(text)}</span>${small ? `<small>${esc(small)}</small>` : ""}`;
  return href ? `<a class="chip" href="${href}">${inner}</a>` : `<span class="chip">${inner}</span>`;
}
function renderCaption(p) {
  const essay = p.essay_id && S.essayById.get(p.essay_id);
  const words = titleOf(p).split(/\s+/).filter(Boolean);
  const chips = [];
  if (essay && S.set.kind !== "essay") chips.push(chip("layers", essay.title, S.serie.get(essay.id), `#/ensaio/${essay.id}`));
  const cap = $("#caption");
  cap.innerHTML = `
    <div class="cap-kicker">${S.set.kind === "journey" ? `<span class="cap-day">Dia ${journeyDay(p)}</span><i class="cap-dot"></i>` : ""}<span class="cap-tombo">${esc(tombo(p))}</span>${p.taken_on ? `<i class="cap-dot"></i><span>${esc(dateBR(p.taken_on))}</span>` : ""}${p.favorite ? `<span class="cap-fav">Selecionada</span>` : ""}</div>
    <h1 class="cap-title">${words.map((w, k) => `<span class="ln" style="--l:${k}"><span>${esc(w)}</span></span>`).join(" ")}</h1>
    ${chips.length ? `<div class="cap-meta">${chips.map((c, k) => c.replace('class="chip"', `class="chip" style="--c:${k}"`)).join("")}</div>` : ""}
    <div class="cap-actions">
      <button class="btn btn-hot" data-act="zoom">${svg("zoom")}Ampliar</button>
      <a class="btn" href="${esc(p.original)}${PUBLIC ? "" : "?download=1"}" download="${esc(p.download_name || "leonida.jpg")}">${svg("download")}Original</a>
      ${PUBLIC ? "" : `<a class="btn" href="/#foto=${esc(p.id)}">${svg("edit")}Editar ficha</a>`}
    </div>`;
  cap.classList.remove("is-out"); void cap.offsetWidth; cap.classList.add("is-in");
}
function renderGhost() {
  const g = $("#ghost-num");
  g.innerHTML = `${pad2(S.index + 1)}<small>/${pad2(S.list.length)}</small>`;
  g.classList.remove("is-in"); void g.offsetWidth; g.classList.add("is-in");
  const mc = $("#m-count");
  if (mc) {
    mc.innerHTML = `<b>${pad2(S.index + 1)}</b> / ${pad2(S.list.length)}`;
    $("#m-bar").style.width = `${S.list.length ? ((S.index + 1) * 100 / S.list.length) : 0}%`;
  }
}
function renderSetline() {
  const el = $("#setline");
  if (S.set.kind === "essay") {
    const e = S.essayById.get(S.set.id);
    el.innerHTML = `${esc(S.serie.get(S.set.id) || "Série")}<b>${esc(e?.title || "")}</b><button data-act="exit-set">Ver acervo completo ×</button>`;
  } else if (S.set.kind === "journey") {
    el.innerHTML = `Jornada<b>Desde o início</b><button data-act="exit-set">Ver acervo completo ×</button>`;
  } else if (S.set.kind === "fav") {
    el.innerHTML = `Seleção<b>Favoritas</b><button data-act="exit-set">Ver acervo completo ×</button>`;
  } else {
    el.innerHTML = `Acervo<b>Completo</b>`;   // o fotógrafo não importa: só o arquivo
  }
}

/* ---------------------------------------------------------------- epígrafe: a nota de campo como pensamento */
// Quando a foto não tem nota, o arquivo oferece um pensamento (textos originais deste app).
const THOUGHTS = [
  "Fotografar é aceitar perder tudo o que ficou fora do quadro.",
  "Leonida não posa. Às vezes, quem espera é que acaba sendo visto por ela.",
  "Toda fotografia é um lugar que deixou de existir no instante em que existiu.",
  "O que a cidade esconde de dia, a madrugada empresta por alguns segundos.",
  "Olhar é diferente de ver. Ver é quando o mundo olha de volta.",
  "Não existe foto neutra: existe alguém que escolheu ficar.",
  "Cada registro é uma pergunta que a rua ainda não respondeu.",
  "A luz passa. O que fica é a decisão de apertar o botão.",
  "Ninguém atravessa a mesma esquina duas vezes — nem o fotógrafo.",
  "O silêncio de uma imagem é o barulho que a cidade não fez.",
  "Guardar um instante é uma forma educada de discordar do tempo.",
  "Há mais verdade no que a foto deixa de mostrar.",
];
const hashOf = (id) => [...String(id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
const wordsIn = (t) => String(t || "").trim().split(/\s+/).filter(Boolean);
function readMs(p) { return Math.min(16000, Math.max(7000, 2600 + wordsIn(p.caption || "").length * 330)); }
let epiTimer = null;
function renderEpigraph(p) {
  const el = $("#epigraph");
  if (!el) return;
  const own = Boolean(p.caption && p.caption.trim());
  const text = own ? p.caption.trim() : (autoPick(S.lib?.phrases, p, 53) || THOUGHTS[hashOf(p.id) % THOUGHTS.length]);
  const words = wordsIn(text);
  const size = text.length < 70 ? "is-short" : text.length < 160 ? "is-mid" : "is-long";
  const who = "";   // sem nome de personagem: quem fotografa pode mudar
  const where = [p.location, p.game_time && `${p.game_time} no jogo`].filter(Boolean).join(", ");
  const sig = [who, where].filter(Boolean).join(" · ");
  el.className = `epigraph ${size} ${own ? "is-note" : "is-thought"}`;
  el.innerHTML = `<span class="epi-label">Nota de campo</span>
    <p class="epi-text"><span class="epi-q" aria-hidden="true">“</span>${words.map((w, i) => `<span class="w" style="--w:${i}">${esc(w)}</span>`).join(" ")}<span class="epi-q" aria-hidden="true">”</span></p>
    ${sig ? `<footer class="epi-sig">— ${esc(sig)}</footer>` : ""}`;
  clearTimeout(epiTimer);
  if (!REDUCE) epiTimer = setTimeout(() => el.classList.add("is-in"), 450); else el.classList.add("is-in");
}

/* ---------------------------------------------------------------- ficha de campo: onde, quando, clima */
let fc = null;   // { map, marker }
const LEONIDA_VIEW = window.LeonidaMap?.official ? window.LeonidaMap.bounds : [[-820, 200], [-180, 760]];
// Mapa oficial colorido ou P&B (padrão do tema). Mesma chave do Estúdio: a escolha vale nos dois.
function setMapColor(on) {
  S.mapColor = !!on;
  try { localStorage.setItem("lfn.mapcolor", on ? "1" : "0"); } catch { /* sem armazenamento */ }
  document.body.classList.toggle("map-color", S.mapColor);
  $$("[data-mapcolor]").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.mapcolor === "1") === S.mapColor)));
}
try { S.mapColor = localStorage.getItem("lfn.mapcolor") === "1"; } catch { S.mapColor = false; }
document.body.classList.toggle("map-color", S.mapColor);
const MAP_LIGHT = () => !!window.LeonidaMap?.official || S.mapStyle === "day";   // mapa oficial é claro
function initFieldCard() {
  if (fc || !window.L || !window.LeonidaMap) return;
  const map = window.LeonidaMap.create($("#fc-map"), { style: "night", zoomControl: false, fit: LEONIDA_VIEW });
  ["dragging", "touchZoom", "doubleClickZoom", "scrollWheelZoom", "boxZoom", "keyboard"].forEach((h) => map[h]?.disable());
  map.attributionControl?.remove?.();
  const icon = L.divIcon({ className: "fc-pin", iconSize: [22, 22], iconAnchor: [11, 11], html: "<span></span>" });
  const marker = L.marker([-500, 500], { icon, interactive: false, keyboard: false });
  fc = { map, marker, shown: false };
}
const timeOf = (iso) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : ""; };
function renderFieldCard(p) {
  const card = $("#fieldcard");
  if (!card) return;
  const mapVisible = $("#fc-map").offsetWidth > 0;   // celular deitado: a ficha fica escondida
  if (mapVisible) initFieldCard();
  const pos = hasPos(p);
  card.href = pos ? `#/mapa/${p.id}` : "#/mapa";
  card.classList.toggle("has-pos", pos);
  $("#fc-place").innerHTML = p.location
    ? `<b>${esc(p.location)}</b><span>Leonida</span>`
    : `<b class="is-secret">Local secreto</b><span>Leonida</span>`;
  const rows = [
    p.game_time && ["clock", "Hora no jogo", p.game_time],
    p.weather && ["cloud", "Clima", p.weather],
    ["cal", "Captura", [dateBR(p.taken_on), timeOf(p.captured_at)].filter(Boolean).join(" · ") || "—"],
  ].filter(Boolean);
  $("#fc-rows").innerHTML = rows.map(([ic, k, v], i) => `<div style="--r:${i}"><dt>${svg(ic)}${esc(k)}</dt><dd class="${v === "—" ? "is-empty" : ""}">${esc(v)}</dd></div>`).join("");
  const note = $("#fc-note");
  note.hidden = true;
  note.innerHTML = "";
  const nomap = $("#fc-nomap");
  if (fc && mapVisible) {
    if (pos) {
      const ll = window.LeonidaMap.toLatLng(p.map_x, p.map_y);
      fc.marker.setLatLng(ll); if (!fc.shown) { fc.marker.addTo(fc.map); fc.shown = true; }
      fc.map.invalidateSize();
      fc.map.flyTo(ll, 3.4, { duration: REDUCE ? 0 : 1.3 });
    } else {
      if (fc.shown) { fc.marker.remove(); fc.shown = false; }
      fc.map.invalidateSize();
      fc.map.flyToBounds(LEONIDA_VIEW, { duration: REDUCE ? 0 : 1 });
    }
  }
  nomap.hidden = pos;
  nomap.innerHTML = pos ? "" : `<i class="fc-lock" aria-hidden="true"></i><b>Local secreto</b><span>${PUBLIC ? "o fotógrafo guardou este lugar" : "sem ponto no mapa · marque na ficha, se quiser"}</span>`;
  card.classList.remove("is-in"); void card.offsetWidth; card.classList.add("is-in");
}

/* ---------------------------------------------------------------- faixa de filme */
const FRAME_W = 74, FRAME_GAP = 6, CUR_W = 128;
function buildReel() {
  $("#reel-track").innerHTML = S.list.map((p, i) =>
    `<button class="frame" data-go="${i}" aria-label="${esc(`${pad2(i + 1)} · ${titleOf(p)}`)}"><img src="${esc(p.thumb)}" alt="" loading="lazy" decoding="async"/><span class="frame-num">${pad2(i + 1)}</span></button>`).join("");
  markReel();
}
function markReel() {
  $$("#reel-track .frame").forEach((f, i) => f.classList.toggle("is-current", i === S.index));
  $("#reel-track").style.setProperty("--rx", `${-(S.index * (FRAME_W + FRAME_GAP) + CUR_W / 2)}px`);
}

/* ---------------------------------------------------------------- reproduzir */
const PLAY_MS = 7000;
function schedulePlay() {
  clearTimeout(S.playTimer);
  const bar = $("#reel-bar");
  bar.style.transition = "none"; bar.style.width = "0%"; void bar.offsetWidth;
  const ms = S.list[S.index] ? readMs(S.list[S.index]) : PLAY_MS;
  bar.style.transition = `width ${ms}ms linear`; bar.style.width = "100%";
  S.playTimer = setTimeout(() => next(), ms);
}
function setPlaying(on) {
  S.playing = on && S.list.length > 1;
  document.body.classList.toggle("is-playing", S.playing);
  $("#btn-play").setAttribute("aria-pressed", String(S.playing));
  $("#btn-play .tool-label").textContent = S.playing ? "Pausar" : "Reproduzir";
  if (S.playing) schedulePlay(); else { clearTimeout(S.playTimer); $("#reel-bar").style.width = "0%"; }
}

/* ---------------------------------------------------------------- modo cinema: a interface some quando o mouse para */
let idleTimer = null;
function wake() {
  document.body.classList.remove("is-idle");
  clearTimeout(idleTimer);
  if (isM()) return;
  idleTimer = setTimeout(() => { if (!S.layer && !S.viewer) document.body.classList.add("is-idle"); }, 4800);
}

/* ================================================================ zoom em qualidade máxima */
function toItem(p) {
  const item = { width: p.width, height: p.height, msrc: p.preview, thumbCropped: true, alt: p.title || "", photo: p };
  if (p.width > (p.preview_width || p.width) && p.preview !== p.original) {
    item.src = p.preview;
    item.srcset = `${p.preview} ${p.preview_width}w, ${p.original} ${p.width}w`;   // ao dar zoom, carrega o original
  } else item.src = p.original;
  return item;
}
function zoomCaption(p) {
  if (!p) return "";
  const rows = [p.location && ["pin", p.location], p.game_time && ["clock", p.game_time + " no jogo"], p.weather && ["cloud", p.weather],
    ["cal", [dateBR(p.taken_on), timeOf(p.captured_at)].filter(Boolean).join(" · ")]].filter((r) => r && r[1]);
  return `<div class="zc"><div class="zc-tombo">${esc(tombo(p))}</div><h3 class="zc-t">${esc(titleOf(p))}</h3>
    ${p.caption ? `<p class="zc-note">“${esc(p.caption)}”</p>` : ""}
    <ul class="zc-rows">${rows.map(([ic, v]) => `<li>${svg(ic)}<span>${esc(v)}</span></li>`).join("")}</ul></div>`;
}
function openZoom(list = S.list, index = S.index, onClose) {
  if (S.viewer) return;
  setPlaying(false);
  const lb = new PhotoSwipeLightbox({
    dataSource: list.map(toItem), index,
    pswpModule: () => import("/vendor/photoswipe.esm.min.js"),
    bgOpacity: 1, showHideAnimationType: REDUCE ? "none" : "zoom",
    showAnimationDuration: 520, hideAnimationDuration: 420, easing: "cubic-bezier(.22,.8,.2,1)",
    initialZoomLevel: "fit", secondaryZoomLevel: (z) => Math.max(1, z.fit * 2), maxZoomLevel: (z) => Math.max(4, z.fit * 4),
    wheelToZoom: true, imageClickAction: "zoom", tapAction: "toggle-controls", doubleTapAction: "zoom",
    bgClickAction: "close", closeOnVerticalDrag: true, padding: { top: 72, bottom: 72, left: 40, right: 40 },
    preload: [1, 2], indexIndicatorSep: " / ",
    returnFocus: false,   // devolver o foco ao #zone-open (botão invisível) desenhava um retângulo branco ao fechar com Esc closeTitle: "Fechar (Esc)", zoomTitle: "Zoom", arrowPrevTitle: "Anterior", arrowNextTitle: "Próxima",
    errorMsg: "Não foi possível carregar esta fotografia.",
  });
  lb.addFilter("thumbEl", (el, data) => {
    const cur = $("#shots .shot:not(.leave)");
    return cur && data.photo === S.list[S.index] && !onClose ? cur : el;
  });
  lb.on("uiRegister", () => {
    const pswp = lb.pswp;
    pswp.ui.registerElement({
      name: "lfn-zoom", order: 7, isButton: false, className: "lfn-zoom", appendTo: "bar",
      onInit: (el) => {
        const upd = () => { const s = pswp.currSlide; if (s) el.textContent = s.currZoomLevel > s.zoomLevels.initial * 1.02 ? `${Math.round(s.currZoomLevel * 100)}%` : ""; };
        pswp.on("zoomPanUpdate", upd); pswp.on("change", upd);
      },
    });
    pswp.ui.registerElement({
      name: "lfn-download", order: 8, isButton: true, tagName: "a", title: "Baixar original", className: "pswp__button--lfn", html: svg("download"),
      onInit: (el) => { const upd = () => { const p = pswp.currSlide?.data.photo; if (!p) return; el.href = p.original + (PUBLIC ? "" : "?download=1"); el.setAttribute("download", p.download_name || ""); }; pswp.on("change", upd); upd(); },
    });
  });
  // Legenda ao lado da foto quando sobra espaço; embaixo no celular (plugin oficial do PhotoSwipe).
  new PhotoSwipeDynamicCaption(lb, { type: "auto", mobileLayoutBreakpoint: 700, horizontalEdgeThreshold: 20, mobileCaptionOverlapRatio: 0.3,
    captionContent: (slide) => zoomCaption(slide.data.photo) });
  lb.on("change", () => { const p = lb.pswp.currSlide?.data.photo; if (p) paint(p); });
  lb.on("close", () => {
    const at = lb.pswp?.currIndex ?? index;
    S.viewer = null;
    if (onClose) onClose(at);
    else if (at !== S.index) show(at, at > S.index ? 1 : -1);
  });
  lb.on("destroy", () => {
    if (S.viewer === lb) S.viewer = null;
    if (!onClose) $("#stage")?.focus({ preventScroll: true });   // palco: tabindex=-1, sem contorno; setas continuam funcionando
  });
  S.viewer = lb;
  lb.init(); lb.loadAndOpen(index);
}

/* ================================================================ módulos (jogo, névoa): arquivos próprios em /galeria/*.js */
// Contrato: guess.js exporta mount(el, ctx) / unmount(); fog.js exporta addFog(map, photos, ctx) → { remove(), percent }.
S.mods = {};
function modCtx() {
  return { photos: allPhotos(), hasPos, titleOf, tombo, esc, svg, dateBR, LeonidaMap: window.LeonidaMap, L: window.L,
    MONO: MONO_UI, PUBLIC, REDUCE, isMobile: isM, studio: S.lib?.studio || document.title,
    open: (id) => { location.hash = `#/foto/${id}`; }, showOnMap: (id) => { location.hash = `#/mapa/${id}`; } };
}
async function loadMod(name) {
  if (!S.mods[name]) { try { S.mods[name] = await import(`/galeria/${name}.js`); } catch (e) { console.warn("[mod]", name, e); S.mods[name] = {}; } }
  return S.mods[name];
}
async function mountModule(name, el) { const m = await loadMod(name); if (S.layer === "game") m.mount?.(el, modCtx()); }

/* ================================================================ camadas */
function openLayer(name, arg) {
  for (const n of ["essays", "index", "map", "journey", "essay", "game"]) if (n !== name) closeLayerEl(n);
  S.layer = name;
  document.body.classList.add("has-layer"); document.body.classList.remove("is-idle");
  setPlaying(false);
  const el = $(`#layer-${name}`);
  const wasHidden = el.hidden;
  el.hidden = false;
  if (wasHidden && !REDUCE) { el.classList.remove("is-in"); void el.offsetWidth; el.classList.add("is-in"); }
  if (name === "essays") renderEssaysLayer(wasHidden);
  if (name === "index") renderIndexLayer();
  if (name === "map") renderMapLayer(arg, wasHidden);
  if (name === "journey") renderJourneyLayer();
  if (name === "essay") renderEssaySheet(arg);
  if (name === "game") mountModule("guess", el);
}
function closeLayerEl(name) {
  const el = $(`#layer-${name}`);
  if (!el || el.hidden) return;
  el.hidden = true; el.classList.remove("is-in");
  if (name === "map" && S.map) { S.fog?.remove?.(); S.fog = null; S.map.remove(); S.map = null; el.innerHTML = ""; }
  if (name === "game") { S.mods.guess?.unmount?.(); el.innerHTML = ""; }
}
function closeLayers() {
  const had = S.layer;
  for (const n of ["essays", "index", "map", "journey", "essay", "game"]) closeLayerEl(n);
  S.layer = null;
  document.body.classList.remove("has-layer");
  return had;
}

/* ---------------------------------------------------------------- Ensaios: capítulos */
function renderEssaysLayer(fresh) {
  const el = $("#layer-essays");
  const es = essaysOrdered();
  if (!es.length) {
    el.innerHTML = `<div class="ess-list"><div class="ess-kicker">Ensaios</div><div class="ess-empty">Nenhum ensaio ainda.</div><p style="color:var(--ink-2)">Séries montadas no Estúdio aparecem aqui como capítulos.</p></div><div></div>`;
    return;
  }
  if (!fresh && el.childElementCount) return;
  el.innerHTML = `<div class="ess-list" role="list"><div class="ess-kicker">Ensaios · ${es.length} ${es.length === 1 ? "capítulo" : "capítulos"}</div>
      ${es.map((e, i) => `<button class="ess-item" role="listitem" data-essay="${esc(e.id)}" style="--i:${i};--p:${totalOf(e) ? Math.round(revealed(e) * 100 / totalOf(e)) : 0}%"><span class="n">${esc(S.serie.get(e.id))}</span><span class="t">${esc(e.title)}</span><span class="c">${pad2(revealed(e))}/${pad2(totalOf(e))}</span></button>`).join("")}
    </div><aside class="ess-side" id="ess-side"></aside>`;
  hotEssay(es[0].id);
}
const totalOf = (e) => Math.max((e.slots || []).length, essayPhotos(e.id).length);
const revealed = (e) => essayPhotos(e.id).length;
function hotEssay(id) {
  const e = S.essayById.get(id), ps = essayPhotos(id);
  if (!e) return;
  $$("#layer-essays .ess-item").forEach((b) => b.classList.toggle("is-hot", b.dataset.essay === id));
  const total = totalOf(e), cells = Array.from({ length: 4 }, (_, i) => ps[i]);
  const openOnes = ps.filter((p) => seal.isOpen(p.id));
  $("#ess-side").innerHTML = `<div class="ess-kicker">${esc(S.serie.get(id))} · ${esc(e.genre || "ensaio")}</div>
    <h3>${esc(e.title)}</h3>${e.description ? `<p>${esc(e.description)}</p>` : ""}
    <div class="ess-strip">${cells.map((p) => !p ? `<span class="ess-latent" aria-hidden="true"></span>` : seal.isOpen(p.id) ? `<img src="${esc(p.thumb)}" alt=""/>` : `<span class="ess-latent is-sealed" aria-hidden="true"><i></i></span>`).join("")}</div>
    <div class="pz-progress small"><div class="pz-bar"><i style="width:${total ? Math.round(ps.length * 100 / total) : 0}%"></i></div><span>${ps.length} de ${total} revelados</span></div>
    <div class="ess-cta"><a class="btn btn-hot" href="#/ensaio/${esc(id)}">${svg("layers")}Ver as pautas</a>${ps.length ? `<a class="btn" href="#/ensaio/${esc(id)}/${esc(ps[0].id)}">${svg("play")}Projetar</a>` : ""}</div>`;
  if (openOnes.length) putOnStage(openOnes[0], 1);
}

/* ---------------------------------------------------------------- ENSAIO: cartão de contatos com pautas latentes */
function renderEssaySheet(id) {
  const el = $("#layer-essay"), e = S.essayById.get(id);
  if (!e) { el.innerHTML = `<div class="pz-wrap"><a class="pz-back" href="#/ensaios">← ensaios</a><p>Ensaio não encontrado.</p></div>`; return; }
  const ps = essayPhotos(id), byId = new Map(ps.map((p) => [p.id, p]));
  const slots = [...(e.slots || [])].sort((a, b) => a.pos - b.pos);
  const inSlots = new Set(slots.map((s) => s.photo_id).filter(Boolean));
  const extra = ps.filter((p) => !inSlots.has(p.id));
  const total = slots.length + extra.length, done = ps.length;
  const cell = (k, sl, p) => {
    const tag = `P${pad2(k + 1)}`;
    if (p && !seal.isOpen(p.id)) return `<button class="pz-cell is-filled is-sealed" data-unseal="${esc(p.id)}" data-eid="${esc(id)}" style="--i:${k}" aria-label="Foto ${tag} revelada e lacrada: romper o lacre">
        <span class="pz-media"><img class="pz-hint" src="${esc(p.thumb)}" alt="" loading="lazy" decoding="async"/><span class="pz-tag">${tag}</span>
          <span class="pz-seal" aria-hidden="true"><span class="seal-half a"></span><span class="seal-half b"></span><span class="seal-txt">LFN</span></span>
          <span class="pz-break">romper o lacre</span></span>
        <b class="pz-title is-locked">título lacrado</b><span class="pz-sub">revelada · lacrada</span></button>`;
    if (p) return `<a class="pz-cell is-filled" href="#/ensaio/${esc(id)}/${esc(p.id)}" style="--i:${k}">
        <span class="pz-media"><img src="${esc(p.thumb)}" alt="" loading="lazy" decoding="async"/><span class="pz-tag">${tag}</span><span class="pz-dev">revelada</span></span>
        <b class="pz-title">${esc(titleOf(p))}</b><span class="pz-sub">${esc([p.location || "local secreto", p.game_time].filter(Boolean).join(" · "))}</span></a>`;
    const meta = [["onde", sl.location || "local secreto"], ["quando", sl.game_time || "—"], ["clima", sl.weather || "—"]];
    return `<button class="pz-cell is-empty" data-pz style="--i:${k}" aria-label="Pauta ${tag} ainda sem foto: ${esc(sl.title)}">
      <span class="pz-card">
        <span class="pz-front">
          <span class="pz-media pz-latent"><i class="pz-c c1"></i><i class="pz-c c2"></i><i class="pz-c c3"></i><i class="pz-c c4"></i>
            <span class="pz-tag">${tag}</span><span class="pz-wait">aguardando revelação<em>_</em></span><span class="pz-scan" aria-hidden="true"></span></span>
          <b class="pz-title">${esc(sl.title || "Sem título")}</b>
          <span class="pz-phrase" data-full="${esc(sl.phrase || "")}"><span class="pz-typed" aria-hidden="true"></span></span>
        </span>
        <span class="pz-rear">
          <span class="pz-k">// pauta em aberto · ${tag}</span>
          <b>${esc(sl.title || "Sem título")}</b>
          <dl>${meta.map(([a, b]) => `<div><dt>${a}</dt><dd>${esc(b)}</dd></div>`).join("")}</dl>
          ${sl.phrase ? `<p>“${esc(sl.phrase)}”</p>` : ""}
          <small>O fotógrafo ainda está procurando esta foto.</small>
        </span>
      </span></button>`;
  };
  const cells = slots.map((sl, k) => cell(k, sl, sl.photo_id ? byId.get(sl.photo_id) : null))
    .concat(extra.map((p, j) => cell(slots.length + j, {}, p)));
  el.innerHTML = `<div class="pz-wrap">
    <header class="pz-head">
      <div class="pz-headtxt"><a class="pz-back" href="#/ensaios">← ensaios</a>
        <span class="pz-kicker">${esc(S.serie.get(id) || "")} · ${esc(e.genre || "ensaio")}</span>
        <h2>${esc(e.title)}</h2>${e.description ? `<p class="pz-manifesto">${esc(e.description)}</p>` : ""}
        ${(e.rules || []).length ? `<ul class="pz-rules">${e.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}</div>
      <div class="pz-side">
        <div class="pz-count"><b>${pad2(done)}</b><span>/${pad2(total)}</span></div>
        <div class="pz-progress"><div class="pz-bar"><i style="width:${total ? Math.round(done * 100 / total) : 0}%"></i></div><span>${done ? `${done} de ${total} revelados` : "nenhuma foto revelada ainda"}</span></div>
        ${done ? `<a class="btn btn-hot" href="#/ensaio/${esc(id)}/${esc(ps[0].id)}">${svg("play")}Projetar revelados</a>` : `<span class="pz-soon">o filme ainda está no banho químico</span>`}
      </div>
    </header>
    <div class="pz-grid">${cells.join("")}</div>
  </div>`;
}
/* ---------------------------------------------------------------- LACRE: a foto revelada só abre quando o visitante decide */
const seal = {
  key: (id) => `lfn-open-${id}`,
  isOpen(id) { return store.get(this.key(id)) === "1"; },
  open(id) { store.set(this.key(id), "1"); },
};
const PREROLL_MS = 15000;
let prerollTimer = null, prerollDone = null, prerollBack = null;
function closePreroll() {
  clearTimeout(prerollTimer);
  const el = $("#preroll");
  el.classList.remove("is-in");
  el.hidden = true;
  document.body.classList.remove("has-preroll");
}
function openPreroll(p, essayId, onGo, onBack) {
  const el = $("#preroll"), e = S.essayById.get(essayId) || {};
  const slot = (e.slots || []).find((s) => s.photo_id === p.id);
  const tag = slot ? `P${pad2(slot.pos + 1)}` : "extra";
  const phrase = (p.caption || slot?.phrase || autoPick(S.lib?.phrases, p, 53) || "").trim();
  const meta = [["onde", p.location || "local secreto"], ["quando", p.game_time || "—"], ["clima", p.weather || "—"], ["registro", tombo(p)]];
  prerollDone = () => { closePreroll(); onGo(); };
  prerollBack = () => { closePreroll(); onBack?.(); };
  el.innerHTML = `<div class="pr-inner">
      <span class="pr-kicker">${esc(S.serie.get(essayId) || "ensaio")} · ${esc(e.title || "")} · ${tag}</span>
      <span class="pr-state">// lacre rompido</span>
      <h2 class="pr-title">${esc(titleOf(p))}</h2>
      ${phrase ? `<p class="pr-phrase">${wordsIn(phrase).map((w, i) => `<span class="w" style="--w:${i}">${esc(w)}</span>`).join(" ")}</p>` : ""}
      <dl class="pr-meta">${meta.map(([a, b]) => `<div><dt>${a}</dt><dd>${esc(b)}</dd></div>`).join("")}</dl>
      <div class="pr-actions">
        <button class="pr-go" data-preroll="go"><svg class="pr-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15"/><circle class="pr-ring-run" cx="18" cy="18" r="15"/></svg><span>prosseguir →</span><small id="pr-count">15</small></button>
        <button class="pr-back" data-preroll="back">voltar</button>
      </div>
      <span class="pr-hint">enter prossegue · esc volta · prossegue sozinho em 15 s</span>
    </div>`;
  el.hidden = false;
  document.body.classList.add("has-preroll");
  requestAnimationFrame(() => el.classList.add("is-in"));
  const started = performance.now();
  const tick = () => {
    const left = Math.max(0, PREROLL_MS - (performance.now() - started));
    const c = $("#pr-count"); if (c) c.textContent = String(Math.ceil(left / 1000));
    if (left <= 0) { prerollDone?.(); return; }
    prerollTimer = setTimeout(tick, 250);
  };
  tick();
  el.querySelector(".pr-go").focus({ preventScroll: true });
}
document.addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-preroll]");
  if (b) { (b.dataset.preroll === "go" ? prerollDone : prerollBack)?.(); return; }
  const u = e.target.closest?.("[data-unseal]");
  if (!u || u.classList.contains("is-breaking")) return;
  const p = S.byId.get(u.dataset.unseal), eid = u.dataset.eid;
  if (!p) return;
  u.classList.add("is-breaking");          // o selo racha e cai
  seal.open(p.id);
  setTimeout(() => openPreroll(p, eid, () => { S.skipIntertitle = true; location.hash = `#/ensaio/${eid}/${p.id}`; },
    () => { renderEssaySheet(eid); }), REDUCE ? 0 : 720);
});
document.addEventListener("keydown", (e) => {
  if ($("#preroll")?.hidden !== false) return;
  if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); prerollDone?.(); }
  if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); prerollBack?.(); }
}, true);

// pautas latentes: inclinação com o mouse, frase digitada letra a letra, virar ao clicar
let pzTyping = null;
function pzType(cell) {
  const box = cell.querySelector(".pz-phrase"), out = cell.querySelector(".pz-typed"); if (!box || !out) return;
  const full = box.dataset.full || ""; let i = 0;
  clearInterval(pzTyping); out.textContent = "";
  if (REDUCE) { out.textContent = full; return; }
  pzTyping = setInterval(() => { i += 1; out.textContent = full.slice(0, i); if (i >= full.length) clearInterval(pzTyping); }, 22);
}
document.addEventListener("pointerover", (e) => {
  const c = e.target.closest?.(".pz-cell.is-empty");
  if (!c || c.contains(e.relatedTarget)) return;
  pzType(c);
});
document.addEventListener("pointerout", (e) => {
  const c = e.target.closest?.(".pz-cell.is-empty");
  if (!c || c.contains(e.relatedTarget)) return;
  clearInterval(pzTyping);
  const out = c.querySelector(".pz-typed"); if (out) out.textContent = "";
  c.style.removeProperty("--rx"); c.style.removeProperty("--ry");
});
document.addEventListener("pointermove", (e) => {
  const c = e.target.closest?.(".pz-cell.is-empty");
  if (!c || REDUCE) return;
  const r = c.getBoundingClientRect();
  c.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - .5) * 14}deg`);
  c.style.setProperty("--rx", `${(.5 - (e.clientY - r.top) / r.height) * 10}deg`);
}, { passive: true });
document.addEventListener("click", (e) => {
  const c = e.target.closest?.("[data-pz]");
  if (!c) return;
  c.classList.toggle("is-flipped");
});

/* ---------------------------------------------------------------- Índice: folha de contato */
function idxList() {
  const all = allPhotos();
  if (S.idxFilter === "fav") return all.filter((p) => p.favorite);
  if (S.idxFilter !== "all") return essayPhotos(S.idxFilter);
  return all;
}
function renderIndexLayer() {
  const el = $("#layer-index");
  const es = essaysOrdered().filter((e) => essayPhotos(e.id).length);
  const f = S.idxFilter;
  el.innerHTML = `<div class="idx-head"><h2>Índice</h2><span id="idx-count"></span></div>
    <div class="idx-filters" role="group" aria-label="Filtrar">
      <button data-idx="all" aria-pressed="${f === "all"}">Tudo</button>
      <button data-idx="fav" aria-pressed="${f === "fav"}">Favoritas</button>
      ${es.map((e) => `<button data-idx="${esc(e.id)}" aria-pressed="${f === e.id}">${esc(e.title)}</button>`).join("")}
    </div><div class="idx-grid" id="idx-grid"></div>`;
  drawIndexGrid();
}
function drawIndexGrid() {
  const grid = $("#idx-grid");
  if (!grid) return;
  const list = idxList();
  $("#idx-count").textContent = `${list.length} ${list.length === 1 ? "fotografia" : "fotografias"}`;
  const W = grid.clientWidth, gap = 8, target = isM() ? Math.max(110, W / 2.6) : innerWidth >= 1800 ? 300 : 240;
  const rows = []; let row = [], sum = 0;
  for (const p of list) {
    const ar = p.width / p.height;
    const before = row.length ? (W - gap * (row.length - 1)) / sum : Infinity;
    const after = (W - gap * row.length) / (sum + ar);
    if (row.length && after < target && Math.abs(before - target) <= Math.abs(after - target)) { rows.push({ items: row, h: before, full: true }); row = []; sum = 0; }
    row.push(p); sum += ar;
    const h = (W - gap * (row.length - 1)) / sum;
    if (h <= target) { rows.push({ items: row, h, full: true }); row = []; sum = 0; }
  }
  if (row.length) rows.push({ items: row, h: Math.min(target, (W - gap * (row.length - 1)) / sum), full: false });
  let k = 0;
  grid.innerHTML = rows.map((r) => `<div class="idx-row" style="height:${r.h.toFixed(1)}px">${r.items.map((p) => {
    const ar = p.width / p.height;
    const style = r.full ? `flex:${ar.toFixed(4)} 1 0` : `width:${(ar * r.h).toFixed(1)}px;flex:none`;
    return `<button class="idx-tile" data-pick="${esc(p.id)}" style="${style};--i:${Math.min(k++, 30)}" aria-label="${esc(titleOf(p))}"><img src="${esc(p.thumb)}" alt="" loading="lazy" decoding="async"/><span class="lbl"><b>${esc(titleOf(p))}</b><span>${esc(tombo(p))}</span></span></button>`;
  }).join("")}</div>`).join("") || `<p style="color:var(--ink-2)">Nada nesta seleção.</p>`;
}

/* ---------------------------------------------------------------- Mapa */
function renderMapLayer(focusId, fresh) {
  const el = $("#layer-map");
  const mapped = allPhotos().filter(hasPos);
  if (fresh || !S.map) {
    el.innerHTML = `<div class="map-canvas" id="map-canvas"></div>
      <div class="map-hud"><h2>Onde foi feita</h2><p>${mapped.length} ${mapped.length === 1 ? "fotografia marcada" : "fotografias marcadas"} em Leonida</p>
        <div class="map-segs">
        ${window.LeonidaMap?.official ? `<div class="seg" role="group" aria-label="Cor do mapa"><button data-mapcolor="0" aria-pressed="${!S.mapColor}">P&amp;B</button><button data-mapcolor="1" aria-pressed="${S.mapColor}">Cor</button></div>` : ""}
        ${window.LeonidaMap?.hasStyles === false ? "" : `<div class="seg" role="group" aria-label="Estilo do mapa"><button data-mapstyle="night" aria-pressed="${S.mapStyle === "night"}">Noite</button><button data-mapstyle="day" aria-pressed="${S.mapStyle === "day"}">Dia</button></div>`}
        ${mapped.length > 1 && window.L?.heatLayer ? `<div class="seg" role="group" aria-label="Modo do mapa"><button data-mapmode="pins" aria-pressed="${S.mapMode !== "heat"}">Fotos</button><button data-mapmode="heat" aria-pressed="${S.mapMode === "heat"}">Calor</button></div>` : ""}</div></div>
      ${mapped.length ? "" : `<div class="map-empty"><div><b>Mapa em branco</b>Marque o ponto das fotos no Estúdio para elas aparecerem aqui.</div></div>`}
      <div id="map-card-slot"></div>`;
    el.classList.toggle("is-day", MAP_LIGHT());
    if (!window.L || !window.LeonidaMap) return;
    const map = window.LeonidaMap.create($("#map-canvas"), { style: S.mapStyle });
    S.map = map; S.markers = new Map();
    // Pinos próximos viram uma pilha de fotos com contador (Leaflet.markercluster); clicar abre/aproxima.
    const byId = (m) => S.byId.get(m.options.photoId);
    // A pilha fica sobre uma foto de verdade (a mais próxima do centro do grupo), não na média das fotos —
    // senão, com a névoa, a pilha podia cair numa área escura sem foto.
    const MC = L.MarkerCluster?.prototype;
    if (MC && !MC._lfnSnap) {
      const orig = MC._recalculateBounds;
      MC._recalculateBounds = function () {
        orig.call(this);
        const c = this._wLatLng; if (!c || !this._childCount) return;
        let best = null, bd = Infinity;
        for (const m of this.getAllChildMarkers()) { const d = (m._latlng.lat - c.lat) ** 2 + (m._latlng.lng - c.lng) ** 2; if (d < bd) { bd = d; best = m._latlng; } }
        if (best) this._latlng = best;
      };
      MC._lfnSnap = true;
    }
    S.cluster = L.markerClusterGroup ? L.markerClusterGroup({
      showCoverageOnHover: false, spiderfyOnMaxZoom: true, maxClusterRadius: 52, spiderfyDistanceMultiplier: 1.6,
      iconCreateFunction: (c) => {
        const kids = c.getAllChildMarkers().map(byId).filter(Boolean).sort((a, b) => String(b.taken_on || "").localeCompare(String(a.taken_on || "")));
        const n = kids.length, top = kids[0];
        return L.divIcon({ className: "map-stack", iconSize: [58, 58], iconAnchor: [29, 29],
          html: `<span class="s s2"></span><span class="s s1"></span><span class="s s0" style="background-image:url('${esc(top?.thumb || "")}')"></span><b>${n}</b>` });
      },
    }) : null;
    const layer = S.cluster || map;
    mapped.forEach((p, i) => {
      const icon = L.divIcon({ className: "map-pin", iconSize: [46, 46], iconAnchor: [23, 23], html: `<span style="background-image:url('${esc(p.thumb)}');--i:${Math.min(i, 20)}"></span>` });
      const m = L.marker(window.LeonidaMap.toLatLng(p.map_x, p.map_y), { icon, title: titleOf(p), keyboard: true, riseOnHover: true, photoId: p.id }).addTo(layer);
      m.on("click", () => focusPin(p.id, true));
      S.markers.set(p.id, m);
      if (!MONO_UI) analyze(p).then((c) => m.getElement()?.style.setProperty("--pc", c.c2));
    });
    if (S.cluster) map.addLayer(S.cluster);
    // Mapa de calor: onde mais se fotografa (Leaflet.heat). Alterna com os pinos.
    S.heat = L.heatLayer && mapped.length > 1 ? L.heatLayer(mapped.map((p) => [...window.LeonidaMap.toLatLng(p.map_x, p.map_y), 1]),
      { radius: 40, blur: 28, maxZoom: 1, max: 2.5, minOpacity: .4,   // cores fortes já na visão geral; só os lugares mais fotografados chegam ao branco
        // paleta de câmera térmica: a única cor do mapa (o resto é preto e branco), para o calor saltar aos olhos
        gradient: { .15: "#1b1464", .35: "#5b2a9e", .55: "#d6336c", .75: "#ff7a1a", .9: "#ffd43b", 1: "#fffbe6" } }) : null;
    setMapMode(S.mapMode || "pins");
    loadMod("fog").then((m) => { if (S.map === map && m.addFog) S.fog = m.addFog(map, mapped, modCtx()); });
    if (mapped.length > 1) map.fitBounds(L.latLngBounds(mapped.map((p) => window.LeonidaMap.toLatLng(p.map_x, p.map_y))).pad(.5), { maxZoom: 3.25 });
    else if (mapped.length === 1) map.setView(window.LeonidaMap.toLatLng(mapped[0].map_x, mapped[0].map_y), 3);
    setTimeout(() => map.invalidateSize(), 50);
  }
  const f = focusId && S.byId.get(focusId);
  if (f && hasPos(f)) setTimeout(() => focusPin(f.id, true), 120);
}
function setMapMode(mode) {
  S.mapMode = mode === "heat" && S.heat ? "heat" : "pins";
  const pins = S.cluster || null, heat = S.heat, map = S.map;
  if (!map) return;
  if (S.mapMode === "heat") { if (pins) map.removeLayer(pins); else S.markers.forEach((m) => map.removeLayer(m)); heat.addTo(map); }
  else { if (heat && map.hasLayer(heat)) map.removeLayer(heat); if (pins) { if (!map.hasLayer(pins)) map.addLayer(pins); } else S.markers.forEach((m) => m.addTo(map)); }
  $("#layer-map")?.classList.toggle("is-heat", S.mapMode === "heat");
  $$("[data-mapmode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mapmode === S.mapMode)));
}
function focusPin(id, pan) {
  const p = S.byId.get(id);
  if (!p || !S.map) return;
  if (S.mapMode === "heat") setMapMode("pins");
  const mk = S.markers.get(id);
  // Pino dentro de uma pilha: abre a pilha até o pino aparecer, depois destaca.
  if (pan && S.cluster && mk && !mk.getElement()) { S.cluster.zoomToShowLayer(mk, () => focusPin(id, false)); return; }
  S.markers.forEach((m, k) => m.getElement()?.classList.toggle("is-hot", k === id));
  if (pan) S.map.flyTo(window.LeonidaMap.toLatLng(p.map_x, p.map_y), Math.max(S.map.getZoom(), 3.5), { duration: REDUCE ? 0 : .9 });
  paint(p);
  const chips = [p.location && chip("pin", p.location), p.game_time && chip("clock", p.game_time, "no jogo"), p.weather && chip("cloud", p.weather)].filter(Boolean).join("");
  $("#map-card-slot").innerHTML = `<div class="map-card${REDUCE ? "" : " is-in"}">
    <img src="${esc(p.preview)}" alt="${esc(p.title || "")}" data-act="map-zoom" data-id="${esc(p.id)}"/>
    <div class="body"><div class="tombo">${esc(tombo(p))}</div><h3>${esc(titleOf(p))}</h3><div class="chips">${chips}</div>${p.caption ? `<p class="note">${esc(p.caption)}</p>` : ""}
    <div style="display:flex;gap:8px"><a class="btn btn-hot" href="#/foto/${esc(p.id)}">${svg("play")}Projetar</a><button class="btn" data-act="map-zoom" data-id="${esc(p.id)}">${svg("zoom")}Ampliar</button></div></div></div>`;
  if (location.hash !== `#/mapa/${id}`) history.replaceState(null, "", `#/mapa/${id}`);
}

/* ================================================================ TRILHA CONTEMPLATIVA (gerada ao vivo, sem arquivos) */
// Pads lentos (acordes que se transformam), notas esparsas de "piano distante" e um leve vento.
// Tudo é sintetizado com Web Audio: original, leve e sem direitos autorais de terceiros.
const Ambient = (() => {
  let ctx = null, master = null, verb = null, dry = null, timers = [], playing = false, vol = 0.55, chordIdx = 0, noiseSrc = null;
  const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
  // A menor, contemplativo: Am9 → Fmaj7 → Cmaj7/G → Em7 → Dm9 → Fmaj7#11
  const CHORDS = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 67], [55, 60, 64, 67, 71], [52, 55, 59, 62, 67], [50, 57, 60, 64, 65], [53, 57, 59, 64, 69]];
  const PENTA = [69, 72, 74, 76, 79, 81, 84, 86, 88];
  function impulse(seconds = 5.5) {
    const rate = ctx.sampleRate, len = rate * seconds, buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }
  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    verb = ctx.createConvolver(); verb.buffer = impulse();
    const wet = ctx.createGain(); wet.gain.value = 0.85; verb.connect(wet).connect(master);
    dry = ctx.createGain(); dry.gain.value = 0.35; dry.connect(master);
  }
  function voice(freq, t0, dur, { type = "triangle", gain = 0.05, cutoff = 1100, detune = 6, attack = 3.2, release = 4.5 } = {}) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = cutoff; f.Q.value = 0.4;
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.value = 0.05 + Math.random() * 0.08; lfoG.gain.value = cutoff * 0.35;
    lfo.connect(lfoG).connect(f.frequency);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.setValueAtTime(gain, t0 + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    f.connect(g); g.connect(verb); g.connect(dry);
    const oscs = [-detune, detune].map((dt) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = dt; o.connect(f); o.start(t0); o.stop(t0 + dur + 0.1); return o; });
    lfo.start(t0); lfo.stop(t0 + dur + 0.1);
    return oscs;
  }
  function padLoop() {
    if (!playing) return;
    const t = ctx.currentTime + 0.05, dur = 13;
    const chord = CHORDS[chordIdx % CHORDS.length]; chordIdx++;
    chord.forEach((n, i) => voice(NOTE(n - 12), t + i * 0.18, dur, { gain: 0.034, cutoff: 700 + i * 120 }));
    voice(NOTE(chord[0] - 24), t, dur, { type: "sine", gain: 0.05, cutoff: 400, detune: 2 });
    timers.push(setTimeout(padLoop, (dur - 4.5) * 1000));
  }
  function bellLoop() {
    if (!playing) return;
    if (Math.random() < 0.62) {
      const t = ctx.currentTime + 0.05, n = PENTA[Math.floor(Math.random() * PENTA.length)];
      voice(NOTE(n), t, 3.6, { type: "sine", gain: 0.022 + Math.random() * 0.018, cutoff: 3200, detune: 1, attack: 0.012, release: 3.5 });
      if (Math.random() < 0.3) voice(NOTE(n + 7), t + 0.28, 3.2, { type: "sine", gain: 0.012, cutoff: 3000, detune: 1, attack: 0.012, release: 3 });
    }
    timers.push(setTimeout(bellLoop, 1800 + Math.random() * 4200));
  }
  function wind() {
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
    noiseSrc = ctx.createBufferSource(); noiseSrc.buffer = buf; noiseSrc.loop = true;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 500; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.05;
    noiseSrc.connect(f).connect(g).connect(master); noiseSrc.start();
  }
  return {
    get playing() { return playing; },
    get volume() { return vol; },
    async start() {
      if (playing) return;
      if (!ctx) build();
      if (ctx.state === "suspended") await ctx.resume();
      playing = true;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(vol, ctx.currentTime + 3.5);
      padLoop(); timers.push(setTimeout(bellLoop, 2600)); wind();
    },
    stop() {
      if (!ctx || !playing) return;
      playing = false;
      timers.forEach(clearTimeout); timers = [];
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.6);
      setTimeout(() => { try { noiseSrc?.stop(); } catch { /* já parou */ } if (!playing) ctx.suspend(); }, 1800);
    },
    setVolume(v) {
      vol = Math.max(0, Math.min(1, v));
      if (ctx && playing) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(vol, ctx.currentTime, 0.2); }
    },
  };
})();

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
};
function paintSound() {
  const b = $("#btn-sound");
  if (!b) return;
  const on = Ambient.playing;
  b.setAttribute("aria-pressed", String(on));
  b.title = on ? "Som ligado (S para desligar)" : "Som desligado (S para ligar)";
  b.classList.toggle("is-on", on);
}
async function setSound(on, remember = true) {
  if (remember) store.set("lfn-audio", on ? "on" : "off");
  if (on) { try { await Ambient.start(); } catch { /* navegador bloqueou */ } } else Ambient.stop();
  paintSound();
}
function initSound() {
  const vol = parseFloat(store.get("lfn-audio-vol"));
  if (!Number.isNaN(vol)) Ambient.setVolume(vol);
  const range = $("#sound-vol");
  if (range) {
    range.value = String(Math.round(Ambient.volume * 100));
    range.addEventListener("input", () => { Ambient.setVolume(range.value / 100); store.set("lfn-audio-vol", String(range.value / 100)); if (!Ambient.playing && range.value > 0) setSound(true); });
  }
  $("#btn-sound")?.addEventListener("click", () => setSound(!Ambient.playing));
  const pref = store.get("lfn-audio");
  if (pref === "on") {
    // o navegador exige um gesto: começa no primeiro clique/tecla
    const go = () => { setSound(true, false); removeEventListener("pointerdown", go); removeEventListener("keydown", go); };
    addEventListener("pointerdown", go, { once: true }); addEventListener("keydown", go, { once: true });
    $("#btn-sound")?.classList.add("is-armed");
  } else if (pref !== "off") {
    setTimeout(() => { const a = $("#audio-ask"); if (a) { a.hidden = false; requestAnimationFrame(() => a.classList.add("is-in")); } }, 1600);
  }
  $("#audio-yes")?.addEventListener("click", () => { $("#audio-ask").hidden = true; setSound(true); });
  $("#audio-no")?.addEventListener("click", () => { $("#audio-ask").hidden = true; setSound(false); });
  paintSound();
}

/* ---------------------------------------------------------------- JORNADA: desde o início, mês a mês */
const MONTHS_FULL = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const monthKey = (p) => (p.taken_on || "0000-00").slice(0, 7);
const monthName = (k) => { const [y, m] = k.split("-"); return `${MONTHS_FULL[Number(m) - 1] || "sem data"} de ${y}`; };
function dayNum(d) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null; }
function journeyDay(p) { const first = journeyPhotos()[0]; const a = dayNum(first?.taken_on), b = dayNum(p.taken_on); return a != null && b != null ? b - a + 1 : 1; }
function journeyMonths() {
  const out = [];
  for (const p of journeyPhotos()) { const k = monthKey(p); if (!out.length || out[out.length - 1].key !== k) out.push({ key: k, photos: [] }); out[out.length - 1].photos.push(p); }
  return out;
}
let lastChapter = null;
function journeyChapter(p) {
  const k = monthKey(p);
  if (k === lastChapter) return;
  const first = lastChapter === null;
  lastChapter = k;
  const months = journeyMonths(), i = months.findIndex((m) => m.key === k);
  const el = $("#intertitle");
  if (REDUCE || !el) return;
  el.innerHTML = `<div><div class="n">${first ? "Jornada · desde o início" : `Capítulo ${pad2(i + 1)}`}</div><h2>${esc(monthName(k))}</h2><p>${months[i].photos.length} ${months[i].photos.length === 1 ? "fotografia" : "fotografias"} neste mês</p></div>`;
  el.hidden = false; el.classList.remove("is-in"); void el.offsetWidth; el.classList.add("is-in");
  setTimeout(() => { el.hidden = true; }, 2650);
}
function renderJourneyLayer() {
  const el = $("#layer-journey");
  const all = journeyPhotos();
  if (!all.length) { el.innerHTML = `<div class="jr-head"><h2>Jornada</h2><p>Sua jornada começa na primeira foto.</p></div>`; return; }
  const months = journeyMonths(), first = all[0], last = all[all.length - 1];
  const days = (dayNum(last.taken_on) ?? 0) - (dayNum(first.taken_on) ?? 0) + 1;
  el.innerHTML = `<div class="jr-head">
      <div><span class="jr-kicker">Jornada · ${esc(S.profile.studio_name || "arquivo")}</span>
      <h2>Desde o início</h2>
      <p>Primeira fotografia em ${esc(dateBR(first.taken_on))}. ${all.length} ${all.length === 1 ? "registro" : "registros"} em ${days} ${days === 1 ? "dia" : "dias"} de arquivo, ${months.length} ${months.length === 1 ? "capítulo" : "capítulos"}.</p></div>
      <a class="btn btn-hot jr-play" href="#/desde/${esc(first.id)}">${svg("play")}Projetar desde o início</a></div>
    <ol class="jr-list">${months.map((m, i) => `<li class="jr-month" style="--i:${i}">
      <div class="jr-meta"><span class="jr-ch">Capítulo ${pad2(i + 1)}</span><b>${esc(monthName(m.key))}</b><span>${m.photos.length} ${m.photos.length === 1 ? "foto" : "fotos"} · dia ${journeyDay(m.photos[0])}</span>
        <a class="jr-go" href="#/desde/${esc(m.photos[0].id)}">projetar →</a></div>
      <div class="jr-strip">${m.photos.slice(0, 18).map((p) => `<a class="jr-frame" href="#/desde/${esc(p.id)}" title="${esc(titleOf(p))}"><img src="${esc(p.thumb)}" alt="" loading="lazy" decoding="async"/><span>${esc(dateBR(p.taken_on).replace(/ \d{4}$/, ""))}</span></a>`).join("")}${m.photos.length > 18 ? `<a class="jr-more" href="#/desde/${esc(m.photos[18].id)}">+${m.photos.length - 18}</a>` : ""}</div>
    </li>`).join("")}</ol>`;
}

/* ---------------------------------------------------------------- intertítulo */
function intertitle(essayId) {
  const e = S.essayById.get(essayId), el = $("#intertitle");
  if (!e || REDUCE) return;
  el.innerHTML = `<div><div class="n">${esc(S.serie.get(essayId))}</div><h2>${esc(e.title)}</h2>${e.description ? `<p>${esc(e.description.split("\n")[0])}</p>` : ""}</div>`;
  el.hidden = false; el.classList.remove("is-in"); void el.offsetWidth; el.classList.add("is-in");
  setTimeout(() => { el.hidden = true; }, 2650);
}

/* ================================================================ rotas */
function parse() {
  const [a, b, c] = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (a === "ensaios") return { view: "essays" };
  if (a === "indice") return { view: "index" };
  if (a === "mapa") return { view: "map", id: b };
  if (a === "ensaio" && b) return c ? { view: "proj", set: { kind: "essay", id: b }, id: c } : { view: "essay", id: b };
  if (a === "favoritas") return { view: "proj", set: { kind: "fav", id: null }, id: b };
  if (a === "jornada") return { view: "journey" };
  if (a === "jogo") return { view: "game" };
  if (a === "desde") return { view: "proj", set: { kind: "journey", id: null }, id: b };
  if (a === "foto" && b) return { view: "proj", id: b };
  return { view: "proj" };
}
function setNav(view) {
  $$(".nav-link[data-view]").forEach((a) => a.classList.toggle("is-active", a.dataset.view === view));
}
function useSet(set) {
  const same = S.set.kind === set.kind && S.set.id === set.id;
  if (!same) lastChapter = null;
  if (!same || !S.list.length) {
    S.set = set; S.list = listFor(set);
    if (!S.list.length && set.kind !== "all") { S.set = { kind: "all", id: null }; S.list = listFor(S.set); }
    buildReel(); renderSetline();
    return true;
  }
  return false;
}
function route() {
  if (S.viewer) { S.viewer.pswp?.close(); }
  const r = parse();
  if (!S.photos.length) { setNav(r.view); return; }
  if (r.view !== "proj") {
    setNav(r.view === "essay" ? "essays" : r.view); S.view = r.view;
    openLayer(r.view, r.id);
    return;
  }
  const leavingLayer = closeLayers();
  S.view = "proj";
  setNav(r.set?.kind === "essay" ? "essays" : r.set?.kind === "journey" ? "journey" : "proj");
  let set = r.set || { kind: "all", id: null };
  if (!r.set && r.id && S.set.kind !== "all" && S.list.some((p) => p.id === r.id)) set = S.set;   // foto dentro da série atual
  const changed = useSet(set);
  let idx = r.id ? S.list.findIndex((p) => p.id === r.id) : (changed ? 0 : S.index);
  if (idx < 0) idx = 0;
  const gated = set.kind === "essay" && S.list[idx] && !seal.isOpen(S.list[idx].id);
  if (changed && set.kind === "essay" && !gated && !S.skipIntertitle) intertitle(set.id);
  S.skipIntertitle = false;
  if (changed || leavingLayer || idx !== S.index || !$("#shots .shot")) show(idx, idx >= S.index ? 1 : -1);
  wake();
}

/* ================================================================ eventos */
document.addEventListener("click", (e) => {
  const t = e.target;
  const go = t.closest("[data-go]"); if (go) { const i = Number(go.dataset.go); show(i, i >= S.index ? 1 : -1); return; }
  const act = t.closest("[data-act]");
  if (act) {
    const a = act.dataset.act;
    if (a === "zoom") openZoom();
    if (a === "exit-set") location.hash = "#/";
    if (a === "map-zoom") { const list = allPhotos().filter(hasPos); openZoom(list, Math.max(0, list.findIndex((p) => p.id === act.dataset.id)), () => {}); }
    return;
  }
  const ess = t.closest("[data-essay]"); if (ess) { location.hash = `#/ensaio/${ess.dataset.essay}`; return; }
  const pick = t.closest("[data-pick]");
  if (pick) {
    const f = S.idxFilter;
    location.hash = f !== "all" && f !== "fav" ? `#/ensaio/${f}/${pick.dataset.pick}` : f === "fav" ? `#/favoritas/${pick.dataset.pick}` : `#/foto/${pick.dataset.pick}`;
    return;
  }
  const idx = t.closest("[data-idx]"); if (idx) { S.idxFilter = idx.dataset.idx; renderIndexLayer(); return; }
  const mm = t.closest("[data-mapmode]"); if (mm && S.map) { setMapMode(mm.dataset.mapmode); return; }
  const mc = t.closest("[data-mapcolor]"); if (mc) { setMapColor(mc.dataset.mapcolor === "1"); return; }
  const ms = t.closest("[data-mapstyle]");
  if (ms && S.map) {
    S.mapStyle = S.map.leonidaStyle(ms.dataset.mapstyle);
    $("#layer-map").classList.toggle("is-day", MAP_LIGHT());
    $$("[data-mapstyle]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mapstyle === S.mapStyle)));
  }
});
document.addEventListener("mouseover", (e) => { const ess = e.target.closest?.(".ess-item"); if (ess && !ess.classList.contains("is-hot")) hotEssay(ess.dataset.essay); });
$("#zone-prev").addEventListener("click", prev);
$("#zone-next").addEventListener("click", next);
$("#zone-open").addEventListener("click", () => openZoom());
// As 3 zonas são áreas invisíveis do tamanho da tela: clicar nelas não deve dar foco, senão a próxima
// tecla (Esc, setas) faz o Chrome desenhar o contorno de foco como um retângulo branco gigante.
$$(".zone").forEach((z) => { z.tabIndex = -1; z.addEventListener("mousedown", (e) => e.preventDefault()); });
$("#btn-play").addEventListener("click", () => setPlaying(!S.playing));
$("#btn-fs").addEventListener("click", toggleFullscreen);
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

let wheelAcc = 0, wheelLock = 0;
$("#stage").addEventListener("wheel", (e) => {
  if (S.layer || S.viewer) return;
  e.preventDefault();
  wheelAcc += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
  const now = performance.now();
  if (now < wheelLock || Math.abs(wheelAcc) < 40) return;
  wheelAcc > 0 ? next() : prev();
  wheelAcc = 0; wheelLock = now + 750;
}, { passive: false });

document.addEventListener("keydown", (e) => {
  if (S.viewer || e.ctrlKey || e.metaKey || e.altKey) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  const k = e.key;
  if (k === "Escape") { if (S.layer) { e.preventDefault(); location.hash = S.layer === "essay" ? "#/ensaios" : "#/"; } else document.body.classList.remove("is-pure"); return; }
  if (S.layer === "game") return;   // no jogo, só Esc sai; o módulo cuida de Enter/Espaço
  if (k.toLowerCase() === "g") { location.hash = S.layer === "index" ? "#/" : "#/indice"; return; }
  if (k.toLowerCase() === "m") { const cur = S.list[S.index]; location.hash = S.layer === "map" ? "#/" : (cur && hasPos(cur) ? `#/mapa/${cur.id}` : "#/mapa"); return; }
  if (k.toLowerCase() === "e") { location.hash = S.layer === "essays" ? "#/" : "#/ensaios"; return; }
  if (k.toLowerCase() === "f") { toggleFullscreen(); return; }
  if (k.toLowerCase() === "s") { setSound(!Ambient.playing); return; }
  if (k.toLowerCase() === "j") { location.hash = S.layer === "journey" ? "#/" : "#/jornada"; return; }
  if (S.layer) return;
  wake();
  if (["ArrowRight", "ArrowDown", "PageDown"].includes(k)) { e.preventDefault(); next(); }
  else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(k)) { e.preventDefault(); prev(); }
  else if (k === " ") { e.preventDefault(); setPlaying(!S.playing); }
  else if (k === "Enter" || k.toLowerCase() === "z") { e.preventDefault(); openZoom(); }
  else if (k.toLowerCase() === "i") document.body.classList.toggle("is-pure");
  else if (k === "Home") show(0, -1);
  else if (k === "End") show(S.list.length - 1, 1);
});
["mousemove", "mousedown", "touchstart"].forEach((ev) => document.addEventListener(ev, wake, { passive: true }));
let rz = null;
addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (S.layer === "index") drawIndexGrid(); markReel(); }, 150); });
addEventListener("hashchange", route);

/* ================================================================ celular: ficha rolável + deslizar */
const SHEET_PARTS = ["#setline", "#caption", "#epigraph", "#fieldcard"];
function mobileLayout() {
  const on = isM();
  document.body.classList.toggle("is-m", on);
  let sheet = $("#m-sheet");
  if (on && !sheet) {
    sheet = document.createElement("section");
    sheet.id = "m-sheet"; sheet.className = "m-sheet ui"; sheet.setAttribute("aria-label", "Ficha da fotografia");
    $("#reel").before(sheet);
    sheet.insertAdjacentHTML("beforeend", `<div class="m-pager" id="m-pager">
      <button class="m-step" data-mstep="-1" aria-label="Foto anterior">←</button>
      <span class="m-count" id="m-count" aria-live="polite"></span>
      <i class="m-track" aria-hidden="true"><b id="m-bar"></b></i>
      <button class="m-step" data-mstep="1" aria-label="Próxima foto">→</button></div>`);
    SHEET_PARTS.forEach((sel) => sheet.appendChild($(sel)));
    if (S.list.length) renderGhost();
    document.body.classList.remove("is-idle");
  } else if (!on && sheet) {
    SHEET_PARTS.forEach((sel) => sheet.before($(sel)));
    sheet.remove();
  }
  if (!on) sizeFrame(null);
}
document.addEventListener("click", (e) => {
  const st = e.target.closest?.("[data-mstep]"); if (st) { Number(st.dataset.mstep) > 0 ? next() : prev(); return; }
  const mf = e.target.closest?.(".pz-manifesto"); if (mf && isM()) mf.classList.toggle("is-open");
});
PORTRAIT_M.addEventListener?.("change", () => sizeFrame(S.list[S.index]));
MOBILE.addEventListener?.("change", () => {
  mobileLayout();
  if (S.layer === "index") drawIndexGrid();
  if (!S.layer && S.list[S.index]) show(S.index, 1, { silent: true, unsealed: true });
});
let touch = null;
document.addEventListener("touchstart", (e) => {
  touch = null;
  if (!isM() || S.layer || S.viewer || e.touches.length !== 1) return;
  if (e.target.closest?.(".topbar, .preroll, .audio-ask, .intertitle, .pswp")) return;
  const t = e.touches[0];
  touch = { x: t.clientX, y: t.clientY, t: performance.now(), axis: null };
}, { passive: true });
document.addEventListener("touchmove", (e) => {
  if (!touch) return;
  const t = e.touches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  if (!touch.axis && Math.hypot(dx, dy) > 10) touch.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
  if (touch.axis !== "x" || REDUCE) return;
  const sh = $("#shots"); sh.classList.add("is-dragging"); sh.style.setProperty("--drag", `${dx * .35}px`);
}, { passive: true });
function endTouch(e) {
  if (!touch) return;
  const t = e.changedTouches?.[0], tc = touch; touch = null;
  const sh = $("#shots"); sh.classList.remove("is-dragging"); sh.style.removeProperty("--drag");
  if (!t || tc.axis !== "x") return;
  const dx = t.clientX - tc.x, dy = t.clientY - tc.y, dt = performance.now() - tc.t;
  if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.3 && dt < 1000) { navigator.vibrate?.(8); dx < 0 ? next() : prev(); }
}
document.addEventListener("touchend", endTouch, { passive: true });
document.addEventListener("touchcancel", endTouch, { passive: true });
mobileLayout();

/* ================================================================ abertura */
function showHint() {
  try { if (sessionStorage.getItem("lfn-hint")) return; sessionStorage.setItem("lfn-hint", "1"); } catch { /* sem armazenamento */ }
  const h = $("#hint");
  h.innerHTML = isM() ? "← deslize · toque para ampliar →" : `<kbd>←</kbd><kbd>→</kbd> navegar · <kbd>Espaço</kbd> reproduzir · <kbd>Enter</kbd> ampliar · <kbd>G</kbd> índice · <kbd>M</kbd> mapa`;
  h.hidden = false; setTimeout(() => { h.hidden = true; }, 5200);
}

await load();
$("#brand-name").textContent = S.profile.studio_name || "Leonida Field Notes";
$("#brand-sub").textContent = "Leonida · projeção";
if (!S.photos.length) {
  $("#stage").insertAdjacentHTML("beforeend", `<div class="empty-stage"><div><h1>Em breve</h1><p>${PUBLIC ? "As primeiras fotografias de Leonida aparecem aqui assim que forem publicadas." : "Importe capturas no Estúdio para abrir a projeção."}</p></div></div>`);
  $$(".caption, .reel, .ghost-num, .setline, .zone").forEach((el) => { el.hidden = true; });
}
route();
initSound();
requestAnimationFrame(() => document.body.classList.remove("is-booting"));
if (S.photos.length) showHint();
