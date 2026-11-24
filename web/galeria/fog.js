// Mapa com névoa (fog of war): Leonida começa coberta; cada foto marcada revela a área em volta.
// Contrato (app.js → renderMapLayer): addFog(map, fotosComPino, ctx) → { remove(), percent }.
//
// - Camada própria (L.Renderer + canvas) num pane entre os tiles (200) e o overlayPane (400, calor) /
//   markerPane (600, pinos). pointer-events: none — nunca bloqueia cliques.
// - Percentual medido só sobre TERRA. Com o pôster oficial (window.LFN_MAP_IMG) a máscara de terra sai dos
//   tiles de zoom 0 (1 px = 1 unidade de mapa), ver buildMask(). Sem pôster: elipse aproximada da ilha.

const UNIT = 16;          // raio de revelação (unidades de mapa, 0..1024)
const CELL = 4;           // resolução da máscara de terra / amostragem (unidades por célula)
const MIN_PX = 46;        // raio mínimo do buraco na tela (pino tem 23 px de raio)
const KEY_ON = "lfn.fog";
const KEY_MASK = "lfn.fogmask.";
const masks = new Map();  // sig → Promise<mask> (cache em memória por sessão)

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* cheio, privado ou bloqueado */ } };

/* ------------------------------------------------------------------ raio por foto */
// Um pouco maior onde há várias fotos juntas (o fotógrafo "conhece" melhor aquele canto).
function radii(photos) {
  return photos.map((p) => {
    let n = 0;
    for (const q of photos) if (q !== p && Math.hypot(q.map_x - p.map_x, q.map_y - p.map_y) < 28) n++;
    return UNIT + Math.min(8, n * 2);
  });
}

/* ------------------------------------------------------------------ máscara de terra */
// mask = { x0, y0, w, h, bits: Uint8Array(w*h) } — célula (i,j) cobre x0+i*CELL .. y0+j*CELL.
//
// Heurística (pôster oficial, tiles de zoom 0):
//   água  = azul-ciano: min(G,B) − R > 70  (o mar liso #00a9c8 e os rasos claros caem aqui; mato verde
//           fica em ~40–60, cidade cinza perto de 0);
//   moldura/arte = quase branco (R,G,B > 190): legenda, selo, letreiro "LEONIDA", linhas da grade, rosa dos ventos;
//   célula de terra = ≥ 50% dos pixels nem água nem branco;
//   por fim descarta componentes conexos com < 10 células (restos de texto/arte isolados no mar).
// Erra um pouco para menos em áreas urbanas muito brancas; para um percentual "de exploração" basta.
function ellipseMask() {
  // Sem pôster (tiles de fã): elipse que cobre a ilha principal no mesmo espaço de unidades.
  const x0 = 200, y0 = 200, w = 104, h = 140, bits = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = x0 + (i + .5) * CELL, y = y0 + (j + .5) * CELL;
    if (((x - 405) / 180) ** 2 + ((y - 480) / 255) ** 2 <= 1) bits[j * w + i] = 1;
  }
  return { x0, y0, w, h, bits };
}

function loadImg(src) {
  return new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
}

