"""Aparência (temas) e "Continuar meu estúdio" (restaurar da pasta de backup automático e do .zip).
Sobe dois Estúdios com pastas de dados temporárias: o "PC antigo" (com fotos e tema) e o "PC novo" (vazio).
Run: python tests/test_theme_restore.py
"""
import io, json, os, shutil, subprocess, sys, tempfile, time, unittest, urllib.error, urllib.request
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None

ROOT = Path(__file__).resolve().parents[1]
OLD, NEW = 18781, 18782


def call(port, path, method="GET", body=None, raw=None, headers=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = dict(headers or {})
    if body is not None:
        h["Content-Type"] = "application/json"
    r = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            out = resp.read()
            return resp.status, (json.loads(out) if resp.headers.get_content_type() == "application/json" else out)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def start(port, data):
    p = subprocess.Popen([sys.executable, str(ROOT / "app.py"), "--port", str(port), "--no-browser"], cwd=ROOT,
                         env={**os.environ, "LEONIDA_DATA_DIR": str(data)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        try:
            if call(port, "/api/health")[0] == 200:
                return p
        except Exception:
            pass
        time.sleep(0.15)
    p.terminate()
    raise RuntimeError("app não subiu")


def jpeg(color):
    buf = io.BytesIO()
    Image.new("RGB", (64, 36), color).save(buf, "JPEG")
    return buf.getvalue()


@unittest.skipIf(Image is None, "Pillow necessário")
class ThemeAndRestore(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.sp = Path(self.tmp.name)
        self.procs = []

    def tearDown(self):
        for p in self.procs:
            p.terminate(); p.wait(timeout=10)
        time.sleep(0.3)
        self.tmp.cleanup()

    def test_theme_and_restore_folder_and_zip(self):
        self.procs.append(start(OLD, self.sp / "old"))

        # ---- tema: padrão, salvar, validar, catálogo
        st, th = call(OLD, "/api/theme")
        self.assertEqual(st, 200)
        self.assertEqual(th["studio"], {"preset": "codigo", "accent": ""})
        self.assertEqual(th["gallery"], {"preset": "codigo", "accent": ""})
        self.assertIn("papel", th["presets"])
        st, th = call(OLD, "/api/theme", "POST", {"studio": {"preset": "vice", "accent": "#FF00AA"}, "gallery": {"preset": "papel"}})
        self.assertEqual(st, 200)
        self.assertEqual(th["studio"], {"preset": "vice", "accent": "#ff00aa"})
        self.assertEqual(th["gallery"]["preset"], "papel")
        self.assertEqual(call(OLD, "/api/theme", "POST", {"studio": {"preset": "neon-inexistente"}})[0], 400)
        self.assertEqual(call(OLD, "/api/theme", "POST", {"gallery": {"accent": "vermelho"}})[0], 400)
        st, th = call(OLD, "/api/theme", "POST", {"gallery": {"accent": "#3ddc84"}})   # parcial: mantém o tema
        self.assertEqual(th["gallery"], {"preset": "papel", "accent": "#3ddc84"})
        self.assertEqual(call(OLD, "/api/catalog")[1]["theme"], {"preset": "papel", "accent": "#3ddc84"})
        self.assertEqual(call(OLD, "/api/catalog?publico=1")[1]["theme"]["preset"], "papel")

        # ---- PC antigo: estúdio com fotos, site e backup automático em pasta
        call(OLD, "/api/profile", "POST", {"studio_name": "Vice Lens", "photographer": "Lucia", "onboarded": True})
        for i, c in enumerate([(200, 40, 40), (40, 200, 40), (40, 40, 200)]):
            st, r = call(OLD, "/api/import", "POST", raw=jpeg(c), headers={"X-File-Name": f"foto{i}.jpg", "Content-Type": "application/octet-stream"})
            self.assertEqual(st, 201, r)
        import sqlite3
        from contextlib import closing
        with closing(sqlite3.connect(self.sp / "old" / "library.sqlite3")) as cx:   # endereço da galeria (sem publicar de verdade)
            cx.executemany("INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)",
                           [("site_url", "https://lfn-vice-lens.pages.dev"), ("site_project", "lfn-vice-lens"), ("site_enabled", "0")])
            cx.commit()
        cloud = self.sp / "OneDrive"; cloud.mkdir()
        self.assertEqual(call(OLD, "/api/backup/folder", "POST", {"folder": str(cloud)})[0], 200)
        st, r = call(OLD, "/api/backup/run", "POST", {})
        self.assertEqual((st, r["photos"]), (200, 3), r)
        st, zip_bytes = call(OLD, "/api/backup/full")
        self.assertEqual(st, 200)

        # ---- PC novo: vazio → cai no assistente
        self.procs.append(start(NEW, self.sp / "new"))
        self.assertFalse(call(NEW, "/api/profile")[1]["onboarded"])
        self.assertEqual(call(NEW, "/api/theme")[1]["studio"]["preset"], "codigo")

        # conferir a pasta: aceita a pasta escolhida ou a subpasta LeonidaFieldNotes-Backup
        st, info = call(NEW, "/api/backup/inspect-folder", "POST", {"folder": str(cloud)})
        self.assertEqual(st, 200, info)
        self.assertEqual((info["studio_name"], info["photos"], info["files"]), ("Vice Lens", 3, 3))
        self.assertTrue(info["folder"].endswith("LeonidaFieldNotes-Backup"))
        self.assertEqual(call(NEW, "/api/backup/inspect-folder", "POST", {"folder": info["folder"]})[0], 200)
        st, err = call(NEW, "/api/backup/inspect-folder", "POST", {"folder": str(self.sp)})
        self.assertEqual(st, 400); self.assertIn("backup", err["error"])
        self.assertEqual(call(NEW, "/api/backup/restore-folder", "POST", {"folder": str(self.sp / "nada")})[0], 400)
        self.assertIsInstance(call(NEW, "/api/backup/find-folders")[1]["folders"], list)

        # restaurar da pasta
        st, res = call(NEW, "/api/backup/restore-folder", "POST", {"folder": str(cloud)})
        self.assertEqual(st, 200, res)
        self.assertEqual((res["photos"], res["files_restored"], res["studio_name"]), (3, 3, "Vice Lens"))
        self.assertTrue((self.sp / "new" / "backups" / res["safety_snapshot"]).is_file())   # cópia de segurança antes
        status = call(NEW, "/api/backup/restore-status")[1]
        self.assertFalse(status["running"]); self.assertEqual(status["result"]["photos"], 3)
        self.assertEqual(len(call(NEW, "/api/photos")[1]["photos"]), 3)
        prof = call(NEW, "/api/profile")[1]
        self.assertEqual(prof["studio_name"], "Vice Lens")
        self.assertFalse(prof["onboarded"], "restaurar não marca o PC novo como configurado")
        th = call(NEW, "/api/theme")[1]
        self.assertEqual(th["studio"], {"preset": "vice", "accent": "#ff00aa"})
        self.assertEqual(th["gallery"], {"preset": "papel", "accent": "#3ddc84"})
        site = call(NEW, "/api/site/status")[1]
        self.assertEqual((site["url"], site["project"]), ("https://lfn-vice-lens.pages.dev", "lfn-vice-lens"))
        bk = call(NEW, "/api/backup/status")[1]
        self.assertEqual(Path(bk["backup_folder"]), cloud.resolve(), "a mesma pasta continua recebendo os backups")
        for f in (self.sp / "new").rglob("*"):
            self.assertNotIn("dpapi", f.name.lower())

        # restaurar do .zip (de novo, por cima) também traz o tema e não marca como configurado
        call(NEW, "/api/theme", "POST", {"studio": {"preset": "verde", "accent": ""}})
        st, res = call(NEW, "/api/backup/restore", "POST", raw=zip_bytes, headers={"Content-Type": "application/zip"})
        self.assertEqual(st, 200, res)
        self.assertEqual(res["photos"], 3)
        self.assertEqual(call(NEW, "/api/theme")[1]["studio"]["preset"], "vice")
        self.assertFalse(call(NEW, "/api/profile")[1]["onboarded"])
        self.assertEqual(call(NEW, "/api/backup/restore-status")[1]["source"], "zip")


class FrontEndSyntax(unittest.TestCase):
    @unittest.skipIf(shutil.which("node") is None, "node não instalado")
    def test_scripts_parse(self):
        for js in ("web/onboarding.js", "web/vendor/lfn-themes.js"):
            p = subprocess.run([shutil.which("node"), "--check", js], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(p.returncode, 0, js + ": " + p.stderr)

    def test_presets_match_server(self):
        src = (ROOT / "web" / "vendor" / "lfn-themes.js").read_text("utf-8")
        app_src = (ROOT / "app.py").read_text("utf-8")
        import re
        order = re.search(r"const ORDER = \[([^\]]+)\]", src).group(1)
        js_ids = re.findall(r'"([a-z-]+)"', order)
        py_ids = re.findall(r'"([a-z-]+)"', re.search(r"THEMES = \(([^)]+)\)", app_src).group(1))
        self.assertEqual(js_ids, py_ids)


if __name__ == "__main__":
    unittest.main()
