#!/usr/bin/env python3
"""Leonida Lens — local-only gallery companion for PS5 captures.
Standard library server; Pillow is optional for efficient thumbnails.
Optional experimental Sony cloud bridge; PSN login is off by default.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import shutil
import sqlite3
import sys
import tempfile
import threading
import time
import traceback
import uuid
import webbrowser
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlsplit
from psn_bridge import PSNBridge, PSNError
from backup import BackupManager
from publisher import SitePublisher, PublishError
import map_official
from version import __version__

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
DATA = Path(os.environ.get("LEONIDA_DATA_DIR", str(Path.home() / "LeonidaFieldNotes"))).expanduser().resolve()
ORIGINALS = DATA / "originals"
THUMBS = DATA / "thumbnails"
DB_PATH = DATA / "library.sqlite3"
VALID_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_UPLOAD = 80 * 1024 * 1024
DB_LOCK = threading.RLock()
STATE_LOCK = threading.RLock()
STATE = {"scanning": False, "last_scan": None, "last_added": 0, "last_checked": 0,
         "total_added_since_start": 0, "error": None, "status": "Aguardando pasta"}
SCAN_EVENT = threading.Event()
PSN_BRIDGE = None
BACKUP = None
SITE = None
PSN_SYNC_JOB = threading.Event()
PREVIEWS = DATA / "previews"
TILE_CACHE = DATA / "map_tiles"
TILE_ORIGIN = "https://fbritoferreira.github.io/gta6/tiles/"  # Open GTA 6 Map, CC BY 4.0
TILE_RE = re.compile(r"/tiles/(day|night)/([0-5])/([0-5]),(\d{1,3}),(\d{1,3})\.webp")
MAP_OFFICIAL = DATA / "map_official"   # tiles of Rockstar's Leonida poster, built by map_official.py
MAP_TILE_RE = re.compile(r"/map/([0-7])/(-?\d{1,4})_(-?\d{1,4})\.webp")
PREVIEW_EDGE = 2560
PREVIEW_LOCK = threading.Lock()

try:
    from PIL import Image, ImageOps
except ImportError:
    Image = None
    ImageOps = None


def iso_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def db():
    conn = sqlite3.connect(str(DB_PATH), timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=15000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    for folder in (DATA, ORIGINALS, THUMBS, PREVIEWS, TILE_CACHE):
        folder.mkdir(parents=True, exist_ok=True)
    with DB_LOCK:
        with db() as cx:
            cx.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY, value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS photos (
                id TEXT PRIMARY KEY, sha256 TEXT NOT NULL UNIQUE,
                filename TEXT NOT NULL, stored_name TEXT NOT NULL,
                date_taken TEXT NOT NULL, imported_at TEXT NOT NULL,
                width INTEGER, height INTEGER,
                title TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '',
                rating INTEGER NOT NULL DEFAULT 0, favorite INTEGER NOT NULL DEFAULT 0,
                essay_id TEXT DEFAULT NULL
            );
            CREATE TABLE IF NOT EXISTS psn_imports (
                media_id TEXT PRIMARY KEY, photo_id TEXT NOT NULL,
                game TEXT NOT NULL, upload_date TEXT, imported_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS source_files (
                path TEXT PRIMARY KEY, size INTEGER NOT NULL, mtime_ns INTEGER NOT NULL,
                photo_id TEXT NOT NULL, seen_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS essays (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS journal (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, place TEXT NOT NULL DEFAULT '',
                day_at TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS ix_photos_taken ON photos(date_taken DESC);
            CREATE INDEX IF NOT EXISTS ix_photos_essay ON photos(essay_id);
            """)
            cols = {r["name"] for r in cx.execute("PRAGMA table_info(photos)")}
            for col in ("game_time", "weather"):  # v2.1 scene data (hora no jogo, clima)
                if col not in cols:
                    cx.execute(f"ALTER TABLE photos ADD COLUMN {col} TEXT NOT NULL DEFAULT ''")
            ecols = {r["name"] for r in cx.execute("PRAGMA table_info(essays)")}
            for col, ddl in (("published", "INTEGER NOT NULL DEFAULT 1"), ("genre", "TEXT NOT NULL DEFAULT ''"),
                             ("rules", "TEXT NOT NULL DEFAULT ''"), ("template_key", "TEXT NOT NULL DEFAULT ''")):
                if col not in ecols:  # v2.4 ensaios com pautas, gênero e publicação por ensaio
                    cx.execute(f"ALTER TABLE essays ADD COLUMN {col} {ddl}")
            cx.execute("""CREATE TABLE IF NOT EXISTS essay_slots (
                id TEXT PRIMARY KEY, essay_id TEXT NOT NULL REFERENCES essays(id) ON DELETE CASCADE,
                pos INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
                game_time TEXT NOT NULL DEFAULT '', weather TEXT NOT NULL DEFAULT '', phrase TEXT NOT NULL DEFAULT '',
                map_x REAL, map_y REAL, photo_id TEXT UNIQUE REFERENCES photos(id) ON DELETE SET NULL)""")
            cx.execute("CREATE INDEX IF NOT EXISTS ix_slots_essay ON essay_slots(essay_id, pos)")
            if "captured_at" not in cols:  # v2.3 hora real da captura (PSN/EXIF/arquivo) para ordenar
                cx.execute("ALTER TABLE photos ADD COLUMN captured_at TEXT DEFAULT NULL")
            if "public" not in cols:  # v2.2 "Publicar no site" (on by default)
                cx.execute("ALTER TABLE photos ADD COLUMN public INTEGER NOT NULL DEFAULT 1")
            for col in ("map_x", "map_y"):  # v2.1 position on the Leonida map (0..1024 map units)
                if col not in cols:
                    cx.execute(f"ALTER TABLE photos ADD COLUMN {col} REAL DEFAULT NULL")
            cx.commit()


def setting(key, default=""):
    with db() as cx:
        row = cx.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default