async function buildMask(img) {
  const [bx0, by0, bx1, by1] = img.bounds;
  const tx0 = Math.floor(bx0 / 256), ty0 = Math.floor(by0 / 256), tx1 = Math.floor((bx1 - 1e-6) / 256), ty1 = Math.floor((by1 - 1e-6) / 256);
  const base = (window.LFN_MAP_BASE || "/map/");
  const cv = document.createElement("canvas");
  cv.width = (tx1 - tx0 + 1) * 256; cv.height = (ty1 - ty0 + 1) * 256;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    jobs.push(loadImg(`${base}0/${tx}_${ty}.webp?v=${img.sig}`).then((im) => { if (im) g.drawImage(im, (tx - tx0) * 256, (ty - ty0) * 256); }));
  }
  const got = await Promise.all(jobs);
  if (!got.length) return ellipseMask();
  // Só a área do pôster (fora dela é mar).
  const x0 = Math.floor(bx0 / CELL) * CELL, y0 = Math.floor(by0 / CELL) * CELL;
  const w = Math.ceil((bx1 - x0) / CELL), h = Math.ceil((by1 - y0) / CELL);
  const ox = x0 - tx0 * 256, oy = y0 - ty0 * 256;
  const data = g.getImageData(ox, oy, w * CELL, h * CELL).data, rowW = w * CELL;
  const raw = new Uint8Array(w * h);
  let any = false;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let land = 0;
    for (let yy = 0; yy < CELL; yy++) for (let xx = 0; xx < CELL; xx++) {
      const k = ((j * CELL + yy) * rowW + i * CELL + xx) * 4;
      const r = data[k], gg = data[k + 1], b = data[k + 2], a = data[k + 3];
      if (a < 128) continue;                                  // tile ausente
      if (Math.min(gg, b) - r > 70) continue;                 // água
      if (r > 190 && gg > 190 && b > 190) continue;           // moldura, legenda, selo, letreiros
      land++;
    }
    if (land * 2 >= CELL * CELL) { raw[j * w + i] = 1; any = true; }
  }
  if (!any) return ellipseMask();
  // Remove componentes pequenos (4-vizinhança).
  const bits = new Uint8Array(w * h), seen = new Uint8Array(w * h), stack = [], comp = [];
  for (let s = 0; s < w * h; s++) {
    if (!raw[s] || seen[s]) continue;
    stack.length = comp.length = 0; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const c = stack.pop(); comp.push(c);
      const ci = c % w, cj = (c - ci) / w;
      if (ci > 0 && raw[c - 1] && !seen[c - 1]) { seen[c - 1] = 1; stack.push(c - 1); }
      if (ci < w - 1 && raw[c + 1] && !seen[c + 1]) { seen[c + 1] = 1; stack.push(c + 1); }
      if (cj > 0 && raw[c - w] && !seen[c - w]) { seen[c - w] = 1; stack.push(c - w); }
      if (cj < h - 1 && raw[c + w] && !seen[c + w]) { seen[c + w] = 1; stack.push(c + w); }
    }
    if (comp.length >= 10) for (const c of comp) bits[c] = 1;
  }
  return { x0, y0, w, h, bits };
}

// Serialização compacta (RLE em base 36) para o localStorage.
function packMask(m) {
  const runs = []; let cur = 0, n = 0;
  for (let i = 0; i < m.bits.length; i++) { if (m.bits[i] === cur) n++; else { runs.push(n.toString(36)); cur = m.bits[i]; n = 1; } }
  runs.push(n.toString(36));
  return JSON.stringify({ v: 1, c: CELL, x0: m.x0, y0: m.y0, w: m.w, h: m.h, r: runs.join(",") });
}
function unpackMask(s) {
  try {
    const o = JSON.parse(s);
    if (o.v !== 1 || o.c !== CELL) return null;
    const bits = new Uint8Array(o.w * o.h); let k = 0, cur = 0;
    for (const t of o.r.split(",")) { const n = parseInt(t, 36); if (cur) bits.fill(1, k, k + n); k += n; cur ^= 1; }
    return k === bits.length ? { x0: o.x0, y0: o.y0, w: o.w, h: o.h, bits } : null;
  } catch { return null; }
}

function getMask() {
  const img = window.LFN_MAP_IMG;
  const sig = img?.sig ? String(img.sig) : "fallback";
  if (!masks.has(sig)) {
    masks.set(sig, (async () => {
      if (!img) return ellipseMask();
      const cached = unpackMask(lsGet(KEY_MASK + sig) || "");
      if (cached) return cached;
      const m = await buildMask(img).catch(() => ellipseMask());
      lsSet(KEY_MASK + sig, packMask(m));
      return m;
    })());
  }
  return masks.get(sig);
}

