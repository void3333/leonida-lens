"""Desktop integration: open the app in its own full-screen window (Chromium "app mode",
no address bar or tabs), create a desktop shortcut with an icon, single instance helpers."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

APP_NAME = "Leonida Lens"
BROWSERS = ("msedge.exe", "chrome.exe", "brave.exe")


def find_browser():
    """Chromium browsers support --app windows. Edge ships with Windows; Chrome/Brave also work."""
    if sys.platform != "win32":
        for name in ("microsoft-edge", "google-chrome", "chromium", "chromium-browser", "brave-browser"):
            path = shutil.which(name)
            if path:
                return path
        mac = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
        return str(mac) if mac.exists() else None
    import winreg
    for exe in BROWSERS:
        for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            try:
                with winreg.OpenKey(hive, rf"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{exe}") as k:
                    path = winreg.QueryValue(k, None)
                    if path and Path(path).exists():
                        return path
            except OSError:
                pass
    for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"), os.environ.get("LOCALAPPDATA")):
        if not base:
            continue
        for rel in (r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe",
                    r"BraveSoftware\Brave-Browser\Application\brave.exe"):
            p = Path(base) / rel
            if p.exists():
                return str(p)
    return None


def open_app_window(url: str, profile_dir: Path, fullscreen=True):
    """Returns the browser process (or None when falling back to the default browser)."""
    browser = find_browser()
    if not browser:
        webbrowser.open(url)
        return None
    profile_dir.mkdir(parents=True, exist_ok=True)
    args = [browser, f"--app={url}", f"--user-data-dir={profile_dir}", "--no-first-run",
            "--no-default-browser-check", "--disable-features=Translate,msEdgeSidebarV2,msUndersideButton",
            "--disable-background-mode", "--window-size=1600,1000"]
    args.append("--start-fullscreen" if fullscreen else "--start-maximized")
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    return subprocess.Popen(args, creationflags=flags, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def wait_and_quit(proc, on_close):
    """Close the server when the app window is closed. If the browser handed the window to an
    already-running instance (process ends at once), keep the server alive."""
    if proc is None:
        return
    started = time.time()
    proc.wait()
    if time.time() - started > 4:
        on_close()


# ---------------------------------------------------------------- icon & shortcut
def build_icon(target: Path):
    if target.exists():
        return target
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return None
    size = 256
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([8, 8, size - 8, size - 8], radius=56, fill=(20, 20, 19, 255))
    d.ellipse([60, 60, size - 60, size - 60], outline=(236, 230, 218, 255), width=16)
    d.ellipse([104, 104, size - 104, size - 104], fill=(215, 154, 94, 255))
    target.parent.mkdir(parents=True, exist_ok=True)
    img.save(target, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    return target


def create_shortcut(root: Path, icon: Path | None):
    """Desktop + Start Menu shortcuts that start the app with no console window."""
    if sys.platform != "win32":
        return False
    pyw = Path(sys.executable).with_name("pythonw.exe")
    target = str(pyw if pyw.exists() else sys.executable)
    ps = r"""
$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject WScript.Shell
$places = @([Environment]::GetFolderPath('Desktop'), (Join-Path ([Environment]::GetFolderPath('Programs')) ''))
foreach ($dir in $places) {
  $old = Join-Path $dir 'Leonida Field Notes.lnk'   # nome antigo do app
  if (Test-Path $old) { Remove-Item $old -Force }
  $lnk = $shell.CreateShortcut((Join-Path $dir '%NAME%.lnk'))
  $lnk.TargetPath = '%TARGET%'
  $lnk.Arguments = '"%SCRIPT%"'
  $lnk.WorkingDirectory = '%ROOT%'
  $lnk.Description = 'Seu estúdio de fotografia em Leonida'
  if ('%ICON%') { $lnk.IconLocation = '%ICON%' }
  $lnk.Save()
}
"""
    def q(v):
        return str(v).replace("'", "''")
    ps = (ps.replace("%NAME%", q(APP_NAME)).replace("%TARGET%", q(target)).replace("%SCRIPT%", q(root / "app.py"))
            .replace("%ROOT%", q(root)).replace("%ICON%", q(icon or "")))
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps], capture_output=True,
                           timeout=30, creationflags=subprocess.CREATE_NO_WINDOW)
        return r.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False
