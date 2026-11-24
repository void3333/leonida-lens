"""Public gallery: a static copy of the Galeria on Cloudflare Pages, kept in sync automatically.

The site contains only what the Galeria shows for photos marked "Publicar no site":
images (original, 2560px preview, thumbnail) and a catalog.json. No Studio, no
journal, no tokens, no backups. Deploys use Cloudflare's official CLI (wrangler),
authorized once in the browser (`wrangler login`); this app stores no Cloudflare secret.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

WRANGLER = "wrangler@4.166.0"
TILE_BASE = "https://fbritoferreira.github.io/gta6/tiles/"  # Open GTA 6 Map, CC BY 4.0 (hotlink allowed)
PAGES_FILE_LIMIT = 25 * 1024 * 1024
CHECK_EVERY = 20
RETRY_AFTER_ERROR = 300


class PublishError(Exception):
    pass


APP_DIR = Path(__file__).resolve().parent


def bundled_node(app_dir: Path | None = None):
    """<app>/runtime/node (Node.js embedded by the Windows installer), or None."""
    d = (app_dir or APP_DIR) / "runtime" / "node"
    return d if (d / "npx.cmd").is_file() else None


def node_env(app_dir: Path | None = None, **extra):
    """Environment for npx: the bundled node dir goes first on PATH (wrangler spawns `node`)."""
    env = {**os.environ, **extra}
    node = bundled_node(app_dir)
    if node:
        env["PATH"] = str(node) + os.pathsep + env.get("PATH", "")
    return env


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def slug(text, fallback="leonida"):
    s = re.sub(r"[^a-z0-9]+", "-", str(text or "").lower()).strip("-")
    return (s or fallback)[:40].strip("-")


def _clean(out, n=400):
    out = re.sub(r"\x1b\[[0-9;]*m", "", out or "").strip()
    return out[-n:] if out else "sem detalhes"


class SitePublisher:
    def __init__(self, data_dir: Path, web_dir: Path, get_setting, set_setting, build_public):
        self.site = data_dir / "site"
        self.map_dir = data_dir / "map_official"   # official Leonida map tiles (map_official.py)
        self.web = web_dir
        self.get, self.set = get_setting, set_setting
        self.build_public = build_public          # -> (catalog dict, [(src Path, rel dest str)])
        self.lock = threading.Lock()
        self.kick = threading.Event()
        self.state = {"deploying": False, "last_error": None, "logged_in": None, "account": None,
                      "pending": False, "login_open": False}
        self._login_proc = None
        self._next_try = 0.0

    # ------------------------------------------------------------ wrangler
    def _npx(self):
        node = bundled_node()  # Node.js shipped by the Windows installer comes first
        if node:
            return str(node / "npx.cmd")
        exe = shutil.which("npx.cmd") or shutil.which("npx")
        if not exe:
            raise PublishError("Para publicar online é preciso o Node.js (gratuito): https://nodejs.org — instale a versão LTS e reabra o app.")
        return exe

    def _run(self, *args, timeout=900):
        flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        p = subprocess.run([self._npx(), "--yes", WRANGLER, *args], capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=timeout, creationflags=flags,
                           env=node_env(WRANGLER_SEND_METRICS="false", CI="1"))
        return p.returncode, (p.stdout or "") + (p.stderr or "")

    def check_login(self):
        code, out = self._run("whoami", timeout=180)
        ok = code == 0 and "not authenticated" not in out.lower()
        m = re.search(r"associated with the email (\S+?)\.?\s*$", out, re.M)
        self.state.update(logged_in=ok, account=(m.group(1) if (m and ok) else None))
        return ok

    def login(self):
        if self._login_proc and self._login_proc.poll() is None:
            return {"ok": True, "message": "A página da Cloudflare já está aberta no navegador."}
        flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        self._login_proc = subprocess.Popen([self._npx(), "--yes", WRANGLER, "login"], creationflags=flags, env=node_env(),
                                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.state["login_open"] = True

        def wait():
            self._login_proc.wait()
            self.state["login_open"] = False
            if self.check_login():
                self.set("site_enabled", "1")
                self.kick.set()
        threading.Thread(target=wait, daemon=True).start()
        return {"ok": True, "message": "A Cloudflare abriu no navegador: entre (ou crie a conta grátis) e clique em Allow."}

    def _ensure_project(self):
        name = self.get("site_project")
        if not name:
            name = "lfn-" + slug(self.get("studio_name") or "leonida")
            self.set("site_project", name)
        code, out = self._run("pages", "project", "list", timeout=300)
        if code != 0:
            raise PublishError("Não consegui listar seus sites na Cloudflare: " + _clean(out))
        if not re.search(rf"(^|[\s│|]){re.escape(name)}([\s│|]|$)", out, re.M):
            # --force: create directly on Cloudflare Pages (wrangler 4.16x otherwise tries to delegate to
            # Workers and fails for prebuilt folders). Only needed once, at creation.
            code, out = self._run("pages", "project", "create", name, "--production-branch", "main", "--force", timeout=300)
            if code != 0 and "already exists" not in out.lower():
                raise PublishError("Não consegui criar o site na Cloudflare: " + _clean(out))
        return name

    # ------------------------------------------------------------ build
    def _front_end(self):
        g = self.site / "galeria"
        g.mkdir(parents=True, exist_ok=True)
        for f in (self.web / "galeria").iterdir():
            if f.suffix in (".js", ".css"):
                shutil.copy2(f, g / f.name)
        html = (self.web / "galeria" / "index.html").read_text("utf-8")
        html = re.sub(r'\s*<link rel="preload" href="/api/catalog"[^>]*>', '\n  <link rel="preload" href="/catalog.json" as="fetch" crossorigin/>', html)
        html = re.sub(r'\s*<a [^>]*nav-studio[^>]*>.*?</a>', "", html, flags=re.S)
        inject = ('<script>window.LFN_PUBLIC=true;window.LFN_CATALOG="/catalog.json";'
                  f'window.LFN_TILE_BASE="{TILE_BASE}";</script>\n  ')
        html = html.replace("<script", inject + "<script", 1)
        (g / "index.html").write_text(html, "utf-8")
        shutil.copytree(self.web / "vendor", self.site / "vendor", dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns("leonida-places.json", "app.ico"))
        self._map()
        (self.site / "index.html").write_text(
            '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/galeria/">'
            '<link rel="canonical" href="/galeria/"><title>Galeria</title><a href="/galeria/">Abrir a galeria</a>', "utf-8")
        (self.site / "_headers").write_text(
            "/photos/*\n  Cache-Control: public, max-age=86400\n"
            "/catalog.json\n  Cache-Control: no-cache\n"
            "/map/config.js\n  Cache-Control: no-cache\n"
            "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: same-origin\n", "utf-8")

    def _map(self):
        """Official map tiles go along with the site; without them the gallery falls back to Open GTA 6 Map."""
        dst = self.site / "map"
        cfg = self.map_dir / "config.js"
        if cfg.is_file():
            old = (dst / "config.js").read_text("utf-8") if (dst / "config.js").is_file() else None
            if old != cfg.read_text("utf-8"):
                shutil.rmtree(dst, ignore_errors=True)
                shutil.copytree(self.map_dir, dst)
        else:
            shutil.rmtree(dst, ignore_errors=True)
            dst.mkdir(parents=True, exist_ok=True)
            (dst / "config.js").write_text("window.LFN_MAP_IMG=null;\n", "utf-8")

    def _sync_files(self, files):
        wanted = set()
        for src, rel in files:
            dst = self.site / rel
            wanted.add(dst.parent.name)
            if dst.exists() and dst.stat().st_size and dst.stat().st_mtime >= src.stat().st_mtime:
                continue
            dst.parent.mkdir(parents=True, exist_ok=True)
            if src.stat().st_size > PAGES_FILE_LIMIT:
                try:
                    from PIL import Image
                    with Image.open(src) as im:
                        im.convert("RGB").save(dst, "JPEG", quality=97, subsampling=0, optimize=True)
                except ImportError:
                    raise PublishError(f"{src.name} passa de 25 MB; instale o Pillow para converter.")
            else:
                shutil.copy2(src, dst)
        photos = self.site / "photos"
        if photos.exists():
            for d in photos.iterdir():
                if d.is_dir() and d.name not in wanted:
                    shutil.rmtree(d, ignore_errors=True)

    def signature(self, catalog):
        body = json.dumps({k: v for k, v in catalog.items() if k != "generated_at"}, sort_keys=True, ensure_ascii=False)
        h = hashlib.sha256(body.encode("utf-8"))
        for f in sorted((self.web / "galeria").iterdir()) + sorted((self.web / "vendor").glob("*.*")):
            if f.is_file():
                h.update(f.name.encode()); h.update(str(f.stat().st_mtime_ns).encode())
        cfg = self.map_dir / "config.js"
        h.update(cfg.read_bytes() if cfg.is_file() else b"no-map")
        return h.hexdigest()

    # ------------------------------------------------------------ deploy
    def publish_now(self, force=False):
        with self.lock:
            self.state.update(deploying=True, last_error=None)
            try:
                catalog, files = self.build_public()
                sig = self.signature(catalog)
                if not force and sig == self.get("site_last_sig"):
                    return {"ok": True, "message": "O site já está atualizado.", "url": self.get("site_url")}
                if not self.check_login():
                    raise PublishError("Conecte a Cloudflare em Meu estúdio → Galeria online.")
                self.site.mkdir(parents=True, exist_ok=True)
                self._front_end()
                self._sync_files(files)
                tmp = self.site / "catalog.tmp"
                tmp.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), "utf-8")
                os.replace(tmp, self.site / "catalog.json")
                name = self._ensure_project()
                code, out = self._run("pages", "deploy", str(self.site), "--project-name", name, "--branch", "main",
                                      "--commit-dirty=true", timeout=3600)
                if code != 0:
                    raise PublishError("Falha ao enviar: " + _clean(out))
                m = re.search(r"https://[a-z0-9]+\.([a-z0-9-]+\.pages\.dev)", out)
                url = "https://" + (m.group(1) if m else f"{name}.pages.dev")
                self.set("site_url", url)
                self.set("site_last_sig", sig)
                self.set("site_last_deploy", now_iso())
                self.set("site_published_count", str(len(catalog["photos"])))
                return {"ok": True, "message": f"Galeria online atualizada: {url}", "url": url}
            except Exception as e:
                self.state["last_error"] = str(e)
                self._next_try = time.time() + RETRY_AFTER_ERROR
                raise
            finally:
                self.state["deploying"] = False

    def loop(self):
        """Watches the archive; when anything public changes, rebuilds and deploys."""
        time.sleep(15)
        while True:
            self.kick.wait(CHECK_EVERY)
            forced = self.kick.is_set()
            self.kick.clear()
            if self.get("site_enabled") != "1":
                continue
            if not forced and time.time() < self._next_try:
                continue
            try:
                catalog, _ = self.build_public()
                pending = self.signature(catalog) != self.get("site_last_sig")
                self.state["pending"] = pending
                if pending:
                    time.sleep(8)  # let a burst of imports/edits settle into a single deploy
                    self.publish_now()
                    self.state["pending"] = False
            except Exception as e:
                self.state["last_error"] = str(e)

    def status(self):
        return {**self.state, "enabled": self.get("site_enabled") == "1", "url": self.get("site_url") or None,
                "project": self.get("site_project") or None, "last_deploy": self.get("site_last_deploy") or None,
                "published_count": int(self.get("site_published_count") or 0)}
