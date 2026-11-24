#!/usr/bin/env python3
"""Run every test file in tests/ plus JS syntax checks.  python tools/run_tests.py [-v]"""
from __future__ import annotations

import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    verbose = "-v" in sys.argv
    failed = []
    for t in sorted((ROOT / "tests").glob("test_*.py")):
        t0 = time.time()
        p = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", t.name], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
        ok = p.returncode == 0
        print(f"{'ok  ' if ok else 'FAIL'}  {t.name:<28} {time.time() - t0:5.1f}s")
        if not ok or verbose:
            print((p.stdout + p.stderr).strip()[-3000:], "\n")
        if not ok:
            failed.append(t.name)
    node = shutil.which("node")
    if node:
        for js in ["web/app.js", "web/vendor/leonida-map.js"]:
            p = subprocess.run([node, "--check", js], cwd=ROOT, capture_output=True, text=True)
            print(f"{'ok  ' if p.returncode == 0 else 'FAIL'}  node --check {js}")
            if p.returncode:
                print(p.stderr.strip()); failed.append(js)
        for js in sorted((ROOT / "web" / "galeria").glob("*.js")):  # ES modules
            p = subprocess.run([node, "--input-type=module", "--check"], input=js.read_text("utf-8"), cwd=ROOT,
                               capture_output=True, text=True, encoding="utf-8")
            rel = js.relative_to(ROOT).as_posix()
            print(f"{'ok  ' if p.returncode == 0 else 'FAIL'}  node --check {rel}")
            if p.returncode:
                print(p.stderr.strip()); failed.append(rel)
    print("\n" + ("TUDO OK" if not failed else "FALHOU: " + ", ".join(failed)))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
