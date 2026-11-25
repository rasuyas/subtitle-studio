import sys
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app import desktop


class DesktopWindowGeometryTests(unittest.TestCase):
    def test_initial_window_geometry_tracks_screen_and_stays_within_it(self):
        for screen_width, screen_height in ((800, 600), (1366, 768), (3840, 2160)):
            with self.subTest(screen=(screen_width, screen_height)):
                root = SimpleNamespace(
                    withdraw=lambda: None,
                    destroy=lambda: None,
                    winfo_screenwidth=lambda: screen_width,
                    winfo_screenheight=lambda: screen_height,
                )
                tkinter = SimpleNamespace(Tk=lambda: root)
                with patch.dict(sys.modules, {"tkinter": tkinter}):
                    geometry = desktop._initial_window_geometry()

                self.assertEqual(geometry["width"], int(screen_width * 0.84))
                self.assertEqual(geometry["height"], int(screen_height * 0.84))
                self.assertLessEqual(geometry["min_size"][0], geometry["width"])
                self.assertLessEqual(geometry["min_size"][1], geometry["height"])


class DesktopUpdaterStatusTests(unittest.TestCase):
    def test_current_version_clears_available_state_and_resets_message(self):
        api = desktop.DesktopApi.__new__(desktop.DesktopApi)
        api._update_lock = threading.Lock()
        api._update_status = {
            "state": "checking",
            "update_available": True,
            "archive_url": "https://example.com/update.zip",
        }
        result = {
            "current_version": "0.3.1",
            "latest_version": "0.3.1",
            "update_available": False,
            "archive_url": "https://example.com/update.zip",
            "source": "release",
        }
        with patch("app.desktop.updater.check_for_updates", return_value=result):
            api._check_update_worker()

        status = api.get_update_status()
        self.assertEqual(status["state"], "current")
        self.assertFalse(status["update_available"])
        self.assertIsNone(status["archive_url"])
        self.assertEqual(status["message"], "Up to date (v0.3.1)")

    def test_staged_update_clears_available_flag_and_archive_url(self):
        api = desktop.DesktopApi.__new__(desktop.DesktopApi)
        api._update_lock = threading.Lock()
        api._update_status = {
            "state": "available",
            "update_available": True,
            "archive_url": "https://example.com/update.zip",
        }
        with patch("app.desktop.updater.download_and_apply", return_value=False):
            api._stage_update_worker("https://example.com/update.zip")

        status = api.get_update_status()
        self.assertEqual(status["state"], "staged")
        self.assertFalse(status["update_available"])
        self.assertIsNone(status["archive_url"])


if __name__ == "__main__":
    unittest.main()
