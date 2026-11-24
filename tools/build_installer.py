#!/usr/bin/env python3
"""Build the one-file Windows installer:  python tools/build_installer.py  ->  dist/LeonidaFieldNotes-Setup-<v>.exe

Everything the Studio needs is embedded, so the other PC needs no Python, Node or internet to install:
  runtime/python  official Python embeddable zip (same version as the Python running this script)
                  + Pillow wheel + tkinter (copied from this Python, for the folder picker)
  runtime/node    official Node.js LTS win-x64 zip (publisher.py uses it for `npx wrangler`)
  app files       app.py, *.py modules, web/, official map, LEIA_PRIMEIRO.md

Downloads are cached in .build/cache/ and verified (python.org / PyPI / nodejs.org SHA-256).
Needs Inno Setup 6 (ISCC.exe); if missing it is installed per user with winget.
Options: --skip-compile (stage only), --node-version 24.11.1 (pin a Node release).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / ".build"
CACHE = BUILD / "cache"
STAGE = BUILD / "stage"
DIST = ROOT / "dist"
APP_FILES = ["app.py", "backup.py", "desktop.py", "map_official.py", "psn_bridge.py", "publisher.py", "version.py",
             "mapa_calibracao.json", "LEIA_PRIMEIRO.md"]   # o pôster da Rockstar é baixado na 1ª execução
APP_DIRS = ["web"]
SKIP = shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store", "Thumbs.db", "desktop.ini")
APP_ID = "{{6F1C2B7E-4E0B-4C55-9C1A-6B7A1F3D2E91}"   # never change: upgrades are matched by this id
UA = {"User-Agent": "lfn-installer-build"}


def log(*a):
    print("[build]", *a, flush=True)


def app_version():
    ns = {}
    exec((ROOT / "version.py").read_text("utf-8"), ns)
    return ns["__version__"]


# ------------------------------------------------------------------ downloads
def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.loads(r.read())


def get_text(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read().decode("utf-8")


def sha256(path: Path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url, name, sha=None, size=None):
    """Cached download, verified by SHA-256 / size when known."""
    CACHE.mkdir(parents=True, exist_ok=True)
    dest = CACHE / name

    def ok(p):
        if size is not None and p.stat().st_size != int(size):
            return False
        return not sha or sha256(p) == sha.lower()
    if dest.exists() and ok(dest):
        log("cache:", name)
        return dest
    log("baixando", url)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f, 1 << 20)
    if not ok(tmp):
        tmp.unlink()
        raise SystemExit(f"Download corrompido (tamanho/SHA-256 não confere): {url}")
    tmp.replace(dest)
    return dest


def python_embed():
    ver = platform.python_version()
    name = f"python-{ver}-embed-amd64.zip"
    url = f"https://www.python.org/ftp/python/{ver}/{name}"
    sha = size = None
    try:  # python.org publishes the SHA-256 of every release file in its API
        rel = get_json(f"https://www.python.org/api/v2/downloads/release/?name=Python%20{ver}")
        rid = rel[0]["resource_uri"].rstrip("/").rsplit("/", 1)[-1]
        for f in get_json(f"https://www.python.org/api/v2/downloads/release_file/?release={rid}"):
            if f["url"].endswith(name):
                sha, size = f.get("sha256_sum") or None, f.get("filesize") or None
    except Exception as e:  # noqa: BLE001
        log("aviso: não consegui ler o SHA-256 do python.org:", e)
    if not sha:
        log("aviso: Python embeddable sem SHA-256 publicado; verificando só o zip")
    return ver, download(url, name, sha, size)


def pillow_wheel(py_tag):
    try:
        import PIL  # same Pillow version as the dev PC, when available
        want = PIL.__version__
    except ImportError:
        want = get_json("https://pypi.org/pypi/pillow/json")["info"]["version"]
    data = get_json(f"https://pypi.org/pypi/pillow/{want}/json")
    for f in data["urls"]:
        if f["filename"].endswith(f"-{py_tag}-{py_tag}-win_amd64.whl"):
            return want, download(f["url"], f["filename"], f["digests"]["sha256"], f["size"])
    raise SystemExit(f"PyPI não tem wheel do Pillow {want} para {py_tag} win_amd64")


def node_lts(pin=None):
    if pin:
        ver = "v" + pin.lstrip("v")
    else:
        ver = next(r["version"] for r in get_json("https://nodejs.org/dist/index.json")
                   if r.get("lts") and "win-x64-zip" in r.get("files", []))
    name = f"node-{ver}-win-x64.zip"
    sums = get_text(f"https://nodejs.org/dist/{ver}/SHASUMS256.txt")
    m = re.search(rf"^([0-9a-f]{{64}})\s+{re.escape(name)}$", sums, re.M)
    if not m:
        raise SystemExit(f"SHASUMS256.txt do Node não lista {name}")
    return ver, download(f"https://nodejs.org/dist/{ver}/{name}", name, m.group(1))


# ------------------------------------------------------------------ staging
def stage_app():
    for f in APP_FILES:
        shutil.copy2(ROOT / f, STAGE / f)
    for d in APP_DIRS:
        shutil.copytree(ROOT / d, STAGE / d, ignore=SKIP)


def stage_python(embed_zip: Path, wheel: Path, py_tag: str):
    rt = STAGE / "runtime" / "python"
    with zipfile.ZipFile(embed_zip) as z:
        z.extractall(rt)
    site = rt / "Lib" / "site-packages"
    site.mkdir(parents=True)
    with zipfile.ZipFile(wheel) as z:  # a wheel is a zip laid out for site-packages
        z.extractall(site)
    # tkinter (folder picker) is not in the embeddable zip: copy it from this same-version Python.
    base = Path(sys.base_prefix)
    tk_dlls = ["_tkinter.pyd", "tcl*.dll", "tk*.dll", "tcl9tk*.dll", "libtommath.dll", "zlib1.dll"]
    copied = []
    for pat in tk_dlls:
        for f in (base / "DLLs").glob(pat):
            if not (rt / f.name).exists():
                shutil.copy2(f, rt / f.name)
                copied.append(f.name)
    if (base / "Lib" / "tkinter").is_dir() and (rt / "_tkinter.pyd").exists():
        shutil.copytree(base / "Lib" / "tkinter", rt / "Lib" / "tkinter", ignore=SKIP)
        if (base / "tcl").is_dir():  # Tcl/Tk 8.6 builds keep their script library outside the DLL (9.x: inside)
            shutil.copytree(base / "tcl", rt / "tcl", ignore=SKIP)
        log("tkinter copiado:", ", ".join(copied))
    else:
        log("aviso: tkinter indisponível neste Python; o seletor de pasta cairá no campo de texto")
    # ._pth: the embeddable runtime ignores PYTHONPATH; keep the stdlib zip + "." and add Lib, site-packages
    # and the app folder (..\.. relative to runtime\python).
    pth = next(rt.glob("python*._pth"))
    keep = [ln.strip() for ln in pth.read_text("utf-8").splitlines() if ln.strip() and not ln.lstrip().startswith("#")]
    pth.write_text("\n".join(keep + ["Lib", r"Lib\site-packages", r"..\..", "import site", ""]), "utf-8")
    return rt


def stage_node(node_zip: Path):
    dest = STAGE / "runtime" / "node"
    with zipfile.ZipFile(node_zip) as z:
        top = z.namelist()[0].split("/")[0]
        z.extractall(STAGE / "runtime")
    (STAGE / "runtime" / top).rename(dest)
    return dest


def smoke_test(rt: Path, node: Path):
    py = rt / "python.exe"
    code = ("import PIL, PIL.Image, sqlite3, ssl, ctypes, winreg, urllib.request; "
            "import publisher, desktop, map_official, backup, psn_bridge, version; "
            "assert publisher.bundled_node() is not None, 'node'; "
            "t = None\ntry:\n import tkinter; t = tkinter.Tcl().eval('info patchlevel')\nexcept Exception as e: t = repr(e)\n"
            "print('Python', __import__('sys').version.split()[0], '| Pillow', PIL.__version__, '| Tcl', t)")
    out = subprocess.run([str(py), "-B", "-c", code], cwd=str(BUILD), capture_output=True, text=True)
    if out.returncode:
        raise SystemExit("Teste do runtime embutido falhou:\n" + out.stdout + out.stderr)
    log("runtime ok:", out.stdout.strip())
    nv = subprocess.run([str(node / "node.exe"), "--version"], capture_output=True, text=True).stdout.strip()
    log("node ok:", nv)


# ------------------------------------------------------------------ Inno Setup
def find_iscc():
    cands = [shutil.which("ISCC.exe") or ""]
    for base in (os.environ.get("LOCALAPPDATA", ""), os.environ.get("ProgramFiles(x86)", ""),
                 os.environ.get("ProgramFiles", "")):
        if base:
            cands += [str(Path(base) / sub / "ISCC.exe") for sub in (r"Programs\Inno Setup 6", "Inno Setup 6")]
    return next((c for c in cands if c and Path(c).is_file()), None)


def ensure_iscc():
    iscc = find_iscc()
    if iscc:
        return iscc
    log("Inno Setup não encontrado; instalando com winget (por usuário, sem admin)...")
    base = ["winget", "install", "--id", "JRSoftware.InnoSetup", "-e", "--silent",
            "--accept-package-agreements", "--accept-source-agreements"]
    if subprocess.run(base + ["--scope", "user"]).returncode != 0:
        subprocess.run(base)
    iscc = find_iscc()
    if not iscc:
        raise SystemExit("Instale o Inno Setup 6 (https://jrsoftware.org/isdl.php) e rode de novo.")
    return iscc


ISS_TEMPLATE = r'''; Gerado por tools/build_installer.py, não editar à mão.
#define AppName "Leonida Field Notes"
#define AppVersion "@VERSION@"
#define Launcher "{app}\runtime\python\pythonw.exe"

[Setup]
AppId=@APP_ID@
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Leonida Field Notes
VersionInfoVersion=@VERSION@
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=auto
UsePreviousAppDir=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern
SetupIconFile=@ICO@
UninstallDisplayIcon={app}\web\vendor\app.ico
UninstallDisplayName={#AppName}
OutputDir=@DIST@
OutputBaseFilename=LeonidaFieldNotes-Setup-@VERSION@
Compression=lzma2/ultra64
SolidCompression=yes
CloseApplications=force
RestartApplications=no
SetupLogging=yes

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Messages]
ConfirmUninstall=Remover o %1 deste computador?%n%nSuas fotos, o diário, os backups e as configurações ficam na pasta "LeonidaFieldNotes" dentro da sua pasta de usuário e NÃO serão apagados.
FinishedLabel=O %1 foi instalado. Use o atalho "Leonida Field Notes" na Área de Trabalho ou no Menu Iniciar.

[InstallDelete]
; upgrade limpo: runtime e front-end são substituídos inteiros (os dados do usuário ficam fora de {app})
Type: filesandordirs; Name: "{app}\runtime"
Type: filesandordirs; Name: "{app}\web"
Type: filesandordirs; Name: "{app}\__pycache__"

[Files]
Source: "@STAGE@\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userdesktop}\{#AppName}"; Filename: "{#Launcher}"; Parameters: """{app}\app.py"""; WorkingDir: "{app}"; IconFilename: "{app}\web\vendor\app.ico"; Comment: "Seu estúdio de fotografia em Leonida"
Name: "{userprograms}\{#AppName}"; Filename: "{#Launcher}"; Parameters: """{app}\app.py"""; WorkingDir: "{app}"; IconFilename: "{app}\web\vendor\app.ico"; Comment: "Seu estúdio de fotografia em Leonida"

[Run]
; app.py abre em tela cheia por padrão (janela de app do Edge/Chrome)
Filename: "{#Launcher}"; Parameters: """{app}\app.py"""; WorkingDir: "{app}"; Description: "Abrir o Leonida Field Notes"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; só o que é gerado dentro da pasta do programa; ~/LeonidaFieldNotes (dados do usuário) nunca é tocada
Type: filesandordirs; Name: "{app}\runtime"
Type: filesandordirs; Name: "{app}\web"
Type: filesandordirs; Name: "{app}\__pycache__"
Type: filesandordirs; Name: "{app}\.wrangler"
'''


def iss_script(version: str):
    subs = {"@VERSION@": version, "@APP_ID@": APP_ID, "@STAGE@": str(STAGE), "@DIST@": str(DIST),
            "@ICO@": str(STAGE / "web" / "vendor" / "app.ico")}
    out = ISS_TEMPLATE
    for k, v in subs.items():
        out = out.replace(k, v)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--skip-compile", action="store_true", help="só monta .build/stage, sem gerar o .exe")
    ap.add_argument("--node-version", help="fixar uma versão do Node.js (padrão: LTS mais recente)")
    args = ap.parse_args()
    if sys.platform != "win32" or platform.machine().lower() not in ("amd64", "x86_64"):
        raise SystemExit("O instalador é gerado num Windows x64.")
    version = app_version()
    py_tag = f"cp{sys.version_info.major}{sys.version_info.minor}"
    log(f"Leonida Field Notes {version} | Python {platform.python_version()} ({py_tag})")

    py_ver, embed = python_embed()
    pil_ver, wheel = pillow_wheel(py_tag)
    node_ver, node_zip = node_lts(args.node_version)
    log(f"Python {py_ver} embeddable | Pillow {pil_ver} | Node.js {node_ver}")

    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)
    stage_app()
    rt = stage_python(embed, wheel, py_tag)
    node = stage_node(node_zip)
    smoke_test(rt, node)
    if args.skip_compile:
        log("stage pronto em", STAGE)
        return
    iss = BUILD / "LeonidaFieldNotes.iss"
    iss.write_text(iss_script(version), "utf-8-sig")  # BOM: ISCC reads the pt-BR text as UTF-8
    DIST.mkdir(exist_ok=True)
    iscc = ensure_iscc()
    log("compilando com", iscc)
    if subprocess.run([iscc, "/Q", str(iss)]).returncode != 0:
        raise SystemExit("ISCC falhou")
    exe = DIST / f"LeonidaFieldNotes-Setup-{version}.exe"
    log(f"pronto: {exe} ({exe.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
