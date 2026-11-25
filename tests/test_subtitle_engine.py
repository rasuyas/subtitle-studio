import unittest

from app.subtitle_engine import _layout


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


if __name__ == "__main__":
    unittest.main()
