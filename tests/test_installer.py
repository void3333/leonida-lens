"""Windows installer support: bundled Node.js lookup in publisher.py and the build script's static parts.
Run: python tests/test_installer.py   (does not download anything nor build the .exe)
"""
import os, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

import publisher  # noqa: E402
import build_installer  # noqa: E402


class BundledNode(unittest.TestCase):
    def test_absent_without_runtime(self):
        self.assertIsNone(publisher.bundled_node(Path(tempfile.gettempdir()) / "lfn-no-such-app"))

    def test_found_and_put_first_on_path(self):
        with tempfile.TemporaryDirectory() as d:
            node = Path(d) / "runtime" / "node"
            node.mkdir(parents=True)
            (node / "npx.cmd").write_text("@echo off\n")
            self.assertEqual(publisher.bundled_node(Path(d)), node)
            env = publisher.node_env(Path(d), CI="1")
            self.assertTrue(env["PATH"].startswith(str(node) + os.pathsep))
            self.assertEqual(env["CI"], "1")


class BuildScript(unittest.TestCase):
    def test_app_files_exist_and_version(self):
        for f in build_installer.APP_FILES + build_installer.APP_DIRS:
            self.assertTrue((ROOT / f).exists(), f)
        import version
        self.assertEqual(build_installer.app_version(), version.__version__)

    def test_inno_script(self):
        iss = build_installer.iss_script("9.9.9")
        self.assertNotIn("@", iss.replace("@echo", ""))  # every placeholder replaced
        for needle in ("PrivilegesRequired=lowest", r"DefaultDirName={localappdata}\Programs\{#AppName}",
                       "skipifsilent", "BrazilianPortuguese.isl", "LeonidaLens-Setup-9.9.9", "NÃO serão apagados"):
            self.assertIn(needle, iss)
        # the uninstaller only cleans folders inside {app}; never the user's data folder
        for line in iss.splitlines():
            if line.startswith("Type: filesandordirs"):
                self.assertIn('"{app}\\', line)
        self.assertNotIn("LeonidaFieldNotes\\", iss.split("[UninstallDelete]")[1])


if __name__ == "__main__":
    unittest.main()