def set_setting(key, value):
    with DB_LOCK, db() as cx:
        cx.execute("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))
        cx.commit()


def safe_filename(filename):
    return (Path(filename).name or "captura").replace("\x00", "")[:220]


def date_from_filename_or_mtime(path: Path, name: str):
    # Supports filename components like 2026-11-21, 20261121, or YYYY_MM_DD.
    m = re.search(r"(?:19|20)\d{2}[-_.]?(?:0[1-9]|1[0-2])[-_.]?(?:0[1-9]|[12]\d|3[01])", name)
    if m:
        try:
            digits = re.sub(r"\D", "", m.group(0))
            return datetime.strptime(digits, "%Y%m%d").strftime("%Y-%m-%d")
        except ValueError:
            pass
    return datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y-%m-%d")


def to_utc_iso(value):
    """Aceita ISO (com ou sem fuso), datetime ou timestamp; devolve 'AAAA-MM-DDTHH:MM:SS+00:00' ou None."""
    if value is None or value == "":
        return None
    try:
        if isinstance(value, (int, float)):
            dt = datetime.fromtimestamp(float(value), timezone.utc)
        elif isinstance(value, datetime):
            dt = value
        else:
            text = str(value).strip().replace("Z", "+00:00")
            dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.astimezone()          # hora local do PC
        dt = dt.astimezone(timezone.utc)
        if not (2000 <= dt.year <= 2100):
            return None
        return dt.isoformat(timespec="seconds")
    except (ValueError, OSError, OverflowError):
        return None


def exif_capture(path):
    """DateTimeOriginal completo (data + hora) quando a imagem tiver EXIF."""
    if Image is None:
        return None
    try:
        with Image.open(path) as img:
            exif = img.getexif()
            raw = exif.get_ifd(0x8769).get(36867) if hasattr(exif, "get_ifd") else None
            raw = raw or exif.get(36867) or exif.get(306)
        if raw:
            return to_utc_iso(datetime.strptime(str(raw)[:19], "%Y:%m:%d %H:%M:%S"))
    except Exception:
        pass
    return None


def extract_meta(path, name):
    width = height = None
    date = date_from_filename_or_mtime(path, name)
    if Image is not None:
        try:
            with Image.open(path) as img:
                width, height = img.size
                exif = img.getexif()
                taken = exif.get(36867) or exif.get(306)
                if taken:
                    try:
                        date = datetime.strptime(str(taken)[:10], "%Y:%m:%d").strftime("%Y-%m-%d")
                    except ValueError:
                        pass
        except Exception:
            pass
    return date, width, height


def build_thumbnail(path, photo_id):
    if Image is None:
        return
    try:
        with Image.open(path) as src:
            src = ImageOps.exif_transpose(src)
            src.thumbnail((1000, 1000), Image.Resampling.LANCZOS)
            if src.mode == "RGBA":
                canvas = Image.new("RGB", src.size, "#151918")
                canvas.paste(src, mask=src.getchannel("A"))
                src = canvas
            elif src.mode != "RGB":
                src = src.convert("RGB")
            src.save(THUMBS / (photo_id + ".jpg"), "JPEG", quality=86, optimize=True)
    except Exception:
        pass


def ingest(path: Path, source_key=None, name=None, captured_at=None):
    """Copy an image into managed archive; returns (photo_id, newly_created)."""
    name = safe_filename(name or path.name)
    ext = Path(name).suffix.lower()
    if ext not in VALID_EXTS:
        raise ValueError("Formato não aceito. Use JPG, PNG ou WEBP.")
    if not path.is_file():
        raise ValueError("Arquivo não encontrado.")
    stat = path.stat()
    if stat.st_size < 10 or stat.st_size > MAX_UPLOAD:
        raise ValueError("Arquivo vazio ou superior a 80 MB.")
    sha = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            sha.update(chunk)
    digest = sha.hexdigest()
    with DB_LOCK:
        with db() as cx:
            existing = cx.execute("SELECT id FROM photos WHERE sha256=?", (digest,)).fetchone()
            if existing:
                photo_id = existing["id"]
                created = False
            else:
                photo_id = str(uuid.uuid4())
                stored_name = photo_id + ext
                dst = ORIGINALS / stored_name
                shutil.copy2(path, dst)
                taken, width, height = extract_meta(dst, name)
                # Hora real da captura: Sony (uploadDate) > EXIF > data do arquivo de origem.
                captured = to_utc_iso(captured_at) or exif_capture(dst) or (to_utc_iso(stat.st_mtime) if source_key else None)
                if captured:
                    taken = datetime.fromisoformat(captured).astimezone().strftime("%Y-%m-%d")
                cx.execute("""INSERT INTO photos(id,sha256,filename,stored_name,date_taken,imported_at,width,height,captured_at)
                           VALUES(?,?,?,?,?,?,?,?,?)""", (photo_id,digest,name,stored_name,taken,iso_now(),width,height,captured))
                created = True
            if source_key:
                cx.execute("""INSERT INTO source_files(path,size,mtime_ns,photo_id,seen_at) VALUES(?,?,?,?,?)
                       ON CONFLICT(path) DO UPDATE SET size=excluded.size,mtime_ns=excluded.mtime_ns,
                       photo_id=excluded.photo_id,seen_at=excluded.seen_at""",
                       (str(source_key),stat.st_size,stat.st_mtime_ns,photo_id,iso_now()))
            cx.commit()
        if created:
            build_thumbnail(ORIGINALS / (photo_id + ext), photo_id)
    return photo_id, created


def validate_watch_folder(path_str):
    path_str = path_str.strip().strip('"').strip("'")
    if not path_str:
        return ""
    folder = Path(os.path.expandvars(path_str)).expanduser().resolve()
    if not folder.is_dir():
        raise ValueError("A pasta não existe ou não está disponível neste computador.")
    if folder == DATA or DATA in folder.parents or folder in DATA.parents:
        raise ValueError("Selecione uma pasta separada dos arquivos internos do aplicativo.")
    return str(folder)


def scan_once():
    folder_path = setting("watch_folder")
    if not folder_path:
        with STATE_LOCK:
            STATE["status"] = "Escolha uma pasta para monitorar"
            STATE["error"] = None
        return
    folder = Path(folder_path)
    with STATE_LOCK:
        if STATE["scanning"]:
            return
        STATE["scanning"] = True
        STATE["status"] = "Verificando a pasta…"
        STATE["error"] = None
    scanned = 0
    added = 0
    errors = []
    try:
        if not folder.is_dir():
            raise OSError("A pasta monitorada não está acessível. Verifique o iCloud Drive ou o caminho.")
        paths = folder.rglob("*")  # Includes organized subfolders.
        for path in paths:
            try:
                if not path.is_file() or path.suffix.lower() not in VALID_EXTS:
                    continue
                scanned += 1
                st = path.stat()
                if st.st_size == 0 or st.st_size > MAX_UPLOAD:
                    continue
                # Avoid importing a partially syncing iCloud Drive file.
                if time.time() - st.st_mtime < 2:
                    continue
                source_key = str(path.resolve())
                with db() as cx:
                    existing = cx.execute("SELECT size,mtime_ns FROM source_files WHERE path=?", (source_key,)).fetchone()
                if existing and existing["size"] == st.st_size and existing["mtime_ns"] == st.st_mtime_ns:
                    continue
                _, created = ingest(path, source_key=source_key)
                added += int(created)
            except (OSError, ValueError) as e:
                if len(errors) < 3:
                    errors.append(f"{path.name}: {e}")
        with STATE_LOCK:
            STATE["last_scan"] = iso_now()
            STATE["last_added"] = added
            STATE["last_checked"] = scanned
            STATE["total_added_since_start"] += added
            STATE["status"] = f"Pasta verificada • {scanned} arquivos encontrados"
            STATE["error"] = "; ".join(errors) if errors else None
    except Exception as e:
        with STATE_LOCK:
            STATE["error"] = str(e)
            STATE["status"] = "Atenção: pasta indisponível"
    finally:
        with STATE_LOCK:
            STATE["scanning"] = False


def watcher():
    while True:
        scan_once()
        SCAN_EVENT.wait(14)
        SCAN_EVENT.clear()


def seen_psn(media_id):
    with db() as cx:
        return cx.execute("SELECT 1 FROM psn_imports WHERE media_id=?", (media_id,)).fetchone() is not None


def psn_capture_update(media_id, upload_date):
    """Fotos já importadas sem hora: completa captured_at com a data da Sony (sem baixar de novo)."""
    captured = to_utc_iso(upload_date)
    if not captured:
        return
    with DB_LOCK, db() as cx:
        row = cx.execute("SELECT photo_id FROM psn_imports WHERE media_id=?", (media_id,)).fetchone()
        if row:
            cx.execute("UPDATE photos SET captured_at=? WHERE id=? AND captured_at IS NULL", (captured, row["photo_id"]))
            cx.commit()


def remember_psn(media_id, photo_id, game, upload_date):
    with DB_LOCK, db() as cx:
        cx.execute("INSERT OR IGNORE INTO psn_imports VALUES(?,?,?,?,?)",
                   (media_id, photo_id, game, upload_date, iso_now()))
        cx.commit()


SYNC_ALL = {"running": False, "step": None, "result": None, "started": None, "finished": None}
SYNC_ALL_LOCK = threading.Lock()


def photo_count():
    with db() as cx:
        return cx.execute("SELECT COUNT(*) FROM photos").fetchone()[0]


def sync_all_worker():
    """Um botão: nuvem PlayStation -> pasta vigiada -> galeria online."""
    notes, before = [], photo_count()
    site = {"updated": False, "url": None}
    try:
        if PSN_BRIDGE and PSN_BRIDGE.state().get("connected"):
            SYNC_ALL["step"] = "cloud"
            if PSN_SYNC_JOB.is_set():
                for _ in range(600):
                    if not PSN_SYNC_JOB.is_set():
                        break
                    time.sleep(0.5)
            else:
                PSN_SYNC_JOB.set()
                try:
                    PSN_BRIDGE.sync()
                except PSNError as e:
                    notes.append(f"Nuvem PlayStation: {e}")
                except Exception:
                    notes.append("Nuvem PlayStation: erro inesperado.")
                finally:
                    PSN_SYNC_JOB.clear()
        else:
            notes.append("Nuvem PlayStation não conectada (veja Procedência).")
        if setting("watch_folder"):
            SYNC_ALL["step"] = "folder"
            for _ in range(120):
                with STATE_LOCK:
                    busy = STATE["scanning"]
                if not busy:
                    break
                time.sleep(0.5)
            scan_once()
        added = photo_count() - before
        st = SITE.status()
        if st["enabled"] or st["url"]:
            SYNC_ALL["step"] = "site"
            try:
                r = SITE.publish_now()
                site = {"updated": True, "url": r.get("url"), "message": r.get("message")}
            except PublishError as e:
                notes.append(f"Galeria online: {e}")
        else:
            notes.append("Galeria online ainda não conectada (Meu estúdio → Galeria online).")
        SYNC_ALL["result"] = {"added": added, "notes": notes, "site": site, "total": photo_count()}
    except Exception as e:
        traceback.print_exc()
        SYNC_ALL["result"] = {"added": photo_count() - before, "notes": notes + [f"Erro: {e}"], "site": site}
    finally:
        SYNC_ALL.update(running=False, step=None, finished=iso_now())


def start_sync_all():
    with SYNC_ALL_LOCK:
        if SYNC_ALL["running"]:
            return {"ok": True, "already": True, **SYNC_ALL}
        SYNC_ALL.update(running=True, step="start", result=None, started=iso_now(), finished=None)
    threading.Thread(target=sync_all_worker, daemon=True, name="sync-all").start()
    return {"ok": True, **SYNC_ALL}


def psn_sync_worker():
    global PSN_BRIDGE
    try:
        PSN_BRIDGE.sync()
    except PSNError as exc:
        print("[PSN experimental] Erro de sincronização:", str(exc))
    except Exception:
        print("[PSN experimental] Erro inesperado. Nenhum token foi exibido.")
    finally:
        PSN_SYNC_JOB.clear()


def start_psn_sync():
    if not PSN_BRIDGE or not PSN_BRIDGE.state()["connected"]:
        raise PSNError("Conecte primeiro sua conta Sony.")
    if PSN_SYNC_JOB.is_set():
        raise PSNError("Sincronização já solicitada. Aguarde a conclusão.")
    PSN_SYNC_JOB.set()
    threading.Thread(target=psn_sync_worker, daemon=True, name="psn-sync").start()


def psn_auto_watcher():
    # First auto-check is delayed to avoid surprise network access at startup.
    while True:
        time.sleep(900)
        if PSN_BRIDGE and PSN_BRIDGE.auto and PSN_BRIDGE.state()["connected"] and not PSN_SYNC_JOB.is_set():
            try:
                start_psn_sync()
            except PSNError:
                pass


def rows(sql, args=()):
    with db() as cx:
        return [dict(r) for r in cx.execute(sql, args).fetchall()]


def row_by_id(table, id_):
    if table not in ("photos", "essays", "journal"):
        return None
    with db() as cx:
        r = cx.execute(f"SELECT * FROM {table} WHERE id=?", (id_,)).fetchone()
        return dict(r) if r else None


def photo_json(photo):
    if photo is None:
        return None
    p = dict(photo)
    p.pop("sha256", None)
    p.pop("stored_name", None)
    p["favorite"] = bool(p["favorite"])
    p["public"] = bool(p.get("public", 1))
    p["sort_at"] = p.get("captured_at") or p.get("imported_at")
    p["thumb_url"] = "/api/thumb/" + p["id"]
    p["image_url"] = "/api/image/" + p["id"]
    return p


def photo_by_id(id_):
    return photo_json(row_by_id("photos", id_))


def preview_path(photo):
    """Lazily build a 2560px WebP for fast full-screen opening (originals stay untouched)."""
    if Image is None or not photo.get("width") or max(photo["width"], photo["height"] or 0) <= PREVIEW_EDGE:
        return None
    out = PREVIEWS / (photo["id"] + ".webp")
    if out.exists():
        return out
    with PREVIEW_LOCK:
        if out.exists():
            return out
        try:
            with Image.open(ORIGINALS / photo["stored_name"]) as src:
                img = ImageOps.exif_transpose(src)
                if img.mode not in ("RGB", "RGBA"):
                    img = img.convert("RGB")
                img.thumbnail((PREVIEW_EDGE, PREVIEW_EDGE), Image.Resampling.LANCZOS)
                tmp = out.with_suffix(".tmp")
                img.save(tmp, "WEBP", quality=90, method=4)
                os.replace(tmp, out)
            return out
        except Exception:
            return None


PLACES_CACHE = None


def place_coords(name):
    """Coordenadas de um lugar de Leonida pelo nome exato (lista do Open GTA 6 Map)."""
    global PLACES_CACHE
    if PLACES_CACHE is None:
        try:
            data = json.loads((WEB / "vendor" / "leonida-places.json").read_text("utf-8"))
            PLACES_CACHE = {p["n"].strip().lower(): (p["x"], p["y"]) for p in data.get("places", [])}
        except (OSError, ValueError):
            PLACES_CACHE = {}
    return PLACES_CACHE.get(str(name or "").strip().lower())


def slots_by_photo():
    return {r["photo_id"]: r for r in rows("SELECT * FROM essay_slots WHERE photo_id IS NOT NULL")}


def essays_with_slots():
    essays = rows("""SELECT e.*, (SELECT COUNT(*) FROM photos p WHERE p.essay_id=e.id) AS photo_count
                     FROM essays e ORDER BY e.created_at ASC""")
    slots = rows("SELECT * FROM essay_slots ORDER BY essay_id, pos")
    by = {}
    for sl in slots:
        sl["thumb_url"] = ("/api/thumb/" + sl["photo_id"]) if sl["photo_id"] else None
        by.setdefault(sl["essay_id"], []).append(sl)
    for e in essays:
        e["published"] = bool(e.get("published", 1))
        try:
            e["rules"] = json.loads(e.get("rules") or "[]")
        except ValueError:
            e["rules"] = []
        e["slots"] = by.get(e["id"], [])
        e["filled"] = sum(1 for sl in e["slots"] if sl["photo_id"])
    return essays


def seed_essays():
    """Cria os ensaios-pauta do arquivo lfn-ensaios.json (só os que ainda não existem)."""
    data = json.loads((WEB / "vendor" / "lfn-ensaios.json").read_text("utf-8"))
    have = {r["template_key"] for r in rows("SELECT template_key FROM essays") if r["template_key"]}
    created = 0
    base = datetime.now(timezone.utc)
    with DB_LOCK, db() as cx:
        for i, e in enumerate(data.get("essays", [])):
            key = e.get("key") or slugify_key(e.get("title"))
            if key in have:
                continue
            eid = str(uuid.uuid4())
            stamp = (base.replace(microsecond=0)).isoformat().replace("+00:00", f".{i:03d}+00:00")
            cx.execute("""INSERT INTO essays(id,title,description,created_at,published,genre,rules,template_key)
                          VALUES(?,?,?,?,0,?,?,?)""",
                       (eid, str(e.get("title", ""))[:110], str(e.get("manifesto", ""))[:1500], stamp,
                        str(e.get("genre", ""))[:60], json.dumps(e.get("rules", [])[:6], ensure_ascii=False), key))
            for pos, sl in enumerate(e.get("slots", [])):
                xy = place_coords(sl.get("location"))
                cx.execute("""INSERT INTO essay_slots(id,essay_id,pos,title,location,game_time,weather,phrase,map_x,map_y)
                              VALUES(?,?,?,?,?,?,?,?,?,?)""",
                           (str(uuid.uuid4()), eid, pos, str(sl.get("title", ""))[:140], str(sl.get("location", ""))[:120],
                            str(sl.get("game_time", ""))[:40], str(sl.get("weather", ""))[:60], str(sl.get("phrase", ""))[:2000],
                            xy[0] if xy else None, xy[1] if xy else None))
            created += 1
        cx.commit()
    return created


def refresh_templates():
    """Atualiza os ensaios-pauta existentes com a versão nova de lfn-ensaios.json, sem perder fotos.
    Fotos já colocadas continuam nas vagas; um campo da foto só muda se ainda for o texto da pauta antiga."""
    data = json.loads((WEB / "vendor" / "lfn-ensaios.json").read_text("utf-8"))
    by_key = {e.get("key"): e for e in data.get("essays", [])}
    stats = {"essays": 0, "slots": 0, "photos": 0}
    pairs = (("title", "title"), ("location", "location"), ("game_time", "game_time"), ("weather", "weather"), ("phrase", "notes"))
    with DB_LOCK, db() as cx:
        for e in cx.execute("SELECT * FROM essays WHERE template_key != ''").fetchall():
            new = by_key.get(e["template_key"])
            if not new:
                continue
            cx.execute("UPDATE essays SET description=?, rules=?, genre=? WHERE id=?",
                       (str(new.get("manifesto", ""))[:1500], json.dumps(new.get("rules", [])[:6], ensure_ascii=False),
                        str(new.get("genre", e["genre"]))[:60], e["id"]))
            stats["essays"] += 1
            slots = cx.execute("SELECT * FROM essay_slots WHERE essay_id=? ORDER BY pos", (e["id"],)).fetchall()
            for sl, ns in zip(slots, new.get("slots", [])):
                xy = place_coords(ns.get("location"))
                vals = {"title": str(ns.get("title", ""))[:140], "location": str(ns.get("location", ""))[:120],
                        "game_time": str(ns.get("game_time", ""))[:40], "weather": str(ns.get("weather", ""))[:60],
                        "phrase": str(ns.get("phrase", ""))[:2000]}
                cx.execute("UPDATE essay_slots SET title=?, location=?, game_time=?, weather=?, phrase=?, map_x=?, map_y=? WHERE id=?",
                           (*vals.values(), xy[0] if xy else None, xy[1] if xy else None, sl["id"]))
                stats["slots"] += 1
                if not sl["photo_id"]:
                    continue
                ph = cx.execute("SELECT * FROM photos WHERE id=?", (sl["photo_id"],)).fetchone()
                if not ph:
                    continue
                upd = {}
                for scol, pcol in pairs:
                    if (sl[scol] or "") and (ph[pcol] or "") == sl[scol]:   # ainda é o texto da pauta antiga
                        upd[pcol] = vals[scol]
                if sl["map_x"] is not None and ph["map_x"] == sl["map_x"] and ph["map_y"] == sl["map_y"]:
                    upd["map_x"], upd["map_y"] = (xy if xy else (None, None))
                if upd:
                    cx.execute(f"UPDATE photos SET {', '.join(f'{k}=?' for k in upd)} WHERE id=?", (*upd.values(), ph["id"]))
                    stats["photos"] += 1
        cx.commit()
    return stats


def slugify_key(text):
    return re.sub(r"[^a-z0-9]+", "-", str(text or "").lower()).strip("-")[:60] or str(uuid.uuid4())[:8]


def assign_slot(slot_id, photo_id):
    """Coloca a foto na vaga: herda título, local, hora, clima, frase e ponto no mapa (sem apagar o que já existe)."""
    with DB_LOCK, db() as cx:
        sl = cx.execute("SELECT * FROM essay_slots WHERE id=?", (slot_id,)).fetchone()
        ph = cx.execute("SELECT * FROM photos WHERE id=?", (photo_id,)).fetchone()
        if not sl or not ph:
            raise ValueError("Vaga ou foto não encontrada.")
        cx.execute("UPDATE essay_slots SET photo_id=NULL WHERE photo_id=?", (photo_id,))
        if sl["photo_id"] and sl["photo_id"] != photo_id:
            cx.execute("UPDATE photos SET essay_id=NULL WHERE id=? AND essay_id=?", (sl["photo_id"], sl["essay_id"]))
        cx.execute("UPDATE essay_slots SET photo_id=? WHERE id=?", (photo_id, slot_id))
        fill = {"essay_id": sl["essay_id"]}
        for col, src in (("title", "title"), ("location", "location"), ("game_time", "game_time"),
                         ("weather", "weather"), ("notes", "phrase")):
            if not (ph[col] or "").strip() and (sl[src] or "").strip():
                fill[col] = sl[src]
        if ph["map_x"] is None and sl["map_x"] is not None and (not (ph["location"] or "").strip() or fill.get("location")):
            fill["map_x"], fill["map_y"] = sl["map_x"], sl["map_y"]
        cols = ", ".join(f"{k}=?" for k in fill)
        cx.execute(f"UPDATE photos SET {cols} WHERE id=?", (*fill.values(), photo_id))
        cx.commit()


def clear_slot(slot_id):
    with DB_LOCK, db() as cx:
        sl = cx.execute("SELECT * FROM essay_slots WHERE id=?", (slot_id,)).fetchone()
        if not sl:
            raise ValueError("Vaga não encontrada.")
        if sl["photo_id"]:
            cx.execute("UPDATE photos SET essay_id=NULL WHERE id=? AND essay_id=?", (sl["photo_id"], sl["essay_id"]))
        cx.execute("UPDATE essay_slots SET photo_id=NULL WHERE id=?", (slot_id,))
        cx.commit()


def profile():
    return {"studio_name": setting("studio_name"), "photographer": setting("photographer"),
            "onboarded": setting("onboarded") == "1"}


# Aparência: temas prontos (definidos em web/vendor/lfn-themes.js) + cor de destaque opcional.
# Estúdio e galeria podem ter temas diferentes; o tema da galeria viaja no catálogo (e no catalog.json publicado).
THEMES = ("codigo", "vice", "por-do-sol", "noite-azul", "papel", "verde")
HEX_COLOR = re.compile(r"#[0-9a-fA-F]{6}")


def theme_of(target):
    preset = setting("theme_" + target) or "codigo"
    accent = setting("accent_" + target)
    return {"preset": preset if preset in THEMES else "codigo",
            "accent": accent.lower() if HEX_COLOR.fullmatch(accent or "") else ""}


def theme_settings():
    return {"studio": theme_of("studio"), "gallery": theme_of("gallery"), "presets": list(THEMES)}


def save_theme(payload):
    for target in ("studio", "gallery"):
        part = payload.get(target)
        if part is None:
            continue
        if not isinstance(part, dict):
            raise ValueError("Tema inválido.")
        if "preset" in part:
            preset = str(part.get("preset") or "codigo")
            if preset not in THEMES:
                raise ValueError("Tema desconhecido: " + preset)
            set_setting("theme_" + target, preset)
        if "accent" in part:
            accent = str(part.get("accent") or "").strip()
            if accent and not HEX_COLOR.fullmatch(accent):
                raise ValueError("Cor de destaque inválida (use #RRGGBB).")
            set_setting("accent_" + target, accent.lower())
    return theme_settings()


def public_slots(visible_ids):
    """Pautas por ensaio para a Galeria: as vazias aparecem como "imagem latente" até receber a foto."""
    out = {}
    for sl in rows("SELECT * FROM essay_slots ORDER BY essay_id, pos"):
        out.setdefault(sl["essay_id"], []).append({
            "pos": sl["pos"], "title": sl["title"], "phrase": sl["phrase"], "location": sl["location"],
            "game_time": sl["game_time"], "weather": sl["weather"],
            "photo_id": sl["photo_id"] if sl["photo_id"] in visible_ids else None})
    return out


def essay_public_fields(e, slots):
    try:
        rules = json.loads(e.get("rules") or "[]")
    except ValueError:
        rules = []
    return {"id": e["id"], "title": e["title"], "description": e["description"], "created_at": e["created_at"],
            "genre": e.get("genre") or "", "rules": rules[:6], "slots": slots.get(e["id"], [])}


def gallery_catalog(public_only=False):
    photos = []
    slot_of = slots_by_photo()
    essays_rows = rows("SELECT id,title,description,created_at,published,genre,rules FROM essays ORDER BY created_at DESC")
    live = {e["id"] for e in essays_rows if e["published"] or not public_only}
    for p in rows("SELECT * FROM photos ORDER BY date_taken DESC, COALESCE(captured_at, imported_at) DESC"):
        if public_only and not p.get("public", 1):
            continue
        w, h = p["width"] or 1920, p["height"] or 1080
        big = Image is not None and p["width"] and max(w, h) > PREVIEW_EDGE
        ext = Path(p["stored_name"]).suffix.lower()
        name = re.sub(r"[^a-zA-Z0-9]+", "-", p["title"] or "").strip("-").lower()[:60] or p["id"][:8]
        photos.append({
            "id": p["id"], "title": p["title"], "caption": p["notes"], "location": p["location"],
            "game_time": p.get("game_time") or "", "weather": p.get("weather") or "",
            "taken_on": p["date_taken"], "published_at": p["imported_at"], "essay_id": p["essay_id"],
            "captured_at": p.get("captured_at") or p["imported_at"],
            "favorite": bool(p["favorite"]), "rating": p["rating"], "filename": p["filename"],
            "width": w, "height": h, "map_x": p.get("map_x"), "map_y": p.get("map_y"),
            "original": "/api/image/" + p["id"], "thumb": "/api/thumb/" + p["id"],
            "preview": ("/api/preview/" + p["id"]) if big else "/api/image/" + p["id"],
            "preview_width": round(w * PREVIEW_EDGE / max(w, h)) if big else w,
            "download_name": f"leonida-{name}{ext}",
            "essay_pos": slot_of[p["id"]]["pos"] if p["id"] in slot_of else None,
        })
        if photos[-1]["essay_id"] not in live:
            photos[-1]["essay_id"] = None
    slots = public_slots({ph["id"] for ph in photos})
    essays = [essay_public_fields(e, slots) for e in essays_rows if e["id"] in live]
    return {"generated_at": iso_now(), "profile": profile(), "theme": theme_of("gallery"), "photos": photos, "essays": essays}


def accession_numbers(photos):
    """Same rule as the front-ends (buildAccessions): LFN-AAAA-NNNN by capture date, then import time, then id."""
    out, seq = {}, {}
    for p in sorted(photos, key=lambda r: (r["date_taken"] or "", r.get("captured_at") or r["imported_at"] or "", str(r["id"]))):
        d = p["date_taken"] or ""
        y = d[:4] if re.match(r"^\d{4}", d) else "0000"
        seq[y] = seq.get(y, 0) + 1
        out[p["id"]] = f"LFN-{y}-{seq[y]:04d}"
    return out


def public_build():
    """Catalog + files for the public site: only photos marked public; numbering from the WHOLE archive."""
    all_rows = rows("SELECT * FROM photos")
    acc = accession_numbers(all_rows)
    essays_all = rows("SELECT id,title,description,created_at,genre,published,rules FROM essays")
    published_ids = {e["id"] for e in essays_all if e["published"]}
    serie = {e["id"]: f"SÉRIE {i + 1:02d}" for i, e in
             enumerate(sorted(essays_all, key=lambda e: (e["created_at"] or "", str(e["id"]))))}
    local = {ph["id"]: ph for ph in gallery_catalog()["photos"]}
    photos, files = [], []
    for r in sorted(all_rows, key=lambda r: (r["date_taken"] or "", r.get("captured_at") or r["imported_at"] or ""), reverse=True):
        if not r.get("public", 1):
            continue
        src = ORIGINALS / r["stored_name"]
        if not src.exists():
            continue
        ph = dict(local[r["id"]])
        base = f"photos/{r['id']}/"
        ext = Path(r["stored_name"]).suffix.lower()
        orig_name = "original" + (ext if src.stat().st_size <= 25 * 1024 * 1024 else ".jpg")
        files.append((src, base + orig_name))
        ph["original"] = "/" + base + orig_name
        thumb = THUMBS / (r["id"] + ".jpg")
        if thumb.exists():
            files.append((thumb, base + "thumb.jpg"))
            ph["thumb"] = "/" + base + "thumb.jpg"
        else:
            ph["thumb"] = ph["original"]
        prev = preview_path(r)
        if prev:
            files.append((prev, base + "preview.webp"))
            ph["preview"] = "/" + base + "preview.webp"
        else:
            ph["preview"], ph["preview_width"] = ph["original"], ph["width"]
        ph["accession"] = acc[r["id"]]
        ph.pop("rating", None)
        if ph.get("essay_id") not in published_ids:
            ph["essay_id"] = None
        photos.append(ph)
    used = {ph["essay_id"] for ph in photos if ph["essay_id"]}
    slots = public_slots({ph["id"] for ph in photos})
    # ensaios publicados aparecem mesmo sem fotos: as pautas vazias despertam a curiosidade do visitante
    essays = [{**essay_public_fields(e, slots), "serie": serie[e["id"]]} for e in essays_all if e["id"] in published_ids]
    prof = profile()
    catalog = {"generated_at": iso_now(), "public": True,
               "profile": {"studio_name": prof["studio_name"]},  # sem nome de personagem no site
               "theme": theme_of("gallery"),
               "photos": photos, "essays": essays}
    return catalog, files


def backfill_media():
    """Photos imported before Pillow was installed have no size/thumbnail: fix them in background."""
    if Image is None:
        return
    for p in rows("SELECT id, stored_name, filename, width FROM photos"):
        src = ORIGINALS / p["stored_name"]
        if not src.exists():
            continue
        if not p["width"]:
            _, w, h = extract_meta(src, p["filename"])
            if w:
                with DB_LOCK, db() as cx:
                    cx.execute("UPDATE photos SET width=?, height=? WHERE id=?", (w, h, p["id"]))
                    cx.commit()
        if not (THUMBS / (p["id"] + ".jpg")).exists():
            build_thumbnail(src, p["id"])


def cached_tile(path):
    """Map tiles are downloaded once from Open GTA 6 Map and then served offline from disk."""
    m = TILE_RE.fullmatch(path)
    if not m or m.group(2) != m.group(3):
        return None
    style, z, _, y, x = m.groups()
    out = TILE_CACHE / style / z / f"{z},{y},{x}.webp"
    if out.exists():
        return out
    import urllib.request
    import urllib.error
    try:
        req = urllib.request.Request(f"{TILE_ORIGIN}{style}/{z}/{z},{y},{x}.webp",
                                     headers={"User-Agent": "LeonidaLens/2.1"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = resp.read(4 * 1024 * 1024)
            if resp.status != 200 or not data.startswith(b"RIFF"):
                return None
    except (urllib.error.URLError, OSError, ValueError):
        return None
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(f".{threading.get_ident()}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, out)
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "LeonidaLens/2.1"

    def log_message(self, fmt, *args):
        if not self.path.startswith("/api/status"):
            print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def fail(self, msg, status=400):
        self.send_json({"error": str(msg)}, status)

    def send_json(self, obj, status=200):
        b = json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(b)

    def read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if length < 1 or length > 1024 * 1024:
            raise ValueError("Dados inválidos ou muito grandes.")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def send_file(self, path: Path, mime=None, cache=False, download=None):
        if not path.is_file():
            return self.fail("Arquivo não encontrado.", 404)
        try:
            size = path.stat().st_size
            self.send_response(200)
            self.send_header("Content-Type", mime or mimetypes.guess_type(path.name)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(size))
            self.send_header("Cache-Control", "private, max-age=3600" if cache else "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            if download:
                self.send_header("Content-Disposition", "attachment; filename*=UTF-8''" + quote(download))
            self.end_headers()
            with path.open("rb") as f:
                shutil.copyfileobj(f, self.wfile)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/health":
            return self.send_json({"ok": True, "version": __version__, "data_dir": str(DATA)})
        if path == "/api/status":
            with STATE_LOCK:
                status = dict(STATE)
            with db() as cx:
                status["total_photos"] = cx.execute("SELECT COUNT(*) FROM photos").fetchone()[0]
            status["watch_folder"] = setting("watch_folder")
            status["thumbnails_enabled"] = Image is not None
            return self.send_json(status)
        if path == "/api/psn/status":
            return self.send_json(PSN_BRIDGE.state())
        if path == "/api/profile":
            return self.send_json(profile())
        if path == "/api/theme":
            return self.send_json(theme_settings())
        if path == "/api/backup/restore-status":
            return self.send_json(BACKUP.restore_state)
        if path == "/api/backup/find-folders":
            return self.send_json(BACKUP.find_folders())
        if path == "/api/sync-all":
            return self.send_json(SYNC_ALL)
        if path == "/api/site/status":
            return self.send_json(SITE.status())
        if path == "/api/backup/status":
            return self.send_json(BACKUP.status())
        if path == "/api/backup/full":
            return self.send_backup_zip()
        if path == "/api/catalog":
            return self.send_json(gallery_catalog(public_only="publico=1" in (urlsplit(self.path).query or "")))
        if path.startswith("/api/preview/"):
            photo = row_by_id("photos", path.rsplit("/", 1)[-1])
            if not photo:
                return self.fail("Fotografia não encontrada.", 404)
            prev = preview_path(photo)
            return self.send_file(prev or (ORIGINALS / photo["stored_name"]), cache=True)
        if path == "/map/config.js":
            cfg = MAP_OFFICIAL / "config.js"
            if cfg.is_file():
                return self.send_file(cfg, "application/javascript; charset=utf-8")
            b = map_official.EMPTY_CONFIG.encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(b)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(b)
            return
        if path.startswith("/map/"):
            m = MAP_TILE_RE.fullmatch(path)
            if not m:
                return self.fail("Tile inválido.", 404)
            return self.send_file(MAP_OFFICIAL / m.group(1) / f"{m.group(2)}_{m.group(3)}.webp", "image/webp", cache=True)
        if path.startswith("/tiles/"):
            tile = cached_tile(path)
            if not tile:
                return self.fail("Tile indisponível (sem internet na primeira visualização?).", 404)
            return self.send_file(tile, "image/webp", cache=True)
        if path in ("/galeria", "/galeria/"):
            if path == "/galeria":
                self.send_response(301); self.send_header("Location", "/galeria/"); self.end_headers(); return
            return self.send_file(WEB / "galeria" / "index.html", "text/html; charset=utf-8")
        if re.fullmatch(r"/galeria/[a-z0-9_-]+\.(js|css)", path):
            return self.send_file(WEB / path.lstrip("/"), "application/javascript; charset=utf-8" if path.endswith(".js") else "text/css; charset=utf-8")
        if path == "/api/photos":
            photos = [photo_json(p) for p in rows("SELECT * FROM photos ORDER BY date_taken DESC, COALESCE(captured_at, imported_at) DESC LIMIT 4000")]
            return self.send_json({"photos": photos})
        if path.startswith("/api/image/") or path.startswith("/api/thumb/"):
            id_ = path.rsplit("/", 1)[-1]
            photo = row_by_id("photos", id_)
            if not photo:
                return self.fail("Fotografia não encontrada.", 404)
            src = ORIGINALS / photo["stored_name"]
            if path.startswith("/api/thumb/"):
                thumb = THUMBS / (id_ + ".jpg")
                return self.send_file(thumb if thumb.exists() else src, cache=True)
            if "download=1" in (urlsplit(self.path).query or ""):
                return self.send_file(src, cache=True, download=safe_filename(photo["filename"]))
            return self.send_file(src, cache=True)
        if path == "/api/essays":
            return self.send_json({"essays": essays_with_slots()})
        if path == "/api/essays-legacy":
            return self.send_json({"essays": rows("""SELECT e.*, COUNT(p.id) AS photo_count,
               (SELECT id FROM photos WHERE essay_id=e.id ORDER BY date_taken DESC LIMIT 1) AS cover_id
               FROM essays e LEFT JOIN photos p ON p.essay_id=e.id GROUP BY e.id ORDER BY e.created_at DESC""")})
        if path == "/api/journal":
            return self.send_json({"entries": rows("SELECT * FROM journal ORDER BY day_at DESC,created_at DESC")})
        if path == "/api/export":
            return self.export_json()
        if path in ("/", "/index.html"):
            return self.send_file(WEB / "index.html", "text/html; charset=utf-8")
        allowed = {"/style.css": "text/css; charset=utf-8", "/app.js": "application/javascript; charset=utf-8",
                   "/onboarding.js": "application/javascript; charset=utf-8"}
        if path in allowed:
            return self.send_file(WEB / path.lstrip("/"), allowed[path])
        if path.startswith("/vendor/"):
            target = (WEB / unquote(path).lstrip("/")).resolve()
            if (WEB / "vendor").resolve() in target.parents and target.suffix in (".js", ".css", ".png", ".json", ".woff2"):
                mime = {".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
                        ".json": "application/json; charset=utf-8", ".woff2": "font/woff2"}.get(target.suffix)
                return self.send_file(target, mime, cache=target.suffix in (".woff2", ".png"))  # css/js/json sempre atualizados
        return self.fail("Página não encontrada.", 404)

    def export_json(self):
        contents = {"app": "Leonida Lens", "version": 1, "exported_at": iso_now(),
                    "photos": [photo_json(p) for p in rows("SELECT * FROM photos ORDER BY date_taken DESC")],
                    "essays": rows("SELECT * FROM essays"),
                    "journal": rows("SELECT * FROM journal")}
        data = json.dumps(contents, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Disposition", 'attachment; filename="leonida-lens-export.json"')
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        path = urlsplit(self.path).path
        try:
            origin = self.headers.get("Origin")
            host = self.headers.get("Host", "")
            if origin and not any(origin == f"http://{h}" for h in (host,)):
                return self.fail("Origem não autorizada.", 403)
            if path == "/api/import":
                return self.import_raw()
            if path == "/api/backup/restore":
                return self.restore_upload()
            payload = self.read_json()
            if path == "/api/profile":
                name = str(payload.get("studio_name", "")).strip()[:60]
                if "studio_name" in payload and len(name) < 2:
                    raise ValueError("Dê um nome ao seu estúdio (pelo menos 2 letras).")
                if "studio_name" in payload:
                    set_setting("studio_name", name)
                if "photographer" in payload:
                    set_setting("photographer", str(payload.get("photographer", "")).strip()[:60])
                if payload.get("onboarded"):
                    set_setting("onboarded", "1")
                return self.send_json(profile())
            if path == "/api/theme":
                return self.send_json(save_theme(payload))
            if path == "/api/sync-all":
                return self.send_json(start_sync_all())
            if path == "/api/essays/refresh-templates":
                return self.send_json({"ok": True, **refresh_templates(), "essays": essays_with_slots()})
            if path == "/api/essays/seed":
                return self.send_json({"ok": True, "created": seed_essays(), "essays": essays_with_slots()})
            m = re.fullmatch(r"/api/slots/([0-9a-f-]{36})/(assign|clear)", path)
            if m:
                if m.group(2) == "assign":
                    assign_slot(m.group(1), str(payload.get("photo_id", "")))
                else:
                    clear_slot(m.group(1))
                return self.send_json({"ok": True, "essays": essays_with_slots()})
            m = re.fullmatch(r"/api/essays/([0-9a-f-]{36})/(delete|add-slot)", path)
            if m:
                eid = m.group(1)
                if not row_by_id("essays", eid):
                    raise ValueError("Ensaio não encontrado.")
                with DB_LOCK, db() as cx:
                    if m.group(2) == "delete":
                        cx.execute("UPDATE photos SET essay_id=NULL WHERE essay_id=?", (eid,))
                        cx.execute("DELETE FROM essay_slots WHERE essay_id=?", (eid,))
                        cx.execute("DELETE FROM essays WHERE id=?", (eid,))
                    else:
                        pos = cx.execute("SELECT COALESCE(MAX(pos),-1)+1 FROM essay_slots WHERE essay_id=?", (eid,)).fetchone()[0]
                        cx.execute("INSERT INTO essay_slots(id,essay_id,pos) VALUES(?,?,?)", (str(uuid.uuid4()), eid, pos))
                    cx.commit()
                return self.send_json({"ok": True, "essays": essays_with_slots()})
            if path == "/api/site/login":
                return self.send_json(SITE.login())
            if path == "/api/site/enable":
                set_setting("site_enabled", "1" if payload.get("enabled") else "0")
                if payload.get("enabled"):
                    SITE.kick.set()
                return self.send_json(SITE.status())
            if path == "/api/site/publish":
                return self.send_json(SITE.publish_now(force=True))
            if path == "/api/backup/folder":
                folder = BACKUP.set_folder(str(payload.get("folder", "")))
                return self.send_json({"ok": True, "backup_folder": folder})
            if path == "/api/backup/run":
                return self.send_json(BACKUP.mirror())
            if path == "/api/backup/inspect-folder":
                return self.send_json(BACKUP.inspect_folder(str(payload.get("folder", ""))))
            if path == "/api/backup/restore-folder":
                return self.send_json(BACKUP.restore_folder(str(payload.get("folder", ""))))
            if path == "/api/backup/snapshot":
                return self.send_json({"ok": True, "file": BACKUP.snapshot("manual").name})
            if path == "/api/psn/connect":
                # NPSSO is NEVER logged, persisted, or returned in the response.
                return self.send_json(PSN_BRIDGE.connect(payload.get("npsso", "")))
            if path == "/api/psn/sync":
                start_psn_sync()
                return self.send_json({"ok":True,"message":"Sincronização iniciada."})
            if path == "/api/psn/disconnect":
                return self.send_json(PSN_BRIDGE.disconnect())
            if path == "/api/psn/options":
                return self.send_json(PSN_BRIDGE.set_options(auto=payload.get("auto"), only_gta=payload.get("only_gta")))
            if path == "/api/settings":
                folder = validate_watch_folder(str(payload.get("watch_folder", "")))
                set_setting("watch_folder", folder)
                SCAN_EVENT.set()
                return self.send_json({"ok": True, "watch_folder": folder})
            if path == "/api/scan":
                SCAN_EVENT.set()
                return self.send_json({"ok": True, "message": "Verificação solicitada."})
            if path == "/api/pick-folder":
                return self.pick_folder(str(payload.get("purpose") or ""))
            if path == "/api/essays":
                title = str(payload.get("title", "")).strip()[:110]
                if not title:
                    raise ValueError("Informe um título para o ensaio.")
                brief = str(payload.get("description", "")).strip()[:1500]
                essay_id = str(uuid.uuid4())
                with DB_LOCK, db() as cx:
                    cx.execute("INSERT INTO essays(id,title,description,created_at) VALUES(?,?,?,?)", (essay_id,title,brief,iso_now()))
                    cx.commit()
                return self.send_json({"ok": True, "essay": row_by_id("essays", essay_id)}, 201)
            if path == "/api/journal":
                title = str(payload.get("title", "")).strip()[:140]
                if not title:
                    raise ValueError("Escreva um título para o registro.")
                place = str(payload.get("place", "")).strip()[:130]
                day_at = str(payload.get("day_at", ""))[:10]
                try:
                    datetime.strptime(day_at, "%Y-%m-%d")
                except ValueError:
                    raise ValueError("Data inválida.")
                body = str(payload.get("body", ""))[:10000]
                id_ = str(uuid.uuid4())
                with DB_LOCK, db() as cx:
                    cx.execute("INSERT INTO journal(id,title,place,day_at,body,created_at) VALUES(?,?,?,?,?,?)", (id_, title, place, day_at, body, iso_now()))
                    cx.commit()
                return self.send_json({"ok": True, "entry": row_by_id("journal", id_)}, 201)
            return self.fail("Ação desconhecida.", 404)
        except (ValueError, json.JSONDecodeError, PSNError, PublishError) as e:
            return self.fail(str(e))
        except Exception:
            traceback.print_exc()
            return self.fail("Erro interno. Consulte o terminal do aplicativo.", 500)

    def do_PATCH(self):
        path = urlsplit(self.path).path
        try:
            origin = self.headers.get("Origin")
            host = self.headers.get("Host", "")
            if origin and origin != "http://" + host:
                return self.fail("Origem não autorizada.", 403)
            data = self.read_json()
            if path.startswith("/api/photos/"):
                id_ = path.rsplit("/", 1)[-1]
                if not row_by_id("photos", id_):
                    return self.fail("Foto não encontrada.", 404)
                allowed = {"title": 140, "location": 120, "notes": 6000, "tags": 400,
                           "game_time": 40, "weather": 60}
                edits = {k: str(data[k])[:maxlen] for k, maxlen in allowed.items() if k in data}
                if "favorite" in data:
                    edits["favorite"] = int(bool(data["favorite"]))
                if "public" in data:
                    edits["public"] = int(bool(data["public"]))
                if "rating" in data:
                    rating = int(data["rating"])
                    if not 0 <= rating <= 5:
                        raise ValueError("Nota deve ser de 0 a 5.")
                    edits["rating"] = rating
                if "map_x" in data or "map_y" in data:
                    mx, my = data.get("map_x"), data.get("map_y")
                    if mx is None or my is None or mx == "" or my == "":
                        edits["map_x"] = edits["map_y"] = None
                    else:
                        mx, my = float(mx), float(my)
                        if not (0 <= mx <= 1024 and 0 <= my <= 1024):
                            raise ValueError("Ponto fora do mapa de Leonida.")
                        edits["map_x"], edits["map_y"] = round(mx, 2), round(my, 2)
                if "essay_id" in data:
                    essay = data["essay_id"]
                    if essay is not None and not row_by_id("essays", str(essay)):
                        raise ValueError("Ensaio inválido.")
                    edits["essay_id"] = essay
                if edits:
                    with DB_LOCK, db() as cx:
                        cols = ", ".join(f"{k}=?" for k in edits)
                        cx.execute(f"UPDATE photos SET {cols} WHERE id=?", (*edits.values(), id_))
                        if "essay_id" in edits:  # mudou de ensaio pela ficha: libera a vaga antiga
                            cx.execute("UPDATE essay_slots SET photo_id=NULL WHERE photo_id=? AND essay_id IS NOT ?", (id_, edits["essay_id"]))
                        cx.commit()
                return self.send_json({"ok": True, "photo": photo_by_id(id_)})
            m = re.fullmatch(r"/api/essays/([0-9a-f-]{36})", path)
            if m:
                eid = m.group(1)
                if not row_by_id("essays", eid):
                    return self.fail("Ensaio não encontrado.", 404)
                edits = {k: str(data[k])[:n] for k, n in {"title": 110, "description": 1500, "genre": 60}.items() if k in data}
                if "title" in edits and not edits["title"].strip():
                    raise ValueError("O ensaio precisa de um título.")
                if "published" in data:
                    edits["published"] = int(bool(data["published"]))
                if edits:
                    with DB_LOCK, db() as cx:
                        cx.execute(f"UPDATE essays SET {', '.join(f'{k}=?' for k in edits)} WHERE id=?", (*edits.values(), eid))
                        cx.commit()
                return self.send_json({"ok": True, "essays": essays_with_slots()})
            m = re.fullmatch(r"/api/slots/([0-9a-f-]{36})", path)
            if m:
                sid = m.group(1)
                edits = {k: str(data[k])[:n] for k, n in {"title": 140, "location": 120, "game_time": 40, "weather": 60, "phrase": 2000}.items() if k in data}
                if "location" in edits:
                    xy = place_coords(edits["location"])
                    edits["map_x"], edits["map_y"] = (xy if xy else (None, None))
                if edits:
                    with DB_LOCK, db() as cx:
                        cx.execute(f"UPDATE essay_slots SET {', '.join(f'{k}=?' for k in edits)} WHERE id=?", (*edits.values(), sid))
                        cx.commit()
                return self.send_json({"ok": True, "essays": essays_with_slots()})
            if path.startswith("/api/journal/"):
                id_ = path.rsplit("/", 1)[-1]
                if not row_by_id("journal", id_):
                    return self.fail("Registro não encontrado.", 404)
                edits = {k: str(data[k])[:n] for k,n in {"title":140,"place":130,"day_at":10,"body":10000}.items() if k in data}
                if "day_at" in edits:
                    datetime.strptime(edits["day_at"], "%Y-%m-%d")
                if edits:
                    with DB_LOCK, db() as cx:
                        cols = ", ".join(f"{k}=?" for k in edits)
                        cx.execute(f"UPDATE journal SET {cols} WHERE id=?", (*edits.values(),id_))
                        cx.commit()
                return self.send_json({"ok": True, "entry": row_by_id("journal", id_)})
            return self.fail("Ação desconhecida.", 404)
        except (ValueError, json.JSONDecodeError, PSNError) as e:
            self.fail(str(e))
        except Exception:
            traceback.print_exc()
            self.fail("Erro interno. Consulte o terminal.", 500)

    def send_backup_zip(self):
        name = "leonida-backup-" + datetime.now().strftime("%Y-%m-%d_%H%M") + ".zip"
        self.send_response(200)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", f'attachment; filename="{name}"')
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        try:
            BACKUP.write_zip(self.wfile)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def restore_upload(self):
        size = int(self.headers.get("Content-Length", "0"))
        if size < 100:
            raise ValueError("Envie o arquivo .zip do backup.")
        fd, tmp_name = tempfile.mkstemp(suffix=".zip", dir=str(DATA / "backups"))
        os.close(fd)
        tmp = Path(tmp_name)
        try:
            with tmp.open("wb") as out:
                remaining = size
                while remaining:
                    chunk = self.rfile.read(min(4 * 1024 * 1024, remaining))
                    if not chunk:
                        raise ValueError("Envio interrompido.")
                    out.write(chunk)
                    remaining -= len(chunk)
            return self.send_json(BACKUP.restore_zip(tmp))
        finally:
            tmp.unlink(missing_ok=True)

    def import_raw(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 10 or size > MAX_UPLOAD:
                return self.fail("Arquivo inválido ou maior que 80 MB.", 413)
            name = safe_filename(unquote(self.headers.get("X-File-Name", "captura.jpg")))
            if Path(name).suffix.lower() not in VALID_EXTS:
                raise ValueError("Envie JPG, PNG ou WEBP.")
            with tempfile.NamedTemporaryFile(delete=False, suffix=Path(name).suffix) as tmp:
                path = Path(tmp.name)
                try:
                    remaining = size
                    while remaining:
                        chunk = self.rfile.read(min(1024*1024, remaining))
                        if not chunk:
                            raise ValueError("Upload interrompido.")
                        tmp.write(chunk)
                        remaining -= len(chunk)
                except Exception:
                    path.unlink(missing_ok=True)
                    raise
            modified = self.headers.get("X-File-Modified", "")
            captured = to_utc_iso(int(modified) / 1000) if modified.isdigit() else None
            try:
                photo_id, created = ingest(path, name=name, captured_at=captured)
            finally:
                path.unlink(missing_ok=True)
            self.send_json({"ok": True, "photo_id": photo_id, "created": created}, 201)
        except (ValueError, OSError) as e:
            self.fail(str(e))

    def pick_folder(self, purpose=""):
        try:
            import tkinter as tk
            from tkinter import filedialog
            window = tk.Tk()
            window.withdraw()
            window.attributes("-topmost", True)
            title = {"backup": "Escolha onde guardar os backups (HD externo, pendrive, OneDrive…)",
                     "restore": "Escolha a pasta do backup automático (a que contém LeonidaFieldNotes-Backup)"
                     }.get(purpose, "Escolha a pasta de capturas do PS5")
            path = filedialog.askdirectory(title=title, mustexist=True)
            window.destroy()
            if not path:
                return self.send_json({"ok": False, "cancelled": True})
            if purpose == "restore":  # só escolhe e confere; restaurar é outro passo
                try:
                    return self.send_json({"ok": True, **BACKUP.inspect_folder(path)})
                except ValueError as e:
                    return self.send_json({"ok": False, "folder": path, "error": str(e)})
            if purpose == "backup":
                folder = BACKUP.set_folder(path)
                threading.Thread(target=BACKUP.mirror, daemon=True).start()
                return self.send_json({"ok": True, "backup_folder": folder})
            folder = validate_watch_folder(path)
            set_setting("watch_folder", folder)
            SCAN_EVENT.set()
            return self.send_json({"ok": True, "watch_folder": folder})
        except Exception as e:
            return self.fail("Não foi possível abrir o seletor. Cole o caminho da pasta manualmente. " + str(e))


def already_running(port):
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=2) as r:
            return json.loads(r.read()).get("ok") is True
    except Exception:
        return False


def main():
    parser = argparse.ArgumentParser(description="Leonida Lens: local PS5 photo journal")
    parser.add_argument("--port", type=int, default=8767)
    parser.add_argument("--no-browser", action="store_true", help="não abrir a janela do app")
    parser.add_argument("--browser-tab", action="store_true", help="abrir numa aba do navegador em vez da janela de app")
    parser.add_argument("--windowed", action="store_true", help="janela maximizada em vez de tela cheia")
    args = parser.parse_args()
    DATA.mkdir(parents=True, exist_ok=True)
    if sys.stdout is None or sys.stderr is None:  # started with pythonw (no console): log to a file
        log = open(DATA / "app.log", "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stderr = log
    import desktop
    url = f"http://127.0.0.1:{args.port}"
    if already_running(args.port):  # second launch: just bring up the window
        if not args.no_browser:
            desktop.open_app_window(url, DATA / "app-window", fullscreen=not args.windowed)
        return
    init_db()
    global PSN_BRIDGE
    PSN_BRIDGE = PSNBridge(DATA, ingest, seen_psn, remember_psn)
    PSN_BRIDGE.update_capture = psn_capture_update
    threading.Thread(target=backfill_media, daemon=True, name="backfill").start()
    threading.Thread(target=map_official.ensure, args=(MAP_OFFICIAL, WEB, ROOT, DATA), daemon=True,
                     name="map-official").start()
    global BACKUP

    def after_restore():
        init_db()
        threading.Thread(target=backfill_media, daemon=True, name="backfill").start()
    BACKUP = BackupManager(DATA, DB_PATH, ORIGINALS, setting, set_setting, DB_LOCK, after_restore)
    threading.Thread(target=BACKUP.loop, daemon=True, name="backup-guardian").start()
    global SITE
    SITE = SitePublisher(DATA, WEB, setting, set_setting, public_build)
    threading.Thread(target=SITE.loop, daemon=True, name="site-sync").start()
    threading.Thread(target=psn_auto_watcher, daemon=True, name="psn-auto-watcher").start()
    threading.Thread(target=watcher, daemon=True, name="inbox-watcher").start()
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError as e:
        print("Não foi possível iniciar na porta", args.port, e, file=sys.stderr)
        sys.exit(1)
    url = f"http://127.0.0.1:{server.server_address[1]}"
    print("=" * 65)
    print("LEONIDA LENS  •  biblioteca local e privativa")
    print("Endereço:", url)
    print("Seus arquivos:", DATA)
    print("="*65, flush=True)
    # "shortcut_lens": recria uma vez os atalhos com o nome Leonida Lens (e apaga os do nome antigo)
    if sys.platform == "win32" and not args.no_browser and setting("shortcut_lens") != "1":
        icon = desktop.build_icon(ROOT / "web" / "vendor" / "app.ico")
        if desktop.create_shortcut(ROOT, icon):
            set_setting("shortcut_lens", "1")
    if not args.no_browser:
        if args.browser_tab:
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        else:
            def launch():
                proc = desktop.open_app_window(url, DATA / "app-window", fullscreen=not args.windowed)
                desktop.wait_and_quit(proc, lambda: threading.Thread(target=server.shutdown, daemon=True).start())
            threading.Thread(target=launch, daemon=True, name="app-window").start()
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        try:
            BACKUP.snapshot("ao-fechar")
        except Exception:
            pass
        print("Até logo. Arquivo preservado em", DATA, flush=True)


if __name__ == "__main__":
    main()
