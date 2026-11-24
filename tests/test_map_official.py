"""Official map tiler: calibration fit, tile pyramid, config and rebuild skipping. Offline."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import map_official as mo  # noqa: E402

try:
    from PIL import Image
except ImportError:
    Image = None


@unittest.skipIf(Image is None, "Pillow ausente")
class OfficialMap(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.src = self.tmp / "mapa_oficial.png"
        Image.new("RGB", (1200, 1600), (10, 120, 200)).save(self.src)

    def test_fit_recovers_known_transform(self):
        # units = 0.1*px + 200 (x), 0.1*px + 150 (y)
        cal = {"pontos": [{"x": 0.1 * u + 200, "y": 0.1 * v + 150, "px": [u, v]}
                          for u, v in ((100, 200), (1000, 300), (500, 1400))]}
        (x0, y0, x1, y1), worst = mo.bounds_for(1200, 1600, cal, {})
        self.assertAlmostEqual(x0, 200, 4); self.assertAlmostEqual(y0, 150, 4)
        self.assertAlmostEqual(x1, 320, 4); self.assertAlmostEqual(y1, 310, 4)
        self.assertLess(worst, 1e-6)

    def test_place_names_and_errors(self):
        places = {"vice city": (500.0, 490.0), "capri": (290.0, 507.0)}
        cal = {"pontos": [{"lugar": "Vice City", "px": [800, 700]}, {"lugar": "capri", "px": [200, 760]}]}
        mo.bounds_for(1200, 1600, cal, places)
        with self.assertRaises(mo.MapError):
            mo.bounds_for(1200, 1600, {"pontos": [{"lugar": "Nowhere", "px": [1, 1]}]}, places)
        with self.assertRaises(mo.MapError):
            mo.bounds_for(1200, 1600, {"pontos": [{"lugar": "Vice City", "px": [1, 1]}]}, places)

    def test_build_and_skip(self):
        cal = json.dumps({"pontos": [{"x": 300, "y": 300, "px": [0, 0]}, {"x": 450, "y": 500, "px": [1200, 1600]}]})
        (self.tmp / mo.CALIBRATION).write_text(cal, "utf-8")
        out = self.tmp / "map_official"
        cfg = mo.ensure(out, ROOT / "web", self.tmp, log=lambda m: None)
        self.assertTrue(cfg and cfg["calibrated"])
        self.assertEqual(cfg["bounds"], [300, 300, 450, 500])
        self.assertEqual(cfg["maxNative"], 3)            # 8 px per unit -> zoom 3
        tiles = list(out.rglob("*.webp"))
        self.assertEqual(len(tiles), cfg["tiles"])
        with Image.open(tiles[0]) as t:
            self.assertEqual(t.size, (256, 256))
        self.assertTrue((out / "config.js").read_text("utf-8").startswith("window.LFN_MAP_IMG={"))
        self.assertIsNone(mo.ensure(out, ROOT / "web", self.tmp, log=lambda m: None))  # unchanged -> no rebuild
        self.assertIsNone(mo.ensure(self.tmp / "x", ROOT / "web", self.tmp / "empty", log=lambda m: None))


if __name__ == "__main__":
    unittest.main()
