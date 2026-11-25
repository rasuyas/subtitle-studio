import unittest

from app.script_alignment import fix_words_from_script


class ScriptAlignmentTests(unittest.TestCase):
    def test_equal_length_corrections_keep_each_timestamp_and_script_formatting(self):
        words = [
            {"w": "helo", "start": 1.2, "end": 1.5},
            {"w": "world", "start": 1.6, "end": 2.0},
        ]

        fixed, count = fix_words_from_script(words, "Hello, WORLD!")

        self.assertEqual([word["w"] for word in fixed], ["Hello,", "WORLD!"])
        self.assertEqual([(word["start"], word["end"]) for word in fixed], [(1.2, 1.5), (1.6, 2.0)])
        self.assertEqual(count, 2)

    def test_split_replacement_spans_original_bounds_proportionally(self):
        words = [{"w": "gonna", "start": 2.0, "end": 3.2}]

        fixed, count = fix_words_from_script(words, "going to")

        self.assertEqual([word["w"] for word in fixed], ["going", "to"])
        self.assertEqual(fixed[0]["start"], 2.0)
        self.assertAlmostEqual(fixed[0]["end"], 2.0 + 1.2 * 5 / 7)
        self.assertAlmostEqual(fixed[1]["start"], fixed[0]["end"])
        self.assertEqual(fixed[1]["end"], 3.2)
        self.assertEqual(count, 2)

    def test_merge_replacement_uses_full_combined_span(self):
        words = [
            {"w": "side", "start": 4.0, "end": 4.3},
            {"w": "quest", "start": 4.35, "end": 5.0},
        ]

        fixed, count = fix_words_from_script(words, "sidequest")

        self.assertEqual(fixed, [{"w": "sidequest", "start": 4.0, "end": 5.0}])
        self.assertEqual(count, 1)

    def test_insertions_deletions_and_stage_directions_do_not_change_timing_or_word_count(self):
        words = [
            {"w": "we", "start": 0.0, "end": 0.2},
            {"w": "go", "start": 0.3, "end": 0.6},
            {"w": "now", "start": 0.7, "end": 1.0},
        ]

        fixed, _ = fix_words_from_script(words, "we uh go [laughs] now please")

        self.assertEqual([word["w"] for word in fixed], ["we", "go", "now"])
        self.assertEqual(
            [(word["start"], word["end"]) for word in fixed],
            [(word["start"], word["end"]) for word in words],
        )


if __name__ == "__main__":
    unittest.main()
