"""Ordem do acervo: fotos ordenadas pela hora REAL da captura, não pela hora de importação.
Reproduz um lote da nuvem PlayStation que chega com as fotos mais novas primeiro.
Run: python -m unittest discover -s tests -v
"""
import importlib
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None


@unittest.skipIf(Image is None, "Pillow necessário")
class CaptureOrder(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        os.environ["LEONIDA_DATA_DIR"] = str(Path(cls.tmp.name) / "data")
        sys.path.insert(0, str(ROOT))
        if "app" in sys.modules:
            del sys.modules["app"]
        cls.app = importlib.import_module("app")
        cls.app.init_db()

    @classmethod
    def tearDownClass(cls):
        os.environ.pop("LEONIDA_DATA_DIR", None)
        cls.tmp.cleanup()

    def make(self, color, name):
        path = Path(self.tmp.name) / name
        Image.new("RGB", (64, 36), color).save(path, "JPEG")
        return path

    def test_psn_batch_newest_first_keeps_capture_order(self):
        app = self.app
        # A Sony entrega a mais nova primeiro: 12:00, 11:00, 10:00 (importadas nessa sequência).
        batch = [("12:00", (200, 0, 0)), ("11:00", (0, 200, 0)), ("10:00", (0, 0, 200))]
        ids = {}
        for hhmm, color in batch:
            pid, created = app.ingest(self.make(color, f"GTA_2026-11-22_{hhmm[:2]}.jpg"),
                                      name=f"GTA_2026-11-22_{hhmm[:2]}.jpg", captured_at=f"2026-11-22T{hhmm}:00Z")
            self.assertTrue(created)
            ids[hhmm] = pid
        batch_ids = set(ids.values())
        listed = [p["id"] for p in app.rows("SELECT * FROM photos ORDER BY date_taken DESC, COALESCE(captured_at, imported_at) DESC") if p["id"] in batch_ids]
        self.assertEqual(listed, [ids["12:00"], ids["11:00"], ids["10:00"]], "a mais recente deve vir primeiro")
        acc = app.accession_numbers(app.rows("SELECT * FROM photos"))
        self.assertLess(acc[ids["10:00"]], acc[ids["11:00"]])
        self.assertLess(acc[ids["11:00"]], acc[ids["12:00"]], "tombos crescem com a hora da captura")

    def test_old_import_without_time_is_completed_by_psn(self):
        app = self.app
        pid, _ = app.ingest(self.make((9, 9, 9), "old.jpg"), name="old.jpg")
        with app.db() as cx:
            cx.execute("INSERT INTO psn_imports VALUES(?,?,?,?,?)", ("media-old", pid, "GTA", "2026-11-22", app.iso_now()))
            cx.commit()
        app.psn_capture_update("media-old", "2026-11-22T08:30:00Z")
        row = app.row_by_id("photos", pid)
        self.assertEqual(row["captured_at"], "2026-11-22T08:30:00+00:00")


if __name__ == "__main__":
    unittest.main()


@unittest.skipIf(Image is None, "Pillow necessário")
class EssaySlots(unittest.TestCase):
    """Ensaios-pauta: a foto colocada na vaga herda título, local, hora, clima, frase e ponto no mapa."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        os.environ["LEONIDA_DATA_DIR"] = str(Path(cls.tmp.name) / "data")
        sys.path.insert(0, str(ROOT))
        sys.modules.pop("app", None)
        cls.app = importlib.import_module("app")
        cls.app.init_db()

    @classmethod
    def tearDownClass(cls):
        os.environ.pop("LEONIDA_DATA_DIR", None)
        cls.tmp.cleanup()

    def test_seed_assign_and_clear(self):
        app = self.app
        import json
        n = len(json.loads((ROOT / "web" / "vendor" / "lfn-ensaios.json").read_text("utf-8"))["essays"])
        self.assertGreaterEqual(n, 10)
        self.assertEqual(app.seed_essays(), n)
        self.assertEqual(app.seed_essays(), 0, "não duplica ensaios-pauta")
        essays = app.essays_with_slots()
        self.assertEqual(len(essays), n)
        self.assertTrue(all(len(e["slots"]) == 20 and not e["published"] for e in essays))
        slot = next(s for e in essays for s in e["slots"] if s["map_x"] is not None and s["phrase"])
        path = Path(self.tmp.name) / "x.jpg"
        Image.new("RGB", (64, 36), (10, 20, 30)).save(path, "JPEG")
        pid, _ = app.ingest(path, name="x.jpg")
        app.assign_slot(slot["id"], pid)
        ph = app.row_by_id("photos", pid)
        self.assertEqual((ph["title"], ph["notes"], ph["essay_id"]), (slot["title"], slot["phrase"], slot["essay_id"]))
        self.assertEqual((ph["map_x"], ph["map_y"]), (slot["map_x"], slot["map_y"]))
        cat = app.gallery_catalog(public_only=True)
        self.assertIsNone(next(p for p in cat["photos"] if p["id"] == pid)["essay_id"], "rascunho não aparece para visitantes")
        app.clear_slot(slot["id"])
        self.assertIsNone(app.row_by_id("photos", pid)["essay_id"])


@unittest.skipIf(Image is None, "Pillow necessário")
class TemplateRefresh(unittest.TestCase):
    """Atualizar pautas não perde fotos nem textos editados pelo fotógrafo."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        os.environ["LEONIDA_DATA_DIR"] = str(Path(cls.tmp.name) / "data")
        sys.path.insert(0, str(ROOT))
        sys.modules.pop("app", None)
        cls.app = importlib.import_module("app")
        cls.app.init_db()
        # cópia isolada da pasta web/vendor para trocar o arquivo de pautas
        import json, shutil
        web = Path(cls.tmp.name) / "web"
        (web / "vendor").mkdir(parents=True)
        for f in ("lfn-ensaios.json", "leonida-places.json"):
            shutil.copy2(ROOT / "web" / "vendor" / f, web / "vendor" / f)
        cls.app.WEB = web
        cls.json = json

    @classmethod
    def tearDownClass(cls):
        os.environ.pop("LEONIDA_DATA_DIR", None)
        cls.tmp.cleanup()

    def test_refresh_keeps_photos_and_user_edits(self):
        app = self.app
        app.seed_essays()
        e = app.essays_with_slots()[0]
        s0, s1 = e["slots"][0], e["slots"][1]
        pics = []
        for i, sl in enumerate((s0, s1)):
            path = Path(self.tmp.name) / f"p{i}.jpg"
            Image.new("RGB", (64, 36), (i * 90, 20, 30)).save(path, "JPEG")
            pid, _ = app.ingest(path, name=f"p{i}.jpg")
            app.assign_slot(sl["id"], pid)
            pics.append(pid)
        with app.db() as cx:   # o fotógrafo reescreveu o título da segunda foto
            cx.execute("UPDATE photos SET title='Meu título' WHERE id=?", (pics[1],)); cx.commit()
        f = app.WEB / "vendor" / "lfn-ensaios.json"
        data = self.json.loads(f.read_text("utf-8"))
        tpl = next(x for x in data["essays"] if x["key"] == e["template_key"])
        tpl["slots"][0]["title"] = "Novo título abstrato"
        tpl["slots"][0]["phrase"] = "Uma frase nova que serve para muitas fotos diferentes."
        tpl["slots"][1]["title"] = "Outro título novo"
        f.write_text(self.json.dumps(data, ensure_ascii=False), "utf-8")
        st = app.refresh_templates()
        self.assertGreaterEqual(st["slots"], 20)
        a, b = app.row_by_id("photos", pics[0]), app.row_by_id("photos", pics[1])
        self.assertEqual((a["title"], a["notes"], a["essay_id"]), ("Novo título abstrato", "Uma frase nova que serve para muitas fotos diferentes.", e["id"]))
        self.assertEqual(b["title"], "Meu título", "texto editado pelo fotógrafo é preservado")
        slots = {sl["id"]: sl for x in app.essays_with_slots() for sl in x["slots"]}
        self.assertEqual(slots[s0["id"]]["photo_id"], pics[0], "foto continua na vaga")
