/* Leonida Field Notes · TEMAS
   Temas prontos + cor de destaque, compartilhados pelo Estúdio e pela Galeria.
   "codigo" é o visual original (preto e branco): não escreve nenhuma variável, então fica idêntico ao CSS.
   Os outros temas sobrescrevem as variáveis de cor no <html> (ou num elemento, para prévias).

   LFNThemes.apply(preset, accent, el?)  · LFNThemes.tokens(preset, accent) · LFNThemes.inkOn(hex)
   Guarda o último tema em localStorage (lfn.theme.<alvo>) para pintar antes do primeiro fetch. */
(function () {
  "use strict";
  const P = {
    "codigo": { name: "Código P&B", desc: "Preto e branco, fonte de código. O visual original.", scheme: "dark",
      bg: "#000000", surface: "#070707", surface2: "#101010", surface3: "#1a1a1a", well: "#000000", rule: "#1c1c1c", ruleStrong: "#2e2e2e",
      line: "#2a2a2a", ink: "#f4f4f4", ink2: "#b8b8b8", ink3: "#8c8c8c", hi: "#ffffff", accent: "#ffffff", accent2: "#ffffff" },
    "vice": { name: "Vice Neon", desc: "Noite de Vice City: azul-marinho quase preto, rosa-choque e ciano.", scheme: "dark",
      bg: "#0a0614", surface: "#110a20", surface2: "#190f2e", surface3: "#22153d", well: "#06030d", rule: "#2a1c47", ruleStrong: "#3e2a66",
      line: "#35255c", ink: "#f7effe", ink2: "#c8b8e0", ink3: "#9d8bbb", hi: "#ffffff", accent: "#ff2e88", accent2: "#2ee6f0" },
    "por-do-sol": { name: "Pôr do sol", desc: "Escuro quente, laranja e magenta de fim de tarde na praia.", scheme: "dark",
      bg: "#120807", surface: "#1a0e0b", surface2: "#24140f", surface3: "#301b14", well: "#0a0403", rule: "#3a2118", ruleStrong: "#573323",
      line: "#4a2a1d", ink: "#fff2e8", ink2: "#e2c2ad", ink3: "#b38f79", hi: "#ffffff", accent: "#ff7a2f", accent2: "#ff4fa3" },
    "noite-azul": { name: "Noite azul", desc: "Azul profundo e calmo, com destaque azul-claro.", scheme: "dark",
      bg: "#060b16", surface: "#0a1221", surface2: "#101b2f", surface3: "#17253e", well: "#03060c", rule: "#1c2a45", ruleStrong: "#2c3f62",
      line: "#24375b", ink: "#ebf2ff", ink2: "#aabbd8", ink3: "#8295b6", hi: "#ffffff", accent: "#4d9fff", accent2: "#a3cbff" },
    "papel": { name: "Papel", desc: "Tema claro: papel creme e tinta escura, como uma ficha impressa.", scheme: "light",
      bg: "#f3efe6", surface: "#ebe6da", surface2: "#e2dccd", surface3: "#d8d1c0", well: "#e6e0d3", rule: "#d6cfbf", ruleStrong: "#b3aa96",
      line: "#c9c1ae", ink: "#1c1a16", ink2: "#47433b", ink3: "#6b6559", hi: "#000000", accent: "#1c1a16", accent2: "#1c1a16" },
    "verde": { name: "Verde Leonida", desc: "Verde dos manguezais, escuro e com destaque verde vivo.", scheme: "dark",
      bg: "#050d09", surface: "#09140f", surface2: "#0e1e16", surface3: "#15291f", well: "#030805", rule: "#1a2f24", ruleStrong: "#294637",
      line: "#213a2d", ink: "#eafbf1", ink2: "#a9cfb9", ink3: "#7fa492", hi: "#ffffff", accent: "#3ddc84", accent2: "#a6f5c8" },
  };
  const ORDER = ["codigo", "vice", "por-do-sol", "noite-azul", "papel", "verde"];
  const HEX = /^#[0-9a-f]{6}$/i;
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (h) => { const c = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /* tinta legível sobre uma cor: preto ou branco, o que tiver mais contraste */
  const inkOn = (h) => (contrast(h, "#000000") >= contrast(h, "#ffffff") ? "#000000" : "#ffffff");

  function tokens(preset, accent) {
    const base = P[preset] || P.codigo;
    const t = { ...base };
    if (accent && HEX.test(accent)) {
      const a = accent.toLowerCase();
      if (base.accent2 === base.accent) t.accent2 = a;   // destaque único: contornos seguem a cor
      if (contrast(t.accent2, t.bg) < 2.2) t.accent2 = base.accent2;   // contorno sempre visível sobre o fundo
      t.accent = a;
    }
    t.accentInk = inkOn(t.accent);
    return t;
  }

  const VARS = ["--bg", "--bg-rgb", "--surface", "--surface-2", "--surface-3", "--well", "--rule", "--rule-strong", "--line",
    "--ink", "--ink-2", "--ink-3", "--hi", "--hi-rgb", "--on-ink", "--paper", "--accent", "--accent-dim", "--accent-soft",
    "--on-accent", "--accent-ink", "--accent-2", "--overlay", "--glass", "--sunset", "--ok", "--warn", "--danger",
    "--line-1", "--line-2", "--accent-stage", "--accent-stage-ink", "--accent-stage-2", "color-scheme"];

  function apply(preset, accent, el) {
    const root = el || document.documentElement;
    const s = root.style;
    VARS.forEach((v) => s.removeProperty(v));
    preset = P[preset] ? preset : "codigo";
    root.dataset.theme = preset;
    const custom = accent && HEX.test(accent);
    if (preset === "codigo" && !custom) return;   // visual original: só o CSS
    const t = tokens(preset, accent);
    const set = (k, v) => s.setProperty(k, v);
    set("--accent", t.accent); set("--on-accent", t.accentInk); set("--accent-ink", t.accentInk); set("--accent-2", t.accent2);
    set("--accent-dim", `color-mix(in srgb, ${t.accent} 25%, transparent)`);
    set("--accent-soft", `color-mix(in srgb, ${t.accent} 7%, transparent)`);
    set("--sunset", t.accent);
    const stage = contrast(t.accent, "#000000") >= 3 ? t.accent : "#ffffff";   // sobre a foto (sempre escuro)
    set("--accent-stage", stage); set("--accent-stage-ink", inkOn(stage));
    set("--accent-stage-2", contrast(t.accent2, "#000000") >= 3 ? t.accent2 : "#ffffff");
    if (preset === "codigo") return;   // P&B com outra cor de destaque: o resto continua igual
    const bgRgb = rgb(t.bg).join(", ");
    set("--bg", t.bg); set("--bg-rgb", bgRgb); set("--surface", t.surface); set("--surface-2", t.surface2); set("--surface-3", t.surface3);
    set("--well", t.well); set("--rule", t.rule); set("--rule-strong", t.ruleStrong); set("--line", t.line);
    set("--line-1", t.rule); set("--line-2", t.ruleStrong);
    set("--ink", t.ink); set("--ink-2", t.ink2); set("--ink-3", t.ink3); set("--hi", t.hi); set("--hi-rgb", rgb(t.hi).join(", "));
    set("--on-ink", t.bg); set("--paper", t.ink);
    set("--overlay", `rgba(${bgRgb}, .86)`); set("--glass", `rgba(${bgRgb}, .8)`);
    set("color-scheme", t.scheme);
    if (t.scheme === "light") { set("--ok", "#2f6e3f"); set("--warn", "#8a5a0f"); set("--danger", "#b3261e"); }
  }

  function remember(target, preset, accent) {
    try { localStorage.setItem("lfn.theme." + target, JSON.stringify({ preset, accent: accent || "" })); } catch { /* sem armazenamento */ }
  }
  function recall(target) {
    try { const v = JSON.parse(localStorage.getItem("lfn.theme." + target) || "null"); return v && P[v.preset] ? v : null; } catch { return null; }
  }

  window.LFNThemes = { presets: P, order: ORDER, tokens, apply, inkOn, contrast, remember, recall };
})();
