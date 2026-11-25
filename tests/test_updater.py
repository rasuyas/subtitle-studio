import tempfile
import unittest
import urllib.error
import zipfile
from pathlib import Path
from unittest.mock import patch

from app.updater import API_URL, RAW_VERSION_URL, apply_archive, check_for_updates, parse_version


class UpdaterTests(unittest.TestCase):
    def test_parse_version(self):
        self.assertEqual(parse_version("v0.3.2"), (0, 3, 2))
        with self.assertRaises(ValueError):
            parse_version("0.3")

    @patch("app.updater._read_url")
    def test_release_check_and_raw_version_fallback(self, read_url):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "VERSION").write_text("0.3.0", encoding="utf-8")
            read_url.return_value = b'{"tag_name":"v0.3.2","zipball_url":"https://github.com/repo/release.zip"}'
            release = check_for_updates(root)
            self.assertTrue(release["update_available"])
            self.assertEqual(release["archive_url"], "https://github.com/repo/release.zip")
            self.assertEqual(read_url.call_args.args[0], API_URL)

            read_url.side_effect = [
                urllib.error.HTTPError(API_URL, 403, "rate limited", {}, None),
                b"0.3.2",
            ]
            fallback = check_for_updates(root)
            self.assertEqual(fallback["source"], "main")
            self.assertEqual(fallback["archive_url"], "https://github.com/rasuyas/subtitle-studio/archive/refs/heads/main.zip")
            self.assertEqual(read_url.call_args.args[0], RAW_VERSION_URL)

    def test_archive_updates_code_but_preserves_user_data(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "app"
            root.mkdir()
            (root / "VERSION").write_text("0.3.0", encoding="utf-8")
            (root / "requirements.txt").write_text("old-dependency\n", encoding="utf-8")
            (root / "fonts").mkdir()
            (root / "fonts" / "custom.ttf").write_bytes(b"custom font")
            (root / ".venv").mkdir()
            (root / ".venv" / "keep.txt").write_text("keep", encoding="utf-8")
            (root / "settings.json").write_text("local settings", encoding="utf-8")
            (root / "presets").mkdir()
            (root / "presets" / "custom.json").write_text("local preset", encoding="utf-8")
            (root / ".webview").mkdir()
            (root / ".webview" / "profile").write_text("browser data", encoding="utf-8")
            archive_path = Path(temp_dir) / "update.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("subtitle-studio-main/VERSION", "0.3.2")
                archive.writestr("subtitle-studio-main/requirements.txt", "new-dependency\n")
                archive.writestr("subtitle-studio-main/app/main.py", "updated")
                archive.writestr("subtitle-studio-main/fonts/default.ttf", b"new font")
                archive.writestr("subtitle-studio-main/.venv/replace.txt", "replace")
                archive.writestr("subtitle-studio-main/settings.json", "new settings")
                archive.writestr("subtitle-studio-main/presets/default.json", "new preset")
                archive.writestr("subtitle-studio-main/.webview/replacement", "new browser data")

            self.assertTrue(apply_archive(archive_path, root))
            self.assertEqual((root / "VERSION").read_text(encoding="utf-8"), "0.3.2")
            self.assertEqual((root / "app" / "main.py").read_text(encoding="utf-8"), "updated")
            self.assertEqual((root / "fonts" / "custom.ttf").read_bytes(), b"custom font")
            self.assertFalse((root / "fonts" / "default.ttf").exists())
            self.assertEqual((root / ".venv" / "keep.txt").read_text(encoding="utf-8"), "keep")
            self.assertFalse((root / ".venv" / "replace.txt").exists())
            self.assertEqual((root / "settings.json").read_text(encoding="utf-8"), "local settings")
            self.assertEqual((root / "presets" / "custom.json").read_text(encoding="utf-8"), "local preset")
            self.assertEqual((root / ".webview" / "profile").read_text(encoding="utf-8"), "browser data")

    def test_archive_rejects_traversal_paths(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "app"
            root.mkdir()
            archive_path = Path(temp_dir) / "unsafe.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("subtitle-studio-main/../../outside.txt", "unsafe")

            with self.assertRaises(ValueError):
                apply_archive(archive_path, root)
            self.assertFalse((Path(temp_dir) / "outside.txt").exists())


if __name__ == "__main__":
    unittest.main()
