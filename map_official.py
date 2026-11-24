"""Official Leonida map: turns one big map image into Leaflet tiles (CRS.Simple).

Drop the image in the project folder as  mapa_oficial.png|jpg|jpeg|webp
(optionally with  mapa_calibracao.json  next to it) and the Studio builds the
tiles by itself at startup. Manual run:  python map_official.py

Coordinates stay in the existing map units (0..1024, the Open GTA 6 Map space
used by every saved pin and by leonida-places.json). The calibration tells where
the image sits inside that space, so old pins and place names keep working:

  {"pontos": [ {"lugar": "Vice Beach", "px": [5120, 4310]},
               {"x": 305.8, "y": 379.8, "px": [1830, 2290]} ]}

"px" is the pixel in the image; the point is either a name from
leonida-places.json ("lugar") or explicit map units ("x","y"). Two points are
the minimum; three or more spread across the map give a better fit.
Without calibration the image is fitted into the 0..1024 square.

Output: <data>/map_official/{z}/{x}_{y}.webp  +  config.js
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NAMES = ("mapa_oficial.png", "mapa_oficial.jpg", "mapa_oficial.jpeg", "mapa_oficial.webp")
CALIBRATION = "mapa_calibracao.json"
TILE = 256
MAX_ZOOM = 7
EMPTY_CONFIG = "window.LFN_MAP_IMG=null;\n"
LOCK = threading.Lock()
STATE = {"building": False, "error": None, "message": None}


class MapError(Exception):
    pass


def find_source(*folders):
    for folder in folders:
        for name in NAMES:
            p = Path(folder) / name
            if p.is_file():
                return p
    return None


def _places(web_dir):
    try:
        data = json.loads((Path(web_dir) / "vendor" / "leonida-places.json").read_text("utf-8"))
        return {p["n"].strip().lower(): (p["x"], p["y"]) for p in data.get("places", [])}
    except (OSError, ValueError, KeyError):
        return {}


def _fit_axis(pairs):
    """Least squares  unit = a*px + b."""
    n = len(pairs)
    sp = sum(p for p, _ in pairs); su = sum(u for _, u in pairs)
    spp = sum(p * p for p, _ in pairs); spu = sum(p * u for p, u in pairs)
    den = n * spp - sp * sp
    if abs(den) < 1e-9:
        raise MapError("Os pontos de calibração estão alinhados demais; escolha pontos espalhados pelo mapa.")
    a = (n * spu - sp * su) / den
    return a, (su - a * sp) / n


def bounds_for(width, height, calibration, places):
    """Returns ((x0, y0, x1, y1) in map units, worst residual in units or None)."""
    pts = []
    for i, p in enumerate((calibration or {}).get("pontos", []), 1):
        try:
            u, v = float(p["px"][0]), float(p["px"][1])
        except (KeyError, IndexError, TypeError, ValueError):
            raise MapError(f"Ponto {i} da calibração sem 'px' válido.")
        if "lugar" in p:
            xy = places.get(str(p["lugar"]).strip().lower())
            if not xy:
                raise MapError(f"Lugar desconhecido na calibração: {p['lugar']!r}")
            x, y = xy
        else:
            try:
                x, y = float(p["x"]), float(p["y"])
            except (KeyError, TypeError, ValueError):
                raise MapError(f"Ponto {i} da calibração precisa de 'lugar' ou de 'x' e 'y'.")
        pts.append((u, v, x, y))
    if not pts:
        s = 1024 / max(width, height)  # fit inside the square, centred
        x0, y0 = (1024 - width * s) / 2, (1024 - height * s) / 2
        return (x0, y0, x0 + width * s, y0 + height * s), None
    if len(pts) < 2:
        raise MapError("A calibração precisa de pelo menos 2 pontos.")
    ax, bx = _fit_axis([(u, x) for u, _, x, _ in pts])
    ay, by = _fit_axis([(v, y) for _, v, _, y in pts])
    if ax <= 0 or ay <= 0:
        raise MapError("Calibração invertida: confira se os pixels e os lugares estão na ordem certa.")
    worst = max(math.hypot(ax * u + bx - x, ay * v + by - y) for u, v, x, y in pts)
    return (bx, by, ax * width + bx, ay * height + by), worst


def native_zoom(width, x0, x1):
    ppu = width / (x1 - x0)  # image pixels per map unit
    z = math.log2(max(ppu, 1e-6))
    zf = math.floor(z)
    native = zf + 1 if z - zf > 0.26 else zf  # upscale at most ~20% at the deepest level
    return max(0, min(MAX_ZOOM, native))


def signature(src, calibration_text):
    st = src.stat()
    h = hashlib.sha256(f"{src.name}|{st.st_size}|{st.st_mtime_ns}|v1".encode())
    h.update((calibration_text or "").encode("utf-8"))
    return h.hexdigest()[:16]


def current_signature(out_dir):
    try:
        text = (Path(out_dir) / "config.js").read_text("utf-8")
        cfg = json.loads(text.split("=", 1)[1].rstrip().rstrip(";"))
        return (cfg or {}).get("sig")
    except (OSError, ValueError, IndexError):
        return None


def build(src, out_dir, web_dir, calibration_text=None, progress=None):
    try:
        from PIL import Image
    except ImportError:
        raise MapError("Para gerar o mapa oficial é preciso o Pillow (pip install pillow).")
    Image.MAX_IMAGE_PIXELS = None
    out_dir = Path(out_dir)
    calibration = json.loads(calibration_text) if calibration_text else None
    with Image.open(src) as im0:
        im = im0.convert("RGB")
    W, H = im.size
    (x0, y0, x1, y1), worst = bounds_for(W, H, calibration, _places(web_dir))
    zmax = native_zoom(W, x0, x1)
    bg = im.getpixel((2, 2))  # corner colour (normally sea) fills partial tiles
    tmp = out_dir.with_name(out_dir.name + ".building")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    count = 0
    for z in range(0, zmax + 1):
        k = 2 ** z                              # tile pixels per map unit at this zoom
        sx, sy = W / ((x1 - x0) * k), H / ((y1 - y0) * k)  # image px per tile px
        tx0, tx1 = math.floor(x0 * k / TILE), math.ceil(x1 * k / TILE) - 1
        ty0, ty1 = math.floor(y0 * k / TILE), math.ceil(y1 * k / TILE) - 1
        (tmp / str(z)).mkdir()
        for ty in range(ty0, ty1 + 1):
            for tx in range(tx0, tx1 + 1):
                # tile pixel window -> image pixel window, clipped to the image
                px0, py0 = tx * TILE, ty * TILE
                l = max(0.0, (px0 - x0 * k) * sx); r = min(float(W), (px0 + TILE - x0 * k) * sx)
                t = max(0.0, (py0 - y0 * k) * sy); b = min(float(H), (py0 + TILE - y0 * k) * sy)
                if r - l < 0.5 or b - t < 0.5:
                    continue
                dl = round(l / sx + x0 * k - px0); dt = round(t / sy + y0 * k - py0)
                dw = max(1, min(TILE - dl, round((r - l) / sx))); dh = max(1, min(TILE - dt, round((b - t) / sy)))
                part = im.resize((dw, dh), Image.LANCZOS, box=(l, t, r, b), reducing_gap=3.0)
                if (dl, dt, dw, dh) == (0, 0, TILE, TILE):
                    tile = part
                else:
                    tile = Image.new("RGB", (TILE, TILE), bg)
                    tile.paste(part, (dl, dt))
                tile.save(tmp / str(z) / f"{tx}_{ty}.webp", "WEBP", quality=82, method=4)
                count += 1
        if progress:
            progress(f"zoom {z}/{zmax}: {count} tiles")
    cfg = {"bounds": [round(v, 3) for v in (x0, y0, x1, y1)], "maxNative": zmax,
           "bg": "#%02x%02x%02x" % bg[:3], "sig": signature(src, calibration_text),
           "calibrated": bool(calibration and calibration.get("pontos")), "tiles": count}
    (tmp / "config.js").write_text("window.LFN_MAP_IMG=" + json.dumps(cfg) + ";\n", "utf-8")
    old = out_dir.with_name(out_dir.name + ".old")
    shutil.rmtree(old, ignore_errors=True)
    if out_dir.exists():
        os.replace(out_dir, old)
    os.replace(tmp, out_dir)
    shutil.rmtree(old, ignore_errors=True)
    return cfg, worst


def ensure(out_dir, web_dir, *folders, log=print):
    """Builds the tiles when the image or the calibration changed. Safe to call at every startup."""
    src = find_source(*folders)
    if not src:
        return None
    cal_path = src.with_name(CALIBRATION)
    cal_text = cal_path.read_text("utf-8") if cal_path.is_file() else None
    if current_signature(out_dir) == signature(src, cal_text):
        return None
    with LOCK:
        STATE.update(building=True, error=None, message=f"Gerando o mapa oficial a partir de {src.name}…")
        try:
            cfg, worst = build(src, out_dir, web_dir, cal_text, progress=lambda m: STATE.update(message="Mapa oficial: " + m))
            msg = f"Mapa oficial pronto: {cfg['tiles']} tiles, zoom máximo {cfg['maxNative']}."
            if not cfg["calibrated"]:
                msg += " Sem calibração: os pinos antigos podem ficar deslocados."
            elif worst is not None:
                msg += f" Erro máximo da calibração: {worst:.1f} unidades."
            STATE["message"] = msg
            log("[mapa] " + msg)
            return cfg
        except Exception as e:
            STATE.update(error=str(e), message=None)
            log("[mapa] Falha ao gerar o mapa oficial: " + str(e))
            return None
        finally:
            STATE["building"] = False


if __name__ == "__main__":
    data = Path(os.environ.get("LEONIDA_DATA_DIR", str(Path.home() / "LeonidaFieldNotes"))).expanduser()
    src = find_source(ROOT, data)
    if not src:
        sys.exit("Coloque a imagem como mapa_oficial.png (ou .jpg/.webp) na pasta do projeto.")
    cal = src.with_name(CALIBRATION)
    try:
        cfg, worst = build(src, data / "map_official", ROOT / "web", cal.read_text("utf-8") if cal.is_file() else None,
                           progress=print)
    except MapError as e:
        sys.exit(str(e))
    print(json.dumps(cfg, indent=1))
    if worst is not None:
        print(f"Erro máximo da calibração: {worst:.2f} unidades de mapa")
