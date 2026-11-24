"""End-to-end test of the local app: profile, catalog, previews, map coordinates,
full ZIP backup, folder mirror and restore. Offline (no Sony / no map tile download).
Run: python -m unittest discover -s tests -v
"""
import io, json, math, os, shutil, subprocess, sys, tempfile, time, unittest, urllib.error, urllib.request, zipfile
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover
    Image = None

ROOT = Path(__file__).resolve().parents[1]
PORT = 18768
BASE = f"http://127.0.0.1:{PORT}"


def raw(path, method="GET", body=None, headers=None):
    r = urllib.request.Request(BASE + path, data=body, method=method, headers=headers or {})
    with urllib.request.urlopen(r, timeout=120) as resp:
        return resp.status, resp.headers, resp.read()


def js(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    return json.loads(raw(path, method, data, {"Content-Type": "application/json"} if data else {})[2])


@unittest.skipIf(Image is None, "Pillow necessário")
class LocalAppFlow(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        SP = Path(self.tmp.name)
        global DATA, BK
        DATA = SP / "data"; BK = SP / "backup_dest"; BK.mkdir()
        self.SP = SP
        self.proc = subprocess.Popen([sys.executable, str(ROOT / "app.py"), "--port", str(PORT), "--no-browser"], cwd=ROOT,
                                     env={**os.environ, "LEONIDA_DATA_DIR": str(DATA)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def tearDown(self):
        self.proc.terminate(); self.proc.wait(timeout=10)
        time.sleep(0.3)
        self.tmp.cleanup()

    def test_full_flow(self):
        SP = self.SP
        for _ in range(60):
            try: js("/api/health"); break
            except Exception: time.sleep(0.2)

        assert js("/api/profile")["onboarded"] is False
        prof = js("/api/profile", "POST", {"studio_name": "Vice Lens Photography", "photographer": "Lucia", "onboarded": True})
        assert prof["studio_name"] == "Vice Lens Photography" and prof["onboarded"]

        def scene(w, h, a, b):
            img = Image.new("RGB", (w, h)); d = ImageDraw.Draw(img)
            for y in range(0, h, 4):
                t = y / h; d.rectangle([0, y, w, y + 4], fill=tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)))
            for i in range(30):
                x = int(w * i / 30); bh = int(h * (0.12 + 0.3 * abs(math.sin(i * 1.3))))
                d.rectangle([x, h - bh, x + w // 36, h], fill=(16, 14, 20))
            out = io.BytesIO(); img.save(out, "PNG"); return out.getvalue()

        shots = [("2026-11-20_vice_beach.png", scene(3840, 2160, (40, 30, 80), (250, 120, 90)), dict(title="Antes da maré", location="Vice Beach", game_time="06:12", weather="Neblina", notes="A praia ainda vazia.", map_x=558.6, map_y=485.3, favorite=True)),
                 ("2026-11-21_little_cuba.png", scene(3840, 2160, (10, 20, 40), (60, 90, 140)), dict(title="Dominó na calçada", location="Little Cuba", game_time="21:40", weather="Noite limpa", map_x=495.0, map_y=500.2)),
                 ("2026-11-21_port.png", scene(2160, 3840, (90, 60, 40), (230, 190, 120)), dict(title="", location="Port Gellhorn", game_time="17:55", weather="Pôr do sol"))]
        essay = js("/api/essays", "POST", {"title": "Manhãs em Vice City", "description": "A cidade antes de acordar."})["essay"]
        ids = []
        for name, data, meta in shots:
            pid = json.loads(raw("/api/import", "POST", data, {"X-File-Name": name, "Content-Type": "application/octet-stream"})[2])["photo_id"]
            ids.append(pid)
            js(f"/api/photos/{pid}", "PATCH", {**meta, "essay_id": essay["id"] if "cuba" not in name else None})
        # out-of-map coordinates are rejected
        try:
            js(f"/api/photos/{ids[0]}", "PATCH", {"map_x": 5000, "map_y": 1}); raise AssertionError("accepted bad coords")
        except urllib.error.HTTPError as e:
            assert e.code == 400

        cat = js("/api/catalog")
        assert cat["profile"]["studio_name"] == "Vice Lens Photography" and len(cat["photos"]) == 3
        p0 = next(p for p in cat["photos"] if p["id"] == ids[0])
        assert (p0["map_x"], p0["map_y"], p0["game_time"], p0["caption"]) == (558.6, 485.3, "06:12", "A praia ainda vazia."), p0
        assert p0["preview"].startswith("/api/preview/") and p0["preview_width"] == 2560
        st, h, body = raw(p0["preview"]); assert h["Content-Type"] == "image/webp" and Image.open(io.BytesIO(body)).size == (2560, 1440)
        st, h, body = raw(p0["original"] + "?download=1"); assert "attachment" in h.get("Content-Disposition", "") and len(body) == len(shots[0][1])
        st, h, body = raw(p0["thumb"]); assert max(Image.open(io.BytesIO(body)).size) == 1000
        for path in ("/galeria/", "/galeria/app.js", "/galeria/style.css", "/vendor/photoswipe.esm.min.js", "/vendor/leaflet/leaflet.js",
                     "/vendor/leonida-map.js", "/vendor/leonida-places.json", "/vendor/fonts/inter-latin-400-normal.woff2", "/"):
            assert raw(path)[0] == 200, path
        try:
            raw("/vendor/../app.py"); raise AssertionError("traversal")
        except urllib.error.HTTPError as e:
            assert e.code == 404
        try:
            raw("/tiles/night/9/9,0,0.webp"); raise AssertionError("bad tile accepted")
        except urllib.error.HTTPError as e:
            assert e.code == 404
        print("catalog/preview/tiles ok")

        # full zip backup
        st, h, body = raw("/api/backup/full")
        z = zipfile.ZipFile(io.BytesIO(body)); names = z.namelist()
        assert "library.sqlite3" in names and "manifest.json" in names and sum(n.startswith("originals/") for n in names) == 3, names
        assert not any("dpapi" in n or "token" in n for n in names)
        man = json.loads(z.read("manifest.json")); assert man["photos"] == 3 and man["studio_name"] == "Vice Lens Photography"
        zip_path = SP / "e2e_backup.zip"; zip_path.write_bytes(body)
        print("zip backup ok:", len(body) // 1024, "KB")

        # folder mirror
        js("/api/backup/folder", "POST", {"folder": str(BK)})
        r = js("/api/backup/run", "POST", {}); assert r["copied"] == 3 and (BK / "LeonidaFieldNotes-Backup/library.sqlite3").exists()
        assert js("/api/backup/run", "POST", {})["copied"] == 0  # incremental
        try:
            js("/api/backup/folder", "POST", {"folder": str(DATA)}); raise AssertionError("inside data accepted")
        except urllib.error.HTTPError as e:
            assert e.code == 400
        print("folder backup ok")

        # disaster: wipe a photo + rename studio, then restore
        js(f"/api/photos/{ids[1]}", "PATCH", {"title": "ALTERADO"})
        js("/api/profile", "POST", {"studio_name": "Outro nome"})
        orig = next((DATA / "originals").glob(ids[2] + ".*")); orig.unlink()
        r = json.loads(raw("/api/backup/restore", "POST", zip_path.read_bytes(), {"Content-Type": "application/zip"})[2])
        assert r["ok"] and r["files_restored"] == 1, r
        cat = js("/api/catalog")
        assert cat["profile"]["studio_name"] == "Vice Lens Photography"
        assert next(p for p in cat["photos"] if p["id"] == ids[1])["title"] == "Dominó na calçada"
        assert next((DATA / "originals").glob(ids[2] + ".*")).exists()
        assert any("antes-de-restaurar" in f.name for f in (DATA / "backups").iterdir())
        try:
            raw("/api/backup/restore", "POST", b"not a zip" * 20, {"Content-Type": "application/zip"}); raise AssertionError("bad zip")
        except urllib.error.HTTPError as e:
            assert e.code == 400
        st = js("/api/backup/status"); assert st["snapshots"] >= 1 and st["backup_folder"]
        print("restore ok; status:", {k: st[k] for k in ("snapshots", "originals_bytes")})
        print("ALL E2E OK")
