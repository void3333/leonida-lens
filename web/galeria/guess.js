// Leonida · "ONDE FOI FEITA?" — jogo no estilo GeoGuessr.
// Contrato com app.js: mount(el, ctx) ao abrir #/jogo, unmount() ao sair (app.js esvazia o el).
// Uma rodada = até 5 fotos com pino. Marque no mapa, confirme, veja a distância e os pontos.

const ROUND = 5;            // fotos por rodada
const MAX = 5000;           // pontos por foto
const SCALE = 45;           // unidades de mapa: 45 u de erro ≈ 37% dos pontos (a terra tem ~450 u de largura)
const GRACE = 1.5;          // erro até aqui vale pontuação cheia
const PERFECT = 4500;       // "perfeito!"
const STREAK = 3500;        // sequência: fotos seguidas acima disso
const M_PER_UNIT = 25;      // escala aproximada só para exibir a distância (1 u ≈ 25 m)
const KEY = "lfn-guess-best";

const RANKS = [             // fração do máximo → título
  [0.94, "Cartógrafo de Leonida"],
  [0.80, "Fotógrafo de campo"],
  [0.60, "Guia local"],
  [0.40, "Motorista de aplicativo"],
  [0.20, "Passageiro de ônibus"],
  [0, "Turista perdido"],
];
const VERDICTS = [[PERFECT, "Na mosca!"], [STREAK, "Muito perto"], [2000, "Quase lá"], [800, "Mesma região"], [1, "Longe…"], [0, "Outro mundo"]];

let G = null;               // estado do jogo montado
let lastIds = [];           // evita repetir as fotos da rodada anterior (enquanto a página estiver aberta)

const fmt = (n) => Math.round(n).toLocaleString("pt-BR");
export const score = (d) => (d <= GRACE ? MAX : Math.round(MAX * Math.exp(-(d - GRACE) / SCALE)));
const distLabel = (d) => { const m = d * M_PER_UNIT; return m < 1000 ? `≈ ${Math.max(5, Math.round(m / 5) * 5)} m` : `≈ ${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`; };
const rankOf = (total, max) => RANKS.find(([f]) => total >= f * max)[1];
const verdictOf = (pts) => VERDICTS.find(([v]) => pts >= v)[1];

function readBest() { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } }
function writeBest(v) { try { localStorage.setItem(KEY, String(v)); } catch { /* sem armazenamento: tudo bem */ } }

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ================================================================ ciclo de vida */
export function mount(el, ctx) {
  unmount();
  const pool = ctx.photos.filter(ctx.hasPos);
  G = { el, ctx, pool, timers: new Set(), rafs: new Set(), off: [], map: null, layers: null, phase: "intro",
    round: [], idx: 0, results: [], total: 0, streak: 0, guess: null, guessMk: null, busy: false };
  el.classList.add("gs-host");
  if (pool.length < 2) { renderEmpty(); return; }
  renderShell();
  newRound();
  setPhase("intro");
  renderIntro();
}

export function unmount() {
  if (!G) return;
  G.timers.forEach(clearTimeout); G.rafs.forEach(cancelAnimationFrame);
  G.off.forEach((f) => { try { f(); } catch { /* */ } });
  try { G.map?.remove(); } catch { /* */ }
  G.el.classList.remove("gs-host");
  G = null;
}

const later = (fn, ms) => { const g = G; const t = setTimeout(() => { g.timers.delete(t); if (G === g) fn(); }, ms); g.timers.add(t); return t; };
const on = (target, ev, fn, opts) => { target.addEventListener(ev, fn, opts); G.off.push(() => target.removeEventListener(ev, fn, opts)); };
const $ = (s) => G.el.querySelector(s);

/* ================================================================ telas */
function renderEmpty() {
  G.el.innerHTML = `<div class="gs gs-empty" data-phase="empty"><div class="gs-card">
    <small class="gs-kick">&gt; jogo</small>
    <h2>Onde foi feita?</h2>
    <p>Este jogo precisa de pelo menos duas fotos marcadas no mapa — e por enquanto ${G.pool.length === 1 ? "só uma tem pino" : "nenhuma tem pino"}.</p>
    <p class="gs-dim">Volte quando o fotógrafo tiver marcado mais lugares.</p>
    <a class="btn btn-hot" href="#/">Voltar à projeção</a>
  </div></div>`;
}

