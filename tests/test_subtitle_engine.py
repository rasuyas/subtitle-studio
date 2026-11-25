import unittest
from unittest.mock import patch

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


if __name__ == "__main__":
    unittest.main()
