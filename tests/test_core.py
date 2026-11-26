import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.script_alignment import fix_words_from_script
from app.transcript_editing import replace_transcript_matches
from app.updater import API_URL, check_for_updates, parse_version
from app.workspace_cleanup import cleanup_workspace


class CoreTests(unittest.TestCase):
    def test_semantic_versions_compare_version_file_to_release_tag(self):
        self.assertEqual(parse_version("v1.2.3-rc.1+build.4"), (1, 2, 3))
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "VERSION").write_text("v0.3.6\n", encoding="utf-8")
            with patch(
                "app.updater._read_url",
                return_value=b'{"tag_name":"v0.3.7","zipball_url":"https://example.test/release.zip"}',
            ) as read_url:
                result = check_for_updates(root)

        self.assertEqual(read_url.call_args.args[0], API_URL)
        self.assertEqual(result["current_version"], "0.3.6")
        self.assertEqual(result["latest_version"], "0.3.7")
        self.assertTrue(result["update_available"])
        with self.assertRaises(ValueError):
            parse_version("0.3")

    def test_search_replace_keeps_timestamps_when_token_count_is_unchanged(self):
        words = [
            {"w": "teh", "start": 1.2, "end": 1.5, "confidence": 0.8},
            {"w": "colour", "start": 1.6, "end": 2.0},
        ]
        matches = [{
            "start": 0, "firstIndex": 0, "lastIndex": 0,
            "firstOffset": 0, "lastOffset": 3,
        }]

        updated = replace_transcript_matches(words, matches, "the")

        self.assertEqual([word["w"] for word in updated], ["the", "colour"])
        self.assertEqual(
            [(word["start"], word["end"]) for word in updated],
            [(1.2, 1.5), (1.6, 2.0)],
        )
        self.assertEqual(updated[0]["confidence"], 0.8)
        self.assertEqual(words[0]["w"], "teh")

    def test_search_replace_with_more_tokens_stays_inside_original_time_span(self):
        words = [{"w": "gonna", "start": 2.0, "end": 3.2}]
        matches = [{
            "start": 0, "firstIndex": 0, "lastIndex": 0,
            "firstOffset": 0, "lastOffset": 5,
        }]

        updated = replace_transcript_matches(words, matches, "going to")

        self.assertEqual([word["w"] for word in updated], ["going", "to"])
        self.assertEqual(updated[0]["start"], 2.0)
        self.assertAlmostEqual(updated[0]["end"], 2.6)
        self.assertAlmostEqual(updated[1]["start"], updated[0]["end"])
        self.assertEqual(updated[1]["end"], 3.2)

    def test_script_typo_alignment_does_not_shift_timestamps(self):
        words = [
            {"w": "recieve", "start": 4.1, "end": 4.5},
            {"w": "it", "start": 4.6, "end": 4.8},
        ]

        fixed, count = fix_words_from_script(words, "receive it")

        self.assertEqual([word["w"] for word in fixed], ["receive", "it"])
        self.assertEqual(
            [(word["start"], word["end"]) for word in fixed],
            [(4.1, 4.5), (4.6, 4.8)],
        )
        self.assertEqual(count, 1)

    def test_workspace_cleanup_preserves_active_recent_and_non_job_data(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            stale = workspace / "0123456789"
            active = workspace / "abcdef0123"
            recent = workspace / "fedcba9876"
            for folder in (stale, active, recent):
                folder.mkdir()
                (folder / "source.mp4").write_text("temporary", encoding="utf-8")
            webview = workspace / ".webview"
            webview.mkdir()
            (webview / "profile").write_text("keep", encoding="utf-8")
            old_time = 1_000_000
            for path in (stale, active):
                for child in path.iterdir():
                    child.touch()
                    os.utime(child, (old_time, old_time))
                os.utime(path, (old_time, old_time))

            removed = cleanup_workspace(
                workspace,
                active_job_ids={"abcdef0123"},
                max_age_seconds=100,
                now=old_time + 200,
            )

            self.assertEqual([path.name for path in removed], ["0123456789"])
            self.assertFalse(stale.exists())
            self.assertTrue(active.exists())
            self.assertTrue(recent.exists())
            self.assertTrue((webview / "profile").exists())

    def test_startup_keeps_loaded_stale_project(self):
        from app import main

        with tempfile.TemporaryDirectory() as temp_dir, patch.object(main, "WORK", Path(temp_dir)), patch.object(main, "ensure_fonts"), patch.dict(main.JOBS, clear=True):
            project = Path(temp_dir) / "0123456789"
            project.mkdir()
            project_file = project / "project.json"
            project_file.write_text(json.dumps({"id": "0123456789", "name": "clip", "words": [], "settings": {}}), encoding="utf-8")
            source = project / "source.mp4"
            source.write_text("video", encoding="utf-8")
            old_time = 1_000_000
            for path in (project_file, source, project):
                os.utime(path, (old_time, old_time))

            async def start_and_stop():
                async with main._lifespan(main.app):
                    self.assertIn("0123456789", main.JOBS)

            asyncio.run(start_and_stop())

            self.assertTrue(project.exists())
            self.assertTrue(source.exists())

    def test_cleanup_days_rejects_out_of_range_and_saves_valid(self):
        from fastapi import HTTPException
        from app import main

        with tempfile.TemporaryDirectory() as temp_dir, patch.object(main, "CLEANUP_SETTINGS_PATH", Path(temp_dir) / "cleanup.json"):
            for bad in (0, -5, 31, 2.5, "3", True, None):
                with self.assertRaises(HTTPException):
                    main.set_cleanup_settings({"max_age_days": bad})
            self.assertFalse((Path(temp_dir) / "cleanup.json").exists())

            main.set_cleanup_settings({"max_age_days": 5})
            self.assertEqual(json.loads((Path(temp_dir) / "cleanup.json").read_text(encoding="utf-8")), {"max_age_days": 5})

    def test_project_save_then_load_round_trips(self):
        from app import main

        with tempfile.TemporaryDirectory() as temp_dir, patch.object(main, "WORK", Path(temp_dir)):
            job = main.Job("clip.mp4")
            job.words = [{"w": "hello", "start": 0.5, "end": 0.9}]
            job.settings = {"font_size": 80}
            job.save()
            loaded = main.Job.load(job.dir)

            self.assertEqual(loaded.id, job.id)
            self.assertEqual(loaded.name, "clip")
            self.assertEqual(loaded.words, job.words)
            self.assertEqual(loaded.settings, {"font_size": 80})


if __name__ == "__main__":
    unittest.main()