function renderShell() {
  const { ctx } = G;
  const dots = Array.from({ length: Math.min(ROUND, G.pool.length) }, (_, i) => `<i data-i="${i}"></i>`).join("");
  G.el.innerHTML = `<div class="gs${ctx.MONO ? " gs-mono" : ""}${ctx.LeonidaMap?.official ? " gs-light" : ""}" data-phase="intro">
    <div class="gs-photo">
      <img class="gs-bg" alt="" aria-hidden="true"/>
      <div class="gs-frame"><img class="gs-img" alt="Foto misteriosa: onde ela foi feita?" data-gs="expand"/></div>
      <div class="gs-hud">
        <span class="gs-kick">&gt; onde foi feita?</span>
        <span class="gs-dots" aria-hidden="true">${dots}</span>
        <span class="gs-n" aria-live="polite"></span>
      </div>
      <div class="gs-score"><small>pontos</small><b class="gs-total">0</b></div>
      <button class="gs-expand" data-gs="expand" aria-label="Ampliar foto" title="Ampliar foto">${ctx.svg("expand")}</button>
      <div class="gs-stamp" aria-hidden="true"></div>
    </div>
    <div class="gs-side">
      <div class="gs-mapwrap"><div class="gs-map"></div><div class="gs-tip" aria-hidden="true"><span>${ctx.isMobile() ? "toque" : "clique"} no mapa para marcar seu palpite</span></div></div>
      <div class="gs-panel">
        <div class="gs-info" aria-live="polite"></div>
        <button class="btn btn-hot gs-go" data-gs="go" disabled><span class="gs-go-l">Confirmar</span><kbd>enter</kbd></button>
      </div>
    </div>
    <div class="gs-over" hidden></div>
  </div>`;

  on(G.el, "click", onClick);
  on(document, "keydown", onKey);
  initMap();
}

function renderIntro() {
  const best = readBest();
  const n = G.round.length;
  overlay(`<div class="gs-card gs-intro">
    <small class="gs-kick">&gt; jogo</small>
    <h2>Onde foi feita?</h2>
    <p>${n} fotos de Leonida. Marque no mapa onde cada uma foi feita — quanto mais perto, mais pontos.</p>
    <ul class="gs-rules">
      <li><b>${fmt(MAX)}</b> pts por foto</li>
      <li><b>${fmt(MAX * n)}</b> pts no total</li>
      <li class="gs-kbd-only"><kbd>enter</kbd> confirma e avança</li>
    </ul>
    ${best ? `<p class="gs-best">seu recorde: <b>${fmt(best)}</b></p>` : ""}
    <button class="btn btn-hot gs-big" data-gs="start">Começar <kbd>enter</kbd></button>
  </div>`);
}

function overlay(html) {
  const o = $(".gs-over");
  if (!html) { o.hidden = true; o.innerHTML = ""; return; }
  o.innerHTML = html; o.hidden = false;
  if (!G.ctx.REDUCE) { o.classList.remove("is-in"); void o.offsetWidth; o.classList.add("is-in"); }
  o.querySelector("[data-gs=start],[data-gs=again]")?.focus({ preventScroll: true });
}

function setPhase(ph) {
  G.phase = ph;
  $(".gs").dataset.phase = ph;
  const go = $(".gs-go");
  const label = { guess: "Confirmar", reveal: G.idx + 1 >= G.round.length ? "Ver resultado" : "Próxima foto" }[ph];
  if (label) go.querySelector(".gs-go-l").textContent = label;
  go.disabled = ph === "guess" ? !G.guess : ph !== "reveal";
  // o mapa encolhe/cresce no celular quando a ficha muda de tamanho
  later(() => G.map?.invalidateSize({ pan: false }), 60);
}

/* ================================================================ mapa */
function initMap() {
  const { ctx } = G;
  const LM = ctx.LeonidaMap, L = ctx.L;
  if (!LM || !L) { $(".gs-tip span").textContent = "mapa indisponível"; return; }
  G.home = LM.bounds;
  const map = LM.create($(".gs-map"), { zoomControl: !ctx.isMobile(), fit: G.home });
  map.doubleClickZoom.disable();       // clique duplo = mover o palpite, não aproximar
  G.map = map;
  G.layers = L.layerGroup().addTo(map);
  map.on("click", (e) => placeGuess(e.latlng));
  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(() => G?.map?.invalidateSize({ pan: false }));
    ro.observe($(".gs-mapwrap")); G.off.push(() => ro.disconnect());
  }
  later(() => map.invalidateSize(), 80);
}

function resetMap() {
  if (!G.map) return;
  G.layers.clearLayers(); G.guessMk = null; G.guess = null;
  const pad = G.ctx.isMobile() ? [8, 8] : [24, 24];
  if (G.ctx.REDUCE) G.map.fitBounds(G.home, { padding: pad, animate: false });
  else G.map.flyToBounds(G.home, { padding: pad, duration: .6 });
}

