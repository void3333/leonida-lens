// Headless Chrome driver (Chrome DevTools Protocol, no npm dependencies) for visual checks.
//
//   node tools/browser.mjs shot <url> [name] [--size 1600x900] [--mobile]
//   node tools/browser.mjs run  <url> <steps.json> [--size 1600x900] [--mobile]
//
// Screenshots go to .sandbox/shots/<name>.png. Console errors and uncaught exceptions are printed.
// steps.json: {"wait":5000,"do":[{"click":[x,y]},{"clickSel":"css"},{"key":"Escape"},{"type":"text"},
//              {"js":"expression"},{"sleep":500},{"shot":"name"}]}   (each step may combine fields)
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".sandbox", "shots");
const CHROME = process.env.CHROME || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
].find((p) => existsSync(p));

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? (args.splice(i, 2)[1] ?? d) : d; };
const mobile = args.includes("--mobile") && args.splice(args.indexOf("--mobile"), 1);
const [w, h] = flag("--size", mobile ? "390x844" : "1600x900").split("x").map(Number);
const [mode, url, third] = args;
if (!mode || !url || !CHROME) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(0, 9).join("\n"));
  process.exit(CHROME ? 1 : (console.error("Chrome/Edge não encontrado (defina CHROME=caminho)"), 1));
}
const steps = mode === "run" ? JSON.parse(readFileSync(third, "utf8").replace(/^\uFEFF/, "")) : { do: [{ shot: third || "shot" }] };

mkdirSync(OUT, { recursive: true });
const port = 9400 + Math.floor(Math.random() * 400);
const profile = join(tmpdir(), `lfn-chrome-${port}`);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${w},${h}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quit = (code) => { try { chrome.kill(); } catch {} setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(code); }, 300); };

let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try { const t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === "page"); if (t) ws = new WebSocket(t.webSocketDebuggerUrl); } catch {}
  if (!ws) await sleep(250);
}
if (!ws) { console.error("Não consegui conectar ao Chrome."); quit(1); }
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === "Runtime.exceptionThrown") console.log("  [exceção]", d.params.exceptionDetails?.exception?.description?.split("\n")[0] || d.params.exceptionDetails?.text);
  if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type)) console.log(`  [console.${d.params.type}]`, d.params.args.map((a) => a.value ?? a.description).join(" "));
  if (d.method === "Log.entryAdded" && d.params.entry.level === "error") console.log("  [log]", d.params.entry.text, d.params.entry.url || "");
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJS = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? "ERRO: " + r.result.exceptionDetails.exception?.description : r.result?.result?.value; };
const mouse = async (x, y) => { for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }); };

await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile });
if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true });
await send("Page.navigate", { url }); await sleep(steps.wait ?? 4000);

const KEYS = { Escape: 27, Enter: 13, Tab: 9, ArrowRight: 39, ArrowLeft: 37, ArrowUp: 38, ArrowDown: 40, " ": 32 };
for (const s of steps.do) {
  if (s.click) await mouse(...s.click);
  if (s.clickSel) {
    const p = await evalJS(`(()=>{const e=document.querySelector(${JSON.stringify(s.clickSel)});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
    if (p) await mouse(...p); else console.log("  [passo] não encontrado:", s.clickSel);
  }
  if (s.key) for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: s.key, code: s.key, windowsVirtualKeyCode: KEYS[s.key] || s.key.toUpperCase().charCodeAt(0), text: type === "keyDown" && s.key.length === 1 ? s.key : undefined, modifiers: s.ctrl ? 2 : 0 });
  if (s.type) await send("Input.insertText", { text: s.type });
  if (s.js) console.log("js:", JSON.stringify(await evalJS(s.js)));
  await sleep(s.sleep ?? 150);
  if (s.shot) {
    const r = await send("Page.captureScreenshot", { format: "png" });
    const f = join(OUT, `${s.shot}${mobile ? "-mobile" : ""}.png`);
    writeFileSync(f, Buffer.from(r.result.data, "base64"));
    console.log("captura:", f);
  }
}
ws.close(); quit(0);
