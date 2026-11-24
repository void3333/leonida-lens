"""Data safety for Leonida Field Notes: automatic DB snapshots, full ZIP backups,
mirror to a backup folder (external drive / OneDrive) and restore.

Never included in any backup: Sony session tokens (private_psn_tokens.dpapi).
Regenerable caches (thumbnails, previews, map tiles) are skipped too.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import sqlite3
import tempfile
import threading
import time
import zipfile
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

FORMAT = 1
KEEP_SNAPSHOTS = 14
SNAPSHOT_EVERY = 6 * 3600
FOLDER_EVERY = 30 * 60
ORIGINAL_RE = re.compile(r"originals/([0-9a-f-]{36}\.(?:png|jpe?g|webp))", re.I)
BACKUP_DIRNAME = "LeonidaFieldNotes-Backup"
MACHINE_SETTINGS = ("watch_folder", "backup_folder", "last_folder_backup", "last_folder_backup_ts", "onboarded")


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def sqlite_copy(src: Path, dst: Path):
    """Consistent copy of a live SQLite database (safe while the app is writing)."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".partial")
    tmp.unlink(missing_ok=True)
    with closing(sqlite3.connect(str(src), timeout=30)) as a, closing(sqlite3.connect(str(tmp))) as b:
        a.backup(b)
    os.replace(tmp, dst)