function placeGuess(latlng) {
  if (G.phase !== "guess") return;
  const L = G.ctx.L;
  G.guess = latlng;
  if (!G.guessMk) {
    G.guessMk = L.marker(latlng, {
      icon: L.divIcon({ className: "gs-pin-guess", iconSize: [34, 34], iconAnchor: [17, 17], html: "<i></i>" }),
      draggable: !G.ctx.isMobile(), keyboard: false, zIndexOffset: 500,
    }).addTo(G.layers);
    G.guessMk.on("dragend", () => { G.guess = G.guessMk.getLatLng(); });
  } else {
    G.guessMk.setLatLng(latlng);
    const e = G.guessMk.getElement();
    if (e && !G.ctx.REDUCE) { e.classList.remove("is-moved"); void e.offsetWidth; e.classList.add("is-moved"); }
  }
  $(".gs").classList.add("has-guess");
  const go = $(".gs-go"); go.disabled = false;
  $(".gs-info").innerHTML = `<p class="gs-help"><b>Palpite marcado.</b> ${G.ctx.isMobile() ? "Toque em outro ponto para mudar." : "Clique em outro ponto ou arraste o pino para mudar."}</p>`;
}

/* ================================================================ rodada */
function newRound() {
  const fresh = shuffle(G.pool.filter((p) => !lastIds.includes(p.id)));
  const old = shuffle(G.pool.filter((p) => lastIds.includes(p.id)));
  G.round = [...fresh, ...old].slice(0, Math.min(ROUND, G.pool.length));
  lastIds = G.round.map((p) => p.id);
  G.idx = 0; G.results = []; G.total = 0; G.streak = 0;
  $(".gs-total").textContent = "0";
  $(".gs").classList.remove("has-guess");
  G.el.querySelectorAll(".gs-dots i").forEach((d) => { d.className = ""; d.removeAttribute("style"); });
  showPhoto(0, true);
}

function startGuess() {
  overlay(null);
  setPhase("guess");
  $(".gs").classList.remove("has-guess");
  $(".gs-stamp").className = "gs-stamp";
  $(".gs-n").textContent = `foto ${G.idx + 1}/${G.round.length}`;
  G.el.querySelectorAll(".gs-dots i").forEach((d, i) => d.classList.toggle("is-now", i === G.idx));
  $(".gs-info").innerHTML = `<p class="gs-help">${G.ctx.isMobile() ? "Toque" : "Clique"} no mapa onde você acha que esta foto foi feita.</p>`;
  resetMap();
  const nxt = G.round[G.idx + 1];
  if (nxt) { const im = new Image(); im.decoding = "async"; im.src = nxt.preview || nxt.thumb; }   // pré-carrega a próxima
}

function showPhoto(i, instant) {
  const p = G.round[i];
  const img = $(".gs-img"), bg = $(".gs-bg"), frame = $(".gs-frame");
  const src = p.preview || p.thumb;
  frame.classList.add("is-loading");
  const swap = () => {
    if (!G || G.round[G.idx] !== p) return;
    img.src = src; bg.src = p.thumb || src;
    frame.classList.remove("is-loading", "is-out");
    if (!G.ctx.REDUCE && !instant) { img.classList.remove("is-in"); void img.offsetWidth; img.classList.add("is-in"); }
  };
  const pre = new Image(); pre.src = src;
  const ready = pre.decode ? pre.decode().catch(() => {}) : Promise.resolve();
  if (!instant && !G.ctx.REDUCE) frame.classList.add("is-out");
  Promise.all([ready, new Promise((r) => (instant || G.ctx.REDUCE ? r() : later(r, 180)))]).then(swap);
}

