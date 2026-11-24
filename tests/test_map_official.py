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

    def test_warp_hits_points_and_fades_away(self):
        # straight fit units = 0.1*px + 200, with two points pulled off by a few units
        pts = [(100, 200, 0), (1000, 300, 0), (500, 1400, 0), (600, 800, 4), (900, 1200, -3)]
        cal = {"suavidade": 0, "pontos": [{"x": 0.1 * u + 200 + dx, "y": 0.1 * v + 150, "px": [u, v]}
                                          for u, v, dx in pts]}
        w, worst = mo.warp_for(1200, 1600, cal, {})
        self.assertIsNotNone(w)
        self.assertLess(worst, 1e-6)
        (x0, y0, x1, y1), straight = mo.bounds_for(1200, 1600, cal, {})
        self.assertGreater(straight, 1)
        far = w(x0 - 500, y0 - 500)                        # far from every point -> straight fit
        self.assertAlmostEqual(far[0], (-500) * 1200 / (x1 - x0), 3)
        self.assertIsNone(mo.warp_for(1200, 1600, {"pontos": cal["pontos"][:3]}, {})[0])
        self.assertIsNone(mo.warp_for(1200, 1600, dict(cal, deformar=False), {})[0])

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
        self.assertFalse(cfg["warped"])

    def test_build_warped(self):
        cal = {"pontos": [{"x": 300 + u / 8 + d, "y": 300 + v / 8, "px": [u, v]}
                          for u, v, d in ((0, 0, 0), (1200, 0, 0), (0, 1600, 0), (1200, 1600, 0), (600, 800, 5))]}
        cfg, worst = mo.build(self.src, self.tmp / "w", ROOT / "web", json.dumps(cal))
        self.assertTrue(cfg["warped"])
        self.assertLess(worst, 1.0)
        self.assertEqual(len(list((self.tmp / "w").rglob("*.webp"))), cfg["tiles"])


if __name__ == "__main__":
    unittest.main()
