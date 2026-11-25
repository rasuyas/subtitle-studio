import sys
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


if __name__ == "__main__":
    unittest.main()
