from pathlib import Path
import unittest
from unittest.mock import patch

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

    def test_mp4_export_limits_decoder_and_x264_threads(self):
        def fail_nvenc(args, duration, on_progress=None):
            if "h264_nvenc" in args:
                raise RuntimeError("NVENC unavailable")
            self.captured["args"] = args

        video_renderer.run_ffmpeg = fail_nvenc
        self.export_graph({"reframe": False})
        args = self.captured["args"]
        self.assertEqual(args[:10], [
            "-threads", "1", "-i", "source.mp4", "-threads", "1", "-f",
            "concat", "-safe", "0",
        ])
        self.assertEqual(args[args.index("-c:v"):args.index("-c:v") + 4],
                         ["-c:v", "libx264", "-threads", "2"])

    def test_ffmpeg_limits_filter_complex_threads(self):
        process = type("Process", (), {"stdout": [], "returncode": 0, "wait": lambda self: None})()
        with patch.object(video_renderer.subprocess, "Popen", return_value=process) as popen:
            self.original_run_ffmpeg([], 1)
        command = popen.call_args.args[0]
        self.assertEqual(command[command.index("-filter_threads") + 1], "1")
        self.assertEqual(command[command.index("-filter_complex_threads") + 1], "1")

    def test_mov_export_limits_decoder_and_prores_threads(self):
        with patch.object(video_renderer, "verify_alpha", return_value={"alpha_ok": True}):
            video_renderer.export_mov_alpha(
                Path("subtitles.txt"),
                Path("output.mov"),
                {"fps_str": "30", "duration": 2.0},
            )
        args = self.captured["args"]
        self.assertEqual(args[:2], ["-threads", "1"])
        encoder_index = args.index("-c:v")
        self.assertEqual(args[encoder_index:encoder_index + 4],
                         ["-c:v", "prores_ks", "-threads", "1"])
