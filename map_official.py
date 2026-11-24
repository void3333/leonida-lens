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
the minimum; three or more spread across the map give a better fit. With four or
more the poster is also bent slightly so every point lands on its place (fan-map
units are not uniform); see "Deformação suave" below.
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


# O pôster oficial não é redistribuído com o projeto: é baixado do site da Rockstar na primeira execução.
ROCKSTAR_ZIP = "https://media-rockstargames-com.akamaized.net/VI/downloads/artwork_wallpapers/Leonida_Map_Poster_Printable.zip"
ROCKSTAR_MEMBER = "Leonida_Map_Poster_Printable.jpg"
POSTER_CROP = {(5775, 7900): (204, 203, 5570, 7695)}   # moldura do pôster v1 (a calibração usa esse recorte)


def _frame_box(im):
    """Acha a moldura escura do pôster (para versões futuras com outro tamanho)."""
    g = im.convert("L"); W, H = g.size
    cd = lambda x: sum(g.getpixel((x, y)) < 110 for y in range(H // 4, H * 3 // 4, 25))
    rd = lambda y: sum(g.getpixel((x, y)) < 110 for x in range(W // 4, W * 3 // 4, 25))
    nc, nr = len(range(H // 4, H * 3 // 4, 25)), len(range(W // 4, W * 3 // 4, 25))
    L = next(x for x in range(W // 4) if cd(x) > nc * .8); R = next(x for x in range(W - 1, W * 3 // 4, -1) if cd(x) > nc * .8)
    T = next(y for y in range(H // 4) if rd(y) > nr * .8); B = next(y for y in range(H - 1, H * 3 // 4, -1) if rd(y) > nr * .8)
    return (L + 14, T + 14, R - 14, B - 14)


def download_official(dest_dir, progress=None):
    """Baixa o pôster 'Leonida Map' do site oficial, converte para RGB e recorta na moldura → mapa_oficial.jpg."""
    import io, tempfile, urllib.request, zipfile
    from PIL import Image, ImageCms
    Image.MAX_IMAGE_PIXELS = None
    dest = Path(dest_dir) / "mapa_oficial.jpg"
    req = urllib.request.Request(ROCKSTAR_ZIP, headers={"User-Agent": "LeonidaLens"})
    with tempfile.TemporaryFile() as tmp:
        with urllib.request.urlopen(req, timeout=60) as r:
            total, got = int(r.headers.get("Content-Length") or 0), 0
            while chunk := r.read(1 << 20):
                tmp.write(chunk); got += len(chunk)
                if progress and total:
                    progress(f"baixando o mapa oficial da Rockstar… {got * 100 // total}%")
        tmp.seek(0)
        with zipfile.ZipFile(tmp) as z, z.open(ROCKSTAR_MEMBER) as f:
            im = Image.open(io.BytesIO(f.read()))
            im.load()
    icc = im.info.get("icc_profile")
    if icc:
        im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(icc)), ImageCms.createProfile("sRGB"), outputMode="RGB")
    else:
        im = im.convert("RGB")
    box = POSTER_CROP.get(im.size) or _frame_box(im)
    part = dest.with_suffix(".part.jpg")
    im.crop(box).save(part, quality=92, subsampling=0, optimize=True)
    os.replace(part, dest)
    return dest


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


def _control_points(calibration, places):
    """[(px_x, px_y, unit_x, unit_y), ...] from the calibration file."""
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
        pts.append((u, v, float(x), float(y)))
    return pts


def bounds_for(width, height, calibration, places):
    """Returns ((x0, y0, x1, y1) in map units, worst residual in units or None)."""
    pts = _control_points(calibration, places)
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


# ---- Deformação suave ----------------------------------------------------------------------
# O mapa de fãs (onde ficam os pinos) não tem a mesma escala em todo lugar, então o ajuste reto
# deixa erro de até ~25 unidades. Com 4+ pontos o pôster é levemente deformado para que cada
# ponto de calibração caia no seu lugar. A correção é uma soma de "bolhas" gaussianas (raio
# "raio_deformacao", em unidades) em volta dos pontos: longe deles vale o ajuste reto.
# "suavidade" > 0 troca exatidão por uma deformação mais calma; "deformar": false desliga.

def _solve(a, b):
    """Gaussian elimination with partial pivoting; a is n x n, b is n x m (lists, copied)."""
    n = len(a); a = [row[:] + rb[:] for row, rb in zip(a, b)]; m = len(b[0])
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(a[r][c]))
        if abs(a[piv][c]) < 1e-12:
            raise MapError("Pontos de calibração repetidos demais para deformar o mapa.")
        a[c], a[piv] = a[piv], a[c]
        for r in range(n):
            if r != c and a[r][c]:
                f = a[r][c] / a[c][c]
                a[r] = [x - f * y for x, y in zip(a[r], a[c])]
    return [[a[r][n + j] / a[r][r] for j in range(m)] for r in range(n)]


class Warp:
    """Map units -> image pixel: the straight fit ``base`` plus gaussian corrections at the control points."""

    def __init__(self, pts, base, radius=50.0, smooth=0.0):
        self.base, self.k = base, -1 / (2 * radius * radius)
        self.c = [(x, y) for *_, x, y in pts]
        res = [[u - bu, v - bv] for (u, v, x, y) in pts for bu, bv in [base(x, y)]]
        gram = [[self._g(a, b) + (smooth if i == j else 0.0) for j, b in enumerate(self.c)]
                for i, a in enumerate(self.c)]
        self.w = _solve(gram, res)

    def _g(self, a, b):
        return math.exp(self.k * ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2))

    def __call__(self, x, y):
        u, v = self.base(x, y)
        for (du, dv), c in zip(self.w, self.c):
            g = self._g((x, y), c)
            if g > 1e-9:
                u += du * g; v += dv * g
        return u, v


def warp_for(width, height, calibration, places):
    """(Warp or None, worst residual in units after warping). None when there is nothing to bend."""
    cal = calibration or {}
    pts = _control_points(cal, places)
    if len(pts) < 4 or cal.get("deformar") is False:
        return None, None
    (x0, y0, x1, y1), _ = bounds_for(width, height, cal, places)
    kx, ky = width / (x1 - x0), height / (y1 - y0)
    base = lambda x, y: ((x - x0) * kx, (y - y0) * ky)
    radius = float(cal.get("raio_deformacao", 50))
    smooth = float(cal.get("suavidade", 0.02))
    for _ in range(6):   # relax until the field has no folds
        w = Warp(pts, base, radius, smooth)
        if not _folds(w, x0, y0, x1, y1):
            break
        smooth = smooth * 3 + 0.05
    else:
        return None, None
    worst = max(math.hypot((a - u) / kx, (b - v) / ky) for u, v, x, y in pts for a, b in [w(x, y)])
    return w, worst


def _folds(w, x0, y0, x1, y1, n=48):
    g = [[w(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * j / n) for i in range(n + 1)] for j in range(n + 1)]
    for j in range(n):
        for i in range(n):
            a, b, c = g[j][i], g[j][i + 1], g[j + 1][i]
            if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 0:
                return True
    return False


def warp_image(im, w, bounds, bg, cell=64):
    """Resamples the poster so that pixel (i, j) shows map unit bounds-space (i, j) through the warp."""
    from PIL import Image
    W, H = im.size
    x0, y0, x1, y1 = bounds
    ux = lambda i: x0 + (x1 - x0) * i / W
    uy = lambda j: y0 + (y1 - y0) * j / H
    xs = list(range(0, W, cell)) + [W]; ys = list(range(0, H, cell)) + [H]
    grid = {(i, j): w(ux(i), uy(j)) for j in ys for i in xs}
    mesh = []
    for ja, jb in zip(ys, ys[1:]):
        for ia, ib in zip(xs, xs[1:]):
            q = grid[(ia, ja)] + grid[(ia, jb)] + grid[(ib, jb)] + grid[(ib, ja)]
            mesh.append(((ia, ja, ib, jb), q))
    framed = Image.new("RGB", (W + 2, H + 2), bg); framed.paste(im, (1, 1))   # outside -> sea colour
    mesh = [(box, tuple(c + 1 for c in q)) for box, q in mesh]
    return framed.transform((W, H), Image.MESH, mesh, Image.BICUBIC, fillcolor=bg)


def native_zoom(width, x0, x1):
    ppu = width / (x1 - x0)  # image pixels per map unit
    z = math.log2(max(ppu, 1e-6))
    zf = math.floor(z)
    native = zf + 1 if z - zf > 0.26 else zf  # upscale at most ~20% at the deepest level
    return max(0, min(MAX_ZOOM, native))


def signature(src, calibration_text):
    st = src.stat()
    h = hashlib.sha256(f"{src.name}|{st.st_size}|{st.st_mtime_ns}|v2".encode())
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
    places = _places(web_dir)
    (x0, y0, x1, y1), worst = bounds_for(W, H, calibration, places)
    zmax = native_zoom(W, x0, x1)
    bg = im.getpixel((2, 2))  # corner colour (normally sea) fills partial tiles
    warp, warped_worst = warp_for(W, H, calibration, places)
    if warp:
        if progress:
            progress("deformando o pôster para os pontos de calibração")
        im = warp_image(im, warp, (x0, y0, x1, y1), bg)
        worst = warped_worst
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
           "calibrated": bool(calibration and calibration.get("pontos")), "warped": bool(warp),
           "tiles": count}
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
    if not src and folders:
        try:   # primeira execução: baixa o pôster oficial para a pasta de dados (última da lista)
            STATE.update(building=True, error=None, message="Baixando o mapa oficial da Rockstar…")
            src = download_official(folders[-1], progress=lambda m: STATE.update(message=m))
            log("[mapa] Pôster oficial baixado: " + str(src))
        except Exception as e:
            STATE.update(building=False, error=str(e), message=None)
            log("[mapa] Não consegui baixar o mapa oficial (sem internet?): " + str(e) + " — usando o mapa de fãs.")
            return None
    if not src:
        return None
    cal_path = src.with_name(CALIBRATION)
    if not cal_path.is_file():
        cal_path = ROOT / CALIBRATION
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
    src = find_source(ROOT, data) or download_official(data, progress=print)
    cal = src.with_name(CALIBRATION)
    cal = cal if cal.is_file() else ROOT / CALIBRATION
    try:
        cfg, worst = build(src, data / "map_official", ROOT / "web", cal.read_text("utf-8") if cal.is_file() else None,
                           progress=print)
    except MapError as e:
        sys.exit(str(e))
    print(json.dumps(cfg, indent=1))
    if worst is not None:
        print(f"Erro máximo da calibração: {worst:.2f} unidades de mapa")