function confirmGuess() {
  if (G.phase !== "guess" || !G.guess || !G.map) return;
  const { ctx } = G, L = ctx.L, LM = ctx.LeonidaMap;
  const p = G.round[G.idx];
  const gu = LM.fromLatLng(G.guess);
  const d = Math.hypot(gu.x - p.map_x, gu.y - p.map_y);
  const pts = score(d);
  const prevTotal = G.total;
  G.total += pts;
  G.streak = pts >= STREAK ? G.streak + 1 : 0;
  G.results.push({ p, d, pts });
  setPhase("reveal");
  if (G.guessMk) G.guessMk.dragging?.disable();

  // linha tracejada que "corre" do palpite até o lugar certo, depois o pino verdadeiro aparece
  const truth = L.latLng(LM.toLatLng(p.map_x, p.map_y));
  const from = G.guess;
  const casing = L.polyline([from, from], { color: "#000", weight: 6, opacity: .55, interactive: false, lineCap: "round" }).addTo(G.layers);
  const line = L.polyline([from, from], { color: "#fff", weight: 3, dashArray: "1 9", lineCap: "round", interactive: false, className: "gs-line" }).addTo(G.layers);
  const dropTruth = () => {
    L.marker(truth, { icon: L.divIcon({ className: "gs-pin-true", iconSize: [48, 48], iconAnchor: [24, 24],
      html: `<span style="background-image:url('${ctx.esc(p.thumb || p.preview)}')"></span>` }), keyboard: false, interactive: false, zIndexOffset: 800 }).addTo(G.layers);
  };
  const bounds = L.latLngBounds([from, truth]);
  const pad = ctx.isMobile() ? [64, 64] : [90, 90];
  const flyReveal = () => {          // depois que a ficha (e, no celular, a foto) mudou de tamanho
    G.map.invalidateSize({ pan: false });
    if (ctx.REDUCE) {
      casing.setLatLngs([from, truth]); line.setLatLngs([from, truth]); dropTruth();
      G.map.fitBounds(bounds, { padding: pad, maxZoom: 4, animate: false });
      return;
    }
    G.map.flyToBounds(bounds, { padding: pad, maxZoom: 4, duration: .9 });
    tween(650, (t) => {
      const e = 1 - Math.pow(1 - t, 3);
      const ll = L.latLng(from.lat + (truth.lat - from.lat) * e, from.lng + (truth.lng - from.lng) * e);
      casing.setLatLngs([from, ll]); line.setLatLngs([from, ll]);
    }, dropTruth, 250);
  };

  // dot da rodada
  const dot = G.el.querySelectorAll(".gs-dots i")[G.idx];
  if (dot) { dot.classList.remove("is-now"); dot.classList.add("is-done"); dot.style.setProperty("--f", (pts / MAX).toFixed(3)); }

  // ficha com pontos, distância e (só agora) o que a foto é
  const chip = (icon, txt) => txt ? `<li>${ctx.svg(icon)}<span>${ctx.esc(txt)}</span></li>` : "";
  const chips = [chip("pin", p.location), chip("clock", p.game_time && `${p.game_time} no jogo`), chip("cloud", p.weather)].join("");
  $(".gs-info").innerHTML = `<div class="gs-res${pts >= PERFECT ? " is-perfect" : ""}">
      <div class="gs-pts"><b class="gs-count">0</b><span>/ ${fmt(MAX)} pts</span><em class="gs-verdict">${verdictOf(pts)}</em></div>
      <div class="gs-bar"><i style="--w:${(pts / MAX).toFixed(3)}"></i></div>
      <p class="gs-dist">${d <= GRACE ? "em cima do lugar" : `a ${distLabel(d)} do lugar certo`} <span class="gs-dim">· ${fmt(d)} u</span></p>
      <div class="gs-meta">
        <small class="gs-tombo"># ${ctx.esc(ctx.tombo(p))}</small>
        <h3>${ctx.esc(ctx.titleOf(p))}</h3>
        ${chips ? `<ul class="gs-chips">${chips}</ul>` : ""}
      </div>
      <div class="gs-links">
        <button type="button" data-gs="map">${ctx.svg("pin")}ver no mapa</button>
        <button type="button" data-gs="open">${ctx.svg("expand")}projetar foto</button>
      </div>
    </div>`;
  const dur = ctx.REDUCE ? 0 : 900 + 500 * (pts / MAX);
  countUp($(".gs-count"), 0, pts, dur, 300);
  countUp($(".gs-total"), prevTotal, G.total, dur, 300);
  $(".gs-score").classList.toggle("is-bump", false);
  later(() => { $(".gs-score").classList.add("is-bump"); }, 300 + dur);

  // momentos: perfeito / sequência
  const stamp = $(".gs-stamp");
  const msg = pts >= PERFECT ? (G.streak >= 2 ? `perfeito! ×${G.streak}` : "perfeito!") : G.streak >= 2 ? `sequência ×${G.streak}` : "";
  if (msg) later(() => { stamp.textContent = msg; stamp.className = `gs-stamp is-on${pts >= PERFECT ? " is-perfect" : ""}`; }, 300 + dur * .6);
  $(".gs-go").focus({ preventScroll: true });
  if (ctx.isMobile() && !ctx.REDUCE) later(flyReveal, 500); else flyReveal();
}

