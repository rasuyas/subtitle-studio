from pathlib import Path
import unittest

from app import video_renderer


class VideoRendererTests(unittest.TestCase):
    def setUp(self):
        self.captured = {}

        def fake_run_ffmpeg(args, duration, on_progress=None):
            self.captured["args"] = args

        self.original_run_ffmpeg = video_renderer.run_ffmpeg
        video_renderer.run_ffmpeg = fake_run_ffmpeg

    def tearDown(self):
        video_renderer.run_ffmpeg = self.original_run_ffmpeg

    def export_graph(self, layout_args):
        video_renderer.export_mp4(
            Path("source.mp4"),
            Path("subtitles.txt"),
            Path("output.mp4"),
            {"fps_str": "30", "duration": 2.0, "width": 1920, "height": 1080},
            layout_args,
        )
        args = self.captured["args"]
        return args[args.index("-filter_complex") + 1]

    def test_export_mp4_without_reframing_preserves_source_stream(self):
        graph = self.export_graph({"reframe": False})
        self.assertIn("[0:v]null[base]", graph)
        self.assertIn("[1:v]fps=30,scale=1920:1080:force_original_aspect_ratio=decrease", graph)
        self.assertIn("pad=1920:1080", graph)
        self.assertNotIn("crop=", graph)
        self.assertNotIn("[0:v]scale=", graph)

    def test_export_mp4_with_reframing_keeps_existing_layout(self):
        graph = self.export_graph({
            "reframe": True,
            "layout": "single",
            "main": {"x": 0, "y": 0, "w": 1, "h": 1},
            "face": {"x": 0, "y": 0, "w": 1, "h": 1},
            "pip_corner": "br",
            "blur_bg": False,
        })
        self.assertIn("crop=1080:1920", graph)
        self.assertIn("scale=1080:1920", graph)
