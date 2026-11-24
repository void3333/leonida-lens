#!/usr/bin/env python3
"""Run the app against a SAFE COPY of your real library — for testing changes.

    python tools/sandbox.py            # copy library (first time) and start on :8799
    python tools/sandbox.py --fresh    # re-copy the library from scratch
    python tools/sandbox.py --empty    # start with an empty library
    python tools/sandbox.py --port 8800

What the sandbox never does: publish to Cloudflare (site settings are wiped),
talk to the PSN (the token file is not copied), or write to your backup folder.
The real library (~/LeonidaFieldNotes) is only read, never modified.
"""
from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REAL = Path(os.environ.get("LEONIDA_DATA_DIR", str(Path.home() / "LeonidaFieldNotes"))).expanduser()
SANDBOX = ROOT / ".sandbox" / "data"
COPY_DIRS = ("originals", "thumbnails", "previews", "map_official", "map_tiles")


def make_copy(empty: bool):
    if SANDBOX.exists():
        shutil.rmtree(SANDBOX)
    SANDBOX.mkdir(parents=True)
    if empty or not (REAL / "library.sqlite3").exists():
        print("[sandbox] biblioteca vazia")
        return
    for d in COPY_DIRS:
        if (REAL / d).is_dir():
            shutil.copytree(REAL / d, SANDBOX / d)
    src = sqlite3.connect(f"file:{REAL / 'library.sqlite3'}?mode=ro", uri=True)
    dst = sqlite3.connect(SANDBOX / "library.sqlite3")
    src.backup(dst)  # consistent snapshot even while the real app is running
    src.close()
    dst.execute("DELETE FROM settings WHERE key LIKE 'site_%' OR key LIKE 'backup_%' OR key = 'watch_folder'")
    dst.execute("INSERT OR REPLACE INTO settings(key, value) VALUES ('site_enabled', '0')")
    dst.commit()
    dst.close()
    n = sqlite3.connect(SANDBOX / "library.sqlite3").execute("SELECT COUNT(*) FROM photos").fetchone()[0]
    print(f"[sandbox] cópia criada: {n} fotos em {SANDBOX}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8799)
    ap.add_argument("--fresh", action="store_true", help="recopiar a biblioteca real")
    ap.add_argument("--empty", action="store_true", help="começar com biblioteca vazia")
    ap.add_argument("--copy-only", action="store_true", help="só preparar a cópia, sem iniciar")
    a = ap.parse_args()
    if a.fresh or a.empty or not (SANDBOX / "library.sqlite3").exists():
        make_copy(a.empty)
    if a.copy_only:
        return
    env = {**os.environ, "LEONIDA_DATA_DIR": str(SANDBOX)}
    print(f"[sandbox] Estúdio: http://127.0.0.1:{a.port}/   Galeria: http://127.0.0.1:{a.port}/galeria/   (Ctrl+C para parar)")
    try:
        subprocess.run([sys.executable, str(ROOT / "app.py"), "--no-browser", "--port", str(a.port)], env=env, cwd=ROOT)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
