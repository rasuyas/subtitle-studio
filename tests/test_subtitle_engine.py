import unittest
from pathlib import Path
from unittest.mock import patch

from app import subtitle_engine as se
from app.subtitle_engine import _layout, render_state


class SubtitleLayoutTests(unittest.TestCase):
    def test_pill_padding_does_not_change_word_positions_or_wrapping(self):
        class Font:
            @staticmethod
            def getlength(text):
                return 5 if text == " " else len(text) * 10

        font = Font()
        texts = ["aa", "bb", "cc"]
        without_padding = _layout(texts, font, {"style": "pill", "pad_x": 0}, canvas_w=100)
        with_padding = _layout(texts, font, {"style": "pill", "pad_x": 60}, canvas_w=100)

        self.assertEqual(with_padding, without_padding)
        self.assertEqual(without_padding, [([(0, 0.0, 20), (1, 25.0, 20), (2, 50.0, 20)], 70.0)])

    def test_line_spacing_changes_multi_line_text_block_height(self):
        words = [{"w": "FIRST"}, {"w": "SECOND"}]

        def render(spacing):
            image = render_state(words, active=None, style={"line_spacing": spacing, "y_pos": 0.5})
            return image.getchannel("A").getbbox()

        def two_lines(texts, font, st, canvas_w):
            return [
                ([(i, 0, font.getlength(text))], font.getlength(text))
                for i, text in enumerate(texts)
            ]

        with patch("app.subtitle_engine._layout", side_effect=two_lines):
            compact = render(0.8)
            expanded = render(2.0)

        self.assertIsNotNone(compact)
        self.assertIsNotNone(expanded)
        self.assertGreater(expanded[3] - expanded[1], compact[3] - compact[1])


class FontCatalogTests(unittest.TestCase):
    def tearDown(self):
        se._font_index.cache_clear()
        se.get_font.cache_clear()

    def test_font_metadata_names_and_legacy_filename_alias_preserve_path(self):
        path = se.FONT_DIR / "arialbd.ttf"
        font = type("Font", (), {"getname": lambda self: ("Arial", "Bold")})()

        with (
            patch.object(se, "_font_files", side_effect=lambda directory: [path] if directory == se.FONT_DIR else []),
            patch.object(se, "_system_font_dirs", return_value=[]),
            patch.object(se.ImageFont, "truetype", return_value=font),
        ):
            se._font_index.cache_clear()
            se.get_font.cache_clear()
            self.assertEqual(se.list_fonts(), ["Arial Bold"])
            self.assertEqual(se._font_catalog()["Arial Bold"], path)
            self.assertEqual(se.get_font("arialbd", 16), font)
            self.assertEqual(se.font_file_path(se.font_file_ids()["Arial Bold"]), path)

    def test_unreadable_font_metadata_uses_clean_legacy_name(self):
        with patch.object(se.ImageFont, "truetype", side_effect=OSError("bad font")):
            self.assertEqual(se._font_display_name(Path("ANTQUAB.ttf")), "Book Antiqua Bold")


if __name__ == "__main__":
    unittest.main()
