"""Data safety for Leonida Lens: automatic DB snapshots, full ZIP backups,
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
        self.restore_state = {"running": False}
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
        return {"app": "Leonida Lens", "format": FORMAT, "created_at": now_iso(),
                "studio_name": self.get("studio_name"), **info}

    # ------------------------------------------------------------ full zip
    def write_zip(self, fileobj):
        """Stream a complete backup (database + original photos) into fileobj."""
        with tempfile.TemporaryDirectory() as tmp:
            db_copy = Path(tmp) / "library.sqlite3"
            sqlite_copy(self.db_path, db_copy)
            with zipfile.ZipFile(fileobj, "w", allowZip64=True) as z:
                z.writestr("manifest.json", json.dumps(self.manifest(), ensure_ascii=False, indent=2))
                z.writestr("LEIA-ME.txt", "Backup do Leonida Lens.\r\nPara restaurar: abra o app > Meu estúdio > "
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
    def _progress(self, **kw):
        self.restore_state.update(kw)

    @staticmethod
    def _check_manifest(man):
        if man.get("app") not in ("Leonida Lens", "Leonida Field Notes") or int(man.get("format", 0)) > FORMAT:
            raise ValueError("Backup de versão desconhecida ou mais nova que este app.")

    @staticmethod
    def _check_db(db_file: Path):
        with closing(sqlite3.connect(str(db_file))) as cx:
            if cx.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("O banco dentro do backup está corrompido.")
            cx.execute("SELECT id FROM photos LIMIT 1")

    def _install_db(self, db_tmp: Path):
        """Swap the live database for the restored one; settings of THIS computer survive."""
        keep = {k: self.get(k) for k in MACHINE_SETTINGS}
        with self.lock:
            with closing(sqlite3.connect(str(db_tmp))) as src, closing(sqlite3.connect(str(self.db_path), timeout=30)) as live:
                src.backup(live)
        for k, v in keep.items():
            if v or k == "onboarded":  # a restore never marks a new PC as "already set up"
                self.set(k, v or "")

    def _begin_restore(self, source):
        if not self.job_lock.acquire(blocking=False):
            raise ValueError("Já existe um backup ou restauração em andamento.")
        self.restore_state = {"running": True, "source": source, "phase": "Conferindo o backup…",
                              "done": 0, "total": 0, "error": None, "result": None}

    def _end_restore(self, result=None, error=None):
        self.restore_state.update(running=False, result=result, error=error,
                                  phase="Concluído" if result else "Falhou")
        self.job_lock.release()

    def restore_zip(self, zip_path: Path):
        self._begin_restore("zip")
        try:
            result = self._restore_zip(zip_path)
        except Exception as e:
            self._end_restore(error=str(e))
            raise
        self._end_restore(result)
        if self.after_restore:
            self.after_restore()
        return result

    def _restore_zip(self, zip_path: Path):
        try:
            z = zipfile.ZipFile(zip_path)
        except zipfile.BadZipFile:
            raise ValueError("Arquivo inválido: escolha um .zip criado pelo Leonida Lens.") from None
        with z, tempfile.TemporaryDirectory() as tmp:
            names = set(z.namelist())
            if "library.sqlite3" not in names or "manifest.json" not in names:
                raise ValueError("Este .zip não é um backup do Leonida Lens.")
            man = json.loads(z.read("manifest.json").decode("utf-8"))
            self._check_manifest(man)
            db_tmp = Path(tmp) / "restore.sqlite3"
            with z.open("library.sqlite3") as src, db_tmp.open("wb") as out:
                shutil.copyfileobj(src, out)
            self._check_db(db_tmp)
            safety = self.snapshot("antes-de-restaurar")
            wanted = sorted(n for n in names if ORIGINAL_RE.fullmatch(n))
            self._progress(phase="Copiando as fotos…", total=len(wanted), done=0)
            restored = 0
            for i, name in enumerate(wanted, 1):  # only well-formed original photo names; no path traversal possible
                dst = self.originals / ORIGINAL_RE.fullmatch(name).group(1)
                if not dst.exists():
                    part = dst.with_suffix(dst.suffix + ".partial")
                    with z.open(name) as src, open(part, "wb") as out:
                        shutil.copyfileobj(src, out)
                    os.replace(part, dst)
                    restored += 1
                self._progress(done=i)
            self._progress(phase="Instalando o banco de dados…")
            self._install_db(db_tmp)
        return {"ok": True, "photos": man.get("photos"), "files_restored": restored,
                "safety_snapshot": safety.name, "studio_name": man.get("studio_name"),
                "created_at": man.get("created_at")}

    # ------------------------------------------------------------ restore from a backup folder
    @staticmethod
    def resolve_backup_dir(folder: str) -> Path:
        """Accept the chosen folder itself or its LeonidaFieldNotes-Backup subfolder."""
        folder = (folder or "").strip().strip('"')
        if not folder:
            raise ValueError("Escolha a pasta onde está o backup.")
        path = Path(os.path.expandvars(folder)).expanduser()
        for cand in (path / BACKUP_DIRNAME, path):
            if (cand / "manifest.json").is_file() and (cand / "library.sqlite3").is_file():
                return cand.resolve()
        if not path.is_dir():
            raise ValueError("Essa pasta não existe ou não está acessível (HD/pendrive desconectado?).")
        raise ValueError(f"Não achei um backup nessa pasta. Escolha a pasta que contém “{BACKUP_DIRNAME}”.")

    @staticmethod
    def _originals_in(folder: Path):
        src = folder / "originals"
        if not src.is_dir():
            return []
        return sorted(f for f in src.iterdir() if f.is_file() and ORIGINAL_RE.fullmatch("originals/" + f.name))

    def inspect_folder(self, folder: str):
        target = self.resolve_backup_dir(folder)
        man = json.loads((target / "manifest.json").read_text("utf-8"))
        self._check_manifest(man)
        return {"ok": True, "folder": str(target), "studio_name": man.get("studio_name"), "photos": man.get("photos"),
                "essays": man.get("essays"), "created_at": man.get("created_at"), "files": len(self._originals_in(target))}

    def restore_folder(self, folder: str):
        target = self.resolve_backup_dir(folder)
        if target == self.data or self.data in target.parents:
            raise ValueError("Essa é a pasta do próprio app; escolha a pasta do backup.")
        self._begin_restore("folder")
        try:
            result = self._restore_folder(target)
        except Exception as e:
            self._end_restore(error=str(e))
            raise
        self._end_restore(result)
        if self.after_restore:
            self.after_restore()
        return result

    def _restore_folder(self, target: Path):
        man = json.loads((target / "manifest.json").read_text("utf-8"))
        self._check_manifest(man)
        with tempfile.TemporaryDirectory() as tmp:
            db_tmp = Path(tmp) / "restore.sqlite3"
            sqlite_copy(target / "library.sqlite3", db_tmp)
            self._check_db(db_tmp)
            safety = self.snapshot("antes-de-restaurar")
            wanted = self._originals_in(target)
            self._progress(phase="Copiando as fotos…", total=len(wanted), done=0)
            restored = 0
            for i, f in enumerate(wanted, 1):
                dst = self.originals / f.name
                if not dst.exists() or dst.stat().st_size != f.stat().st_size:
                    part = dst.with_suffix(dst.suffix + ".partial")
                    shutil.copy2(f, part)
                    os.replace(part, dst)
                    restored += 1
                self._progress(done=i)
            self._progress(phase="Instalando o banco de dados…")
            self._install_db(db_tmp)
        # The same folder keeps receiving the automatic backups on this PC (unless one was already chosen).
        if not self.get("backup_folder"):
            try:
                self.set_folder(str(target.parent))
            except ValueError:
                pass
        return {"ok": True, "photos": man.get("photos"), "files_restored": restored,
                "safety_snapshot": safety.name, "studio_name": man.get("studio_name"),
                "created_at": man.get("created_at"), "folder": str(target)}

    def find_folders(self, extra=()):
        """Look for automatic backups in the usual places (OneDrive, Google Drive, Dropbox, other drives)."""
        home = Path.home()
        roots = [os.environ.get(k) for k in ("OneDrive", "OneDriveConsumer", "OneDriveCommercial")]
        roots += list(extra)
        for pattern in ("OneDrive*", "Google Drive*", "Dropbox*", "*/My Drive", "*/Meu Drive"):
            roots += [str(p) for p in home.glob(pattern)]
        roots += [str(home / n) for n in ("Documents", "Desktop")]
        if os.name == "nt":
            import string
            for letter in string.ascii_uppercase[3:]:
                for sub in ("", "My Drive", "Meu Drive"):
                    roots.append(f"{letter}:/{sub}")
        found, seen = [], set()
        for r in roots:
            if not r:
                continue
            try:
                cand = Path(r) / BACKUP_DIRNAME
                if not (cand / "manifest.json").is_file():
                    continue
                key = str(cand.resolve()).lower()
                if key in seen:
                    continue
                seen.add(key)
                found.append(self.inspect_folder(str(cand)))
            except (OSError, ValueError):
                continue
        return {"folders": found}

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