function revealedPercent(mask, photos, rs) {
  const { x0, y0, w, h, bits } = mask;
  let total = 0;
  for (let i = 0; i < bits.length; i++) total += bits[i];
  if (!total) return 0;
  const hit = new Uint8Array(w * h);
  let n = 0;
  photos.forEach((p, k) => {
    const R = rs[k], R2 = R * R;
    const i0 = Math.max(0, Math.floor((p.map_x - R - x0) / CELL)), i1 = Math.min(w - 1, Math.floor((p.map_x + R - x0) / CELL));
    const j0 = Math.max(0, Math.floor((p.map_y - R - y0) / CELL)), j1 = Math.min(h - 1, Math.floor((p.map_y + R - y0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = j * w + i;
      if (!bits[c] || hit[c]) continue;
      const dx = x0 + (i + .5) * CELL - p.map_x, dy = y0 + (j + .5) * CELL - p.map_y;
      if (dx * dx + dy * dy <= R2) { hit[c] = 1; n++; }
    }
  });
  return (n / total) * 100;
}

const fmtPct = (v) => (v > 0 && v < 10 ? v.toFixed(1).replace(".", ",") : String(Math.round(v)));

/* ------------------------------------------------------------------ sprite do buraco (degradê pré-renderizado) */
// Desenhar um createRadialGradient por foto a cada quadro é caro; um sprite único escalado com drawImage não.
let holeSprite = null;
function hole() {
  if (holeSprite) return holeSprite;
  const s = 256, c = document.createElement("canvas"); c.width = c.height = s;
  const g = c.getContext("2d"), r = s / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(.62, "rgba(0,0,0,1)");
  gr.addColorStop(.85, "rgba(0,0,0,.6)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  return (holeSprite = c);
}

/* ------------------------------------------------------------------ textura (granulação estática) */
let grainCanvas = null;
function grain() {
  if (grainCanvas) return grainCanvas;
  const s = 128, c = document.createElement("canvas"); c.width = c.height = s;
  const g = c.getContext("2d"), im = g.createImageData(s, s);
  for (let i = 0; i < im.data.length; i += 4) {
    const v = Math.random() < .5 ? 0 : 255;
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
    im.data[i + 3] = Math.random() * 26;          // granulação bem leve
  }
  g.putImageData(im, 0, 0);
  return (grainCanvas = c);
}

/* ------------------------------------------------------------------ camada */
export function addFog(map, photos, ctx = {}) {
  const L = ctx.L || window.L, LM = ctx.LeonidaMap || window.LeonidaMap;
  if (!L || !map || !LM) return { remove() {}, percent: 0 };
  const pts = (photos || []).filter((p) => Number.isFinite(+p.map_x) && Number.isFinite(+p.map_y))
    .map((p) => ({ map_x: +p.map_x, map_y: +p.map_y }));
  const rs = radii(pts);
  const MONO = ctx.MONO !== false, REDUCE = !!ctx.REDUCE;
  const mobile = () => (ctx.isMobile ? ctx.isMobile() : matchMedia("(max-width: 820px)").matches);
  // Opaca: fora das regiões fotografadas o mapa não aparece (o botão "ver mapa inteiro" tira a névoa).
  const FILL = MONO ? "#0b0b0b" : "#09061a";
  let on = lsGet(KEY_ON) !== "off";
  let percent = 0, dead = false, grow = REDUCE ? 1 : 0, raf = 0;

  if (!map.getPane("lfnFog")) { const p = map.createPane("lfnFog"); p.style.zIndex = 350; p.style.pointerEvents = "none"; }

  const Fog = L.Renderer.extend({
    options: { pane: "lfnFog", padding: .5 },
    _initContainer() {
      const c = this._container = document.createElement("canvas");
      c.className = "fog-canvas" + (MONO ? " is-mono" : "");
      c.setAttribute("aria-hidden", "true");
      this._ctx = c.getContext("2d"); this._pat = null;
    },
    _destroyContainer() { this._container.remove(); this._container = null; },
    _update() {
      if (this._map._animatingZoom && this._bounds) return;
      L.Renderer.prototype._update.call(this);
      const b = this._bounds, size = b.getSize(), c = this._container;
      // a névoa é macia: não precisa de resolução de tela cheia (menos pixels = desenho bem mais rápido)
      const s = mobile() ? .5 : Math.min(window.devicePixelRatio || 1, 1.25) * .75;
      L.DomUtil.setPosition(c, b.min);
      c.width = Math.round(size.x * s); c.height = Math.round(size.y * s);
      c.style.width = size.x + "px"; c.style.height = size.y + "px";
      this._scale = s;
      this.draw();
    },
    _updatePaths() {},
    draw() {
      const c = this._container, g = this._ctx, m = this._map, b = this._bounds;
      if (!c || !b) return;
      const s = this._scale;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, c.width, c.height);
      g.setTransform(s, 0, 0, s, 0, 0);
      const W = c.width / s, H = c.height / s;
      g.fillStyle = FILL; g.fillRect(0, 0, W, H);
      // granulação presa ao mapa (não "nada" ao arrastar)
      const org = m.getPixelOrigin().add(b.min), gs = 128;
      g.save();
      g.translate(-(((org.x % gs) + gs) % gs), -(((org.y % gs) + gs) % gs));
      g.fillStyle = this._pat || (this._pat = g.createPattern(grain(), "repeat"));
      g.fillRect(0, 0, W + gs, H + gs);
      g.restore();
      // buracos com borda macia
      g.globalCompositeOperation = "destination-out";
      const k = Math.pow(2, m.getZoom());   // CRS.Simple: px por unidade = 2^zoom
      const view = L.bounds([-1, -1], [W + 1, H + 1]), spr = hole();
      pts.forEach((p, i) => {
        const e = REDUCE ? 1 : Math.max(0, Math.min(1, grow * 1.6 - i * (.6 / Math.max(1, pts.length))));
        const t = 1 - Math.pow(1 - e, 3);
        if (t <= 0) return;
        const R = Math.max(rs[i] * k, MIN_PX) * t;   // no zoom de visão geral o halo ainda aparece em volta do pino
        const pt = m.latLngToLayerPoint(LM.toLatLng(p.map_x, p.map_y)).subtract(b.min);
        if (!view.intersects(L.bounds([pt.x - R, pt.y - R], [pt.x + R, pt.y + R]))) return;
        g.drawImage(spr, pt.x - R, pt.y - R, R * 2, R * 2);
      });
      g.globalCompositeOperation = "source-over";
    },
  });
  const layer = new Fog();
  // Ao arrastar, só redesenha quando a tela sai da margem já desenhada (evita bordas sem névoa).
  let moveQueued = false;
  const onMove = () => {
    if (moveQueued || !map.hasLayer(layer) || !layer._bounds) return;
    const pb = map.getPixelBounds(), o = map.getPixelOrigin();
    const vb = L.bounds(pb.min.subtract(o), pb.max.subtract(o));
    if (layer._bounds.contains(vb)) return;
    moveQueued = true;
    requestAnimationFrame(() => { moveQueued = false; if (!dead && map.hasLayer(layer)) layer._update(); });
  };
  map.on("move", onMove);

  /* --- controle: "23% de Leonida revelada" + barra + liga/desliga */
  const Ctl = L.Control.extend({
    options: { position: "bottomleft" },
    onAdd() {
      const d = L.DomUtil.create("div", "fog-ctl" + (MONO ? " is-mono" : ""));
      d.innerHTML = `<p class="fog-pct" aria-live="polite"><b>…</b> de Leonida revelada</p>
        <span class="fog-bar" aria-hidden="true"><i></i></span>
        <button type="button" class="fog-toggle" aria-pressed="${!on}"><b>${on ? "ver mapa inteiro" : "voltar a névoa"}</b></button>`;
      L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
      d.querySelector(".fog-toggle").addEventListener("click", () => setOn(!on));
      return d;
    },
  });
  const ctl = new Ctl();

  function paintCtl() {
    const d = ctl.getContainer(); if (!d) return;
    d.querySelector(".fog-pct b").textContent = fmtPct(percent) + "%";
    d.querySelector(".fog-bar i").style.width = Math.max(percent > 0 ? 1.5 : 0, Math.min(100, percent)) + "%";
    d.title = `${pts.length} ${pts.length === 1 ? "foto marcada revela" : "fotos marcadas revelam"} ${fmtPct(percent)}% da terra de Leonida`;
    const t = d.querySelector(".fog-toggle");
    t.setAttribute("aria-pressed", String(!on)); t.querySelector("b").textContent = on ? "ver mapa inteiro" : "voltar a névoa";
    d.classList.toggle("is-off", !on);
  }
  function setOn(v) {
    on = v; lsSet(KEY_ON, on ? "on" : "off");
    if (on && !map.hasLayer(layer)) map.addLayer(layer);
    if (!on && map.hasLayer(layer)) map.removeLayer(layer);
    paintCtl();
  }

  // abertura: os buracos se abrem um a um
  function animate() {
    const t0 = performance.now(), dur = 1400;
    const step = (now) => {
      if (dead) return;
      grow = Math.min(1, (now - t0) / dur);
      if (map.hasLayer(layer)) layer.draw();
      if (grow < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  ctl.addTo(map);
  if (on) map.addLayer(layer);
  if (!REDUCE) animate();
  paintCtl();
  getMask().then((mask) => { if (dead) return; percent = revealedPercent(mask, pts, rs); paintCtl(); });

  return {
    get percent() { return percent; },
    remove() {
      if (dead) return; dead = true;
      cancelAnimationFrame(raf); map.off("move", onMove);
      try { if (map.hasLayer(layer)) map.removeLayer(layer); } catch { /* mapa já destruído */ }
      try { ctl.remove(); } catch { /* idem */ }
      const pane = map.getPane && map.getPane("lfnFog");
      if (pane && !pane.children.length) { pane.remove(); delete map._panes.lfnFog; }
    },
  };
}