function nextPhoto() {
  if (G.phase !== "reveal") return;
  if (G.idx + 1 >= G.round.length) { endGame(); return; }
  G.idx += 1;
  showPhoto(G.idx);
  startGuess();
}

function endGame() {
  const { ctx } = G;
  setPhase("end");
  const max = MAX * G.round.length;
  const prevBest = readBest();
  const isBest = G.total > prevBest;
  if (isBest) writeBest(G.total);
  const strip = G.results.map(({ p, pts }, i) => `<li style="--i:${i}"><button type="button" data-gs="pick" data-id="${ctx.esc(p.id)}" title="${ctx.esc(ctx.titleOf(p))}">
      <img src="${ctx.esc(p.thumb || p.preview)}" alt="" loading="lazy"/><b>${fmt(pts)}</b>${pts >= PERFECT ? "<i>★</i>" : ""}</button></li>`).join("");
  overlay(`<div class="gs-card gs-end">
    <small class="gs-kick">&gt; fim da rodada</small>
    <div class="gs-final"><b class="gs-count">0</b><span>/ ${fmt(max)}</span></div>
    <h2 class="gs-rank">${rankOf(G.total, max)}</h2>
    <p class="gs-best">${isBest ? (prevBest ? `<b>novo recorde!</b> (antes: ${fmt(prevBest)})` : "<b>primeiro recorde registrado</b>") : `seu recorde: <b>${fmt(prevBest)}</b>`}</p>
    <ol class="gs-strip">${strip}</ol>
    <div class="gs-actions">
      <button class="btn btn-hot gs-big" data-gs="again">Jogar de novo <kbd>enter</kbd></button>
      <button class="btn gs-big gs-share" data-gs="share">Compartilhar</button>
    </div>
  </div>`);
  countUp($(".gs-over .gs-count"), 0, G.total, ctx.REDUCE ? 0 : 1400, 250);
  if (isBest && !ctx.REDUCE) later(() => $(".gs-best")?.classList.add("is-pop"), 1700);
}

function again() {
  overlay(null);
  newRound();
  startGuess();
}

async function share() {
  const max = MAX * G.round.length;
  const text = `🎯 Onde foi feita? · ${fmt(G.total)}/${fmt(max)} · ${G.ctx.studio || "Leonida Field Notes"}\n${location.href}`;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch { /* tenta o jeito antigo */ }
  if (!ok) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); ta.remove();
    } catch { ok = false; }
  }
  if (!G) return;
  const b = $(".gs-share");
  if (!b) return;
  b.textContent = ok ? "copiado ✓" : "não deu para copiar";
  b.classList.add("is-done");
  later(() => { b.textContent = "Compartilhar"; b.classList.remove("is-done"); }, 2000);
}

/* ================================================================ animação */
function tween(ms, step, done, delay = 0) {
  const g = G;
  const run = () => {
    const t0 = performance.now();
    const f = (now) => {
      if (G !== g) return;
      const t = Math.min(1, (now - t0) / ms);
      step(t);
      if (t < 1) { const r = requestAnimationFrame(f); g.rafs.add(r); } else done?.();
    };
    g.rafs.add(requestAnimationFrame(f));
  };
  delay ? later(run, delay) : run();
}
function countUp(node, from, to, ms, delay = 0) {
  if (!node) return;
  if (!ms) { node.textContent = fmt(to); return; }
  node.textContent = fmt(from);
  tween(ms, (t) => { node.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - t, 4))); }, null, delay);
}

/* ================================================================ eventos */
function primary() {
  if (G.phase === "intro") startGuess();
  else if (G.phase === "guess") confirmGuess();
  else if (G.phase === "reveal") nextPhoto();
  else if (G.phase === "end") again();
}

function onClick(e) {
  const t = e.target.closest("[data-gs]");
  if (!t || !G) return;
  const a = t.dataset.gs, p = G.round[G.idx];
  if (a === "go" || a === "start" || a === "again") primary();
  else if (a === "expand") $(".gs").classList.toggle("is-zoom");
  else if (a === "map" && p) G.ctx.showOnMap(p.id);
  else if (a === "open" && p) G.ctx.open(p.id);
  else if (a === "pick") G.ctx.open(t.dataset.id);
  else if (a === "share") share();
}

function onKey(e) {
  if (!G || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.key !== "Enter" && e.key !== " ") return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  // outro botão/link focado (ver no mapa, compartilhar…): deixa o clique nativo agir
  const f = document.activeElement;
  if (f && f.matches("button, a") && !f.matches("[data-gs=go], [data-gs=start], [data-gs=again]")) return;
  if (G.phase === "guess" && !G.guess) return;
  e.preventDefault();
  primary();
}
