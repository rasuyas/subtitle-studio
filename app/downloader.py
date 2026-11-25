"""yt-dlp wrapper with progress hooks."""
from __future__ import annotations

from pathlib import Path
from typing import Callable

import yt_dlp


def fetch_info(url: str) -> dict:
    with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True, "noplaylist": True}) as ydl:
        i = ydl.extract_info(url, download=False)
    return {"title": i.get("title"), "thumbnail": i.get("thumbnail"), "duration": i.get("duration"),
            "uploader": i.get("uploader")}


def download(url: str, out_dir: Path, audio_only: bool, on_progress: Callable[[float, str], None]) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)

    def hook(d):
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            pct = d["downloaded_bytes"] / total if total else 0
            on_progress(min(pct, 0.99), f"downloading {pct * 100:.0f}% {d.get('_speed_str', '').strip()}")
        elif d["status"] == "finished":
            on_progress(0.99, "merging streams")

    opts = {
        "outtmpl": str(out_dir / "source.%(ext)s"), "noplaylist": True, "quiet": True,
        "progress_hooks": [hook], "merge_output_format": "mp4",
        "format": ("bestaudio[ext=m4a]/bestaudio/best" if audio_only else
                   "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b"),
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
    return Path(info["requested_downloads"][0]["filepath"])