class BackupManager:
    def __init__(self, data_dir: Path, db_path: Path, originals: Path, get_setting, set_setting,
                 db_lock, after_restore=None):
        self.data = data_dir
        self.db_path = db_path
        self.originals = originals
        self.snapshots = data_dir / "backups"
        self.get = get_setting
        self.set = set_setting
        self.lock = db_lock
        self.after_restore = after_restore
        self.job_lock = threading.Lock()
        self.state = {"running": False, "last_error": None}
        self.snapshots.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------ snapshots
    def snapshot(self, reason="auto"):
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        dst = self.snapshots / f"library-{stamp}-{reason}.sqlite3"
        sqlite_copy(self.db_path, dst)
        snaps = sorted(self.snapshots.glob("library-*.sqlite3"))
        for old in snaps[:-KEEP_SNAPSHOTS]:
            old.unlink(missing_ok=True)
        return dst

    def _last_snapshot_age(self):
        snaps = sorted(self.snapshots.glob("library-*.sqlite3"))
        return time.time() - snaps[-1].stat().st_mtime if snaps else None

    def loop(self):
        """Background: DB snapshot every 6 h, folder mirror every 30 min (if configured)."""
        time.sleep(20)
        while True:
            try:
                age = self._last_snapshot_age()
                if age is None or age > SNAPSHOT_EVERY:
                    self.snapshot("auto")
                folder = self.get("backup_folder")
                last = self.get("last_folder_backup_ts")
                if folder and (not last or time.time() - float(last) > FOLDER_EVERY):
                    self.mirror()
            except Exception as e:  # keep the guardian alive
                self.state["last_error"] = str(e)
            time.sleep(300)

    # ------------------------------------------------------------ manifest
    def manifest(self):
        with closing(sqlite3.connect(str(self.db_path), timeout=30)) as cx:
            count = lambda t: cx.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            info = {"photos": count("photos"), "essays": count("essays"), "journal": count("journal")}
        return {"app": "Leonida Field Notes", "format": FORMAT, "created_at": now_iso(),
                "studio_name": self.get("studio_name"), **info}

    # ------------------------------------------------------------ full zip
    def write_zip(self, fileobj):
        """Stream a complete backup (database + original photos) into fileobj."""
        with tempfile.TemporaryDirectory() as tmp:
            db_copy = Path(tmp) / "library.sqlite3"
            sqlite_copy(self.db_path, db_copy)
            with zipfile.ZipFile(fileobj, "w", allowZip64=True) as z:
                z.writestr("manifest.json", json.dumps(self.manifest(), ensure_ascii=False, indent=2))
                z.writestr("LEIA-ME.txt", "Backup do Leonida Field Notes.\r\nPara restaurar: abra o app > Meu estúdio > "
                                          "Restaurar backup e escolha este arquivo .zip.\r\n")
                z.write(db_copy, "library.sqlite3", compress_type=zipfile.ZIP_DEFLATED)
                for f in sorted(self.originals.iterdir()):
                    if f.is_file() and ORIGINAL_RE.fullmatch("originals/" + f.name):
                        z.write(f, "originals/" + f.name, compress_type=zipfile.ZIP_STORED)

    # ------------------------------------------------------------ folder mirror
    def set_folder(self, folder: str):
        folder = (folder or "").strip().strip('"')
        if not folder:
            self.set("backup_folder", "")
            return ""
        path = Path(os.path.expandvars(folder)).expanduser().resolve()
        if not path.is_dir():
            raise ValueError("A pasta de backup não existe ou não está conectada.")
        if path == self.data or self.data in path.parents:
            raise ValueError("Escolha uma pasta FORA dos dados do app (ex.: HD externo, pendrive ou OneDrive).")
        self.set("backup_folder", str(path))
        return str(path)

    def mirror(self):
        folder = self.get("backup_folder")
        if not folder:
            raise ValueError("Escolha primeiro uma pasta de backup.")
        if not self.job_lock.acquire(blocking=False):
            raise ValueError("Um backup já está em andamento.")
        try:
            self.state.update(running=True, last_error=None)
            root = Path(folder)
            if not root.is_dir():
                raise ValueError("A pasta de backup não está acessível (HD/pendrive desconectado?).")
            target = root / BACKUP_DIRNAME
            (target / "originals").mkdir(parents=True, exist_ok=True)
            copied = 0
            for f in self.originals.iterdir():  # incremental; never deletes from the backup
                if not f.is_file():
                    continue
                dst = target / "originals" / f.name
                if not dst.exists() or dst.stat().st_size != f.stat().st_size:
                    tmp = dst.with_suffix(dst.suffix + ".partial")
                    shutil.copy2(f, tmp)
                    os.replace(tmp, dst)
                    copied += 1
            sqlite_copy(self.db_path, target / "library.sqlite3")
            man = self.manifest()
            (target / "manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=2), "utf-8")
            self.set("last_folder_backup", now_iso())
            self.set("last_folder_backup_ts", str(time.time()))
            return {"ok": True, "copied": copied, "folder": str(target), "photos": man["photos"]}
        except Exception as e:
            self.state["last_error"] = str(e)
            raise
        finally:
            self.state["running"] = False
            self.job_lock.release()

    # ------------------------------------------------------------ restore
    def restore_zip(self, zip_path: Path):
        try:
            z = zipfile.ZipFile(zip_path)
        except zipfile.BadZipFile:
            raise ValueError("Arquivo inválido: escolha um .zip criado pelo Leonida Field Notes.") from None
        with z, tempfile.TemporaryDirectory() as tmp:
            names = set(z.namelist())
            if "library.sqlite3" not in names or "manifest.json" not in names:
                raise ValueError("Este .zip não é um backup do Leonida Field Notes.")
            man = json.loads(z.read("manifest.json").decode("utf-8"))
            if man.get("app") != "Leonida Field Notes" or int(man.get("format", 0)) > FORMAT:
                raise ValueError("Backup de versão desconhecida ou mais nova que este app.")
            db_tmp = Path(tmp) / "restore.sqlite3"
            with z.open("library.sqlite3") as src, db_tmp.open("wb") as out:
                shutil.copyfileobj(src, out)
            with closing(sqlite3.connect(str(db_tmp))) as cx:
                if cx.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise ValueError("O banco dentro do backup está corrompido.")
                cx.execute("SELECT id FROM photos LIMIT 1")
            safety = self.snapshot("antes-de-restaurar")
            restored = 0
            for name in names:  # only well-formed original photo names; no path traversal possible
                m = ORIGINAL_RE.fullmatch(name)
                if not m:
                    continue
                dst = self.originals / m.group(1)
                if not dst.exists():
                    with z.open(name) as src, open(dst.with_suffix(dst.suffix + ".partial"), "wb") as out:
                        shutil.copyfileobj(src, out)
                    os.replace(dst.with_suffix(dst.suffix + ".partial"), dst)
                    restored += 1
            # Settings that belong to THIS computer survive the restore.
            keep = {k: self.get(k) for k in MACHINE_SETTINGS}
            with self.lock:
                with closing(sqlite3.connect(str(db_tmp))) as src, closing(sqlite3.connect(str(self.db_path), timeout=30)) as live:
                    src.backup(live)
            for k, v in keep.items():
                if v:
                    self.set(k, v)
        if self.after_restore:
            self.after_restore()
        return {"ok": True, "photos": man.get("photos"), "files_restored": restored,
                "safety_snapshot": safety.name, "studio_name": man.get("studio_name")}

    # ------------------------------------------------------------ status
    def status(self):
        snaps = sorted(self.snapshots.glob("library-*.sqlite3"))
        size = sum(f.stat().st_size for f in self.originals.iterdir() if f.is_file())
        return {
            "data_dir": str(self.data), "originals_bytes": size,
            "snapshots": len(snaps),
            "last_snapshot": datetime.fromtimestamp(snaps[-1].stat().st_mtime, timezone.utc).isoformat(timespec="seconds") if snaps else None,
            "backup_folder": self.get("backup_folder"), "last_folder_backup": self.get("last_folder_backup") or None,
            **self.state,
        }
