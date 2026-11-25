import io
import json
import tempfile
import unittest
import urllib.error
import zipfile
from pathlib import Path
from unittest.mock import patch

from app.updater import (
    API_URL,
    NIGHTLY_API_URL,
    RAW_VERSION_URL,
    apply_archive,
    check_for_updates,
    download_and_apply,
    parse_version,
)


class UpdaterTests(unittest.TestCase):
    def test_parse_version(self):
        self.assertEqual(parse_version("v0.3.2"), (0, 3, 2))
        with self.assertRaises(ValueError):
            parse_version("vv0.3.2")
        with self.assertRaises(ValueError):
            parse_version("0.3")

    @patch("app.updater._read_url")
    def test_release_check_and_raw_version_fallback(self, read_url):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "VERSION").write_text(" v0.3.0 \n", encoding="utf-8")
            read_url.return_value = b'{"tag_name":"v0.3.2","zipball_url":"https://github.com/repo/release.zip"}'
            release = check_for_updates(root)
            self.assertTrue(release["update_available"])
            self.assertEqual(release["current_version"], "0.3.0")
            self.assertEqual(release["latest_version"], "0.3.2")
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

    @patch("app.updater._read_url")
    def test_local_version_at_or_ahead_of_release_is_up_to_date(self, read_url):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "VERSION").write_text("0.3.5", encoding="utf-8")
            for tag in ("v0.3.5", "v0.3.2"):
                with self.subTest(tag=tag):
                    read_url.return_value = (
                        f'{{"tag_name":"{tag}","zipball_url":"https://github.com/repo/release.zip"}}'
                    ).encode("utf-8")
                    result = check_for_updates(root)
                    self.assertEqual(result["current_version"], "0.3.5")
                    self.assertEqual(result["latest_version"], tag.lstrip("v"))
                    self.assertFalse(result["update_available"])

    @patch("app.updater._read_url")
    def test_release_check_ignores_drafts_and_prereleases(self, read_url):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "VERSION").write_text("0.3.5", encoding="utf-8")
            for flag in ("draft", "prerelease"):
                with self.subTest(flag=flag):
                    release = {
                        "tag_name": "v9.9.9",
                        "name": "Nightly v9.9.9",
                        flag: True,
                    }
                    read_url.side_effect = [
                        json.dumps(release).encode("utf-8"),
                        b"0.3.6\n",
                    ]
                    result = check_for_updates(root)
                    self.assertEqual(result["source"], "main")
                    self.assertEqual(result["latest_version"], "0.3.6")
                    self.assertTrue(result["update_available"])

    @patch("app.updater._read_url")
    def test_release_version_comes_from_tag_not_verbose_title(self, read_url):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "VERSION").write_text("0.3.5", encoding="utf-8")
            read_url.return_value = (
                b'{"tag_name":"v0.3.6","name":"Nightly v9.9.9",'
                b'"zipball_url":"https://github.com/repo/release.zip"}'
            )
            result = check_for_updates(root)
            self.assertEqual(result["latest_version"], "0.3.6")
            self.assertTrue(result["update_available"])

    @patch("app.updater._read_url")
    def test_nightly_check_compares_commit_sha_and_uses_release_zip(self, read_url):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "VERSION").write_text("0.3.5", encoding="utf-8")
            full_sha = "abcdef0123456789abcdef0123456789abcdef01"
            release = {
                "tag_name": "nightly",
                "name": "Nightly (v0.3.6 @ abcdef0)",
                "target_commitish": full_sha,
                "prerelease": True,
                "zipball_url": "https://github.com/repo/nightly.zip",
            }
            read_url.return_value = json.dumps(release).encode("utf-8")
            marker = root / ".nightly_sha"

            marker.write_text("abcdef0\n", encoding="utf-8")
            current = check_for_updates(root, channel="Nightly")
            self.assertFalse(current["update_available"])
            self.assertEqual(current["nightly_sha"], full_sha)
            self.assertEqual(current["latest_version"], "0.3.6")
            self.assertEqual(current["archive_url"], release["zipball_url"])
            self.assertEqual(read_url.call_args.args[0], NIGHTLY_API_URL)

            marker.write_text("1234567", encoding="utf-8")
            available = check_for_updates(root, channel="Nightly")
            self.assertTrue(available["update_available"])

    @patch("app.updater._read_url")
    def test_nightly_check_falls_back_to_short_sha_in_release_title(self, read_url):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "VERSION").write_text("0.3.5", encoding="utf-8")
            read_url.return_value = (
                b'{"name":"Nightly (v0.3.6 @ 1234567)","target_commitish":"main",'
                b'"prerelease":true,"zipball_url":"https://github.com/repo/nightly.zip"}'
            )
            result = check_for_updates(root, channel="Nightly")
            self.assertEqual(result["nightly_sha"], "1234567")
            self.assertTrue(result["update_available"])

    def test_downloaded_nightly_records_sha_after_archive_install(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "app"
            root.mkdir()
            (root / "VERSION").write_text("0.3.5", encoding="utf-8")
            archive_data = io.BytesIO()
            with zipfile.ZipFile(archive_data, "w") as archive:
                archive.writestr("subtitle-studio-main/app/main.py", "updated")

            with patch(
                "app.updater.urllib.request.urlopen",
                return_value=io.BytesIO(archive_data.getvalue()),
            ):
                download_and_apply(
                    root,
                    "https://github.com/repo/nightly.zip",
                    nightly_sha="abcdef0123456789abcdef0123456789abcdef01",
                )

            self.assertEqual(
                (root / ".nightly_sha").read_text(encoding="utf-8"),
                "abcdef0123456789abcdef0123456789abcdef01\n",
            )

    def test_archive_updates_code_but_preserves_user_data(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "app"
            root.mkdir()
            (root / "VERSION").write_text("0.3.0-with-a-long-stale-suffix", encoding="utf-8")
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

    def test_archive_without_wrapper_installs_version_at_app_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "app"
            root.mkdir()
            (root / "VERSION").write_text("0.3.0", encoding="utf-8")
            archive_path = Path(temp_dir) / "flat-update.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("VERSION", "v0.3.1\n")
                archive.writestr("app/main.py", "updated")

            self.assertFalse(apply_archive(archive_path, root))
            self.assertEqual((root / "VERSION").read_text(encoding="utf-8"), "v0.3.1\n")
            self.assertFalse((root / "app" / "VERSION").exists())
            self.assertEqual((root / "app" / "main.py").read_text(encoding="utf-8"), "updated")

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
