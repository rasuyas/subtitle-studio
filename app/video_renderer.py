"""FFmpeg filter_complex builder + encoders (NVENC MP4, ProRes 4444 alpha MOV, VP9 alpha WebM)."""
from __future__ import annotations

import json
import subprocess
import sys
from collections import deque
from pathlib import Path
from typing import Callable

_SUBPROC_KW = {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}

OW, OH = 1080, 1920
PIP_BORDER = 6
PIP_RADIUS = 28


# --------------------------------------------------------------------------- probe
def probe(path: Path) -> dict:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)],
        capture_output=True, text=True, check=True, **_SUBPROC_KW)
    info = json.loads(r.stdout)
    v = next((s for s in info["streams"] if s["codec_type"] == "video" and s.get("disposition", {}).get("attached_pic", 0) == 0), None)
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    dur = float(info["format"].get("duration") or (v or a or {}).get("duration") or 0)
    meta = {"has_video": v is not None, "has_audio": a is not None, "duration": dur,
            "width": 0, "height": 0, "fps": 30.0, "fps_str": "30"}
    if v:
        rate = v.get("avg_frame_rate") or v.get("r_frame_rate") or "30/1"
        if rate in ("0/0", "0"):
            rate = v.get("r_frame_rate", "30/1")
        num, _, den = rate.partition("/")
        fps = float(num) / float(den or 1) if float(den or 1) else 30.0
        meta.update(width=int(v["width"]), height=int(v["height"]), fps=fps, fps_str=rate if den else num)
    return meta


# --------------------------------------------------------------------------- layout
def _even(v: float) -> int:
    return max(2, int(round(v / 2)) * 2)


def _crop(c: dict, sw: int, sh: int) -> str:
    x, y = max(0, min(sw - 2, int(c["x"] * sw))), max(0, min(sh - 2, int(c["y"] * sh)))
    w, h = _even(min(c["w"] * sw, sw - x)), _even(min(c["h"] * sh, sh - y))
    return f"crop={w}:{h}:{x}:{y}"


def _cover(crop: str, w: int, h: int) -> str:
    return f"{crop},scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"


def build_layout(layout: str, sw: int, sh: int, main: dict, face: dict, pip_corner: str = "br",
                 blur_bg: bool = False, fps: str = "30", dur: float = 1.0, src: str = "0:v") -> str:
    """Return a filter_complex fragment that ends with the [base] label (1080x1920)."""
    if layout in ("split50", "split35"):
        top_h = 960 if layout == "split50" else 672
        bot_h = OH - top_h
        return (f"[{src}]split=2[a][b];[a]{_cover(_crop(face, sw, sh), OW, top_h)}[top];"
                f"[b]{_cover(_crop(main, sw, sh), OW, bot_h)}[bot];[top][bot]vstack=inputs=2[base]")

    if layout == "pip":
        fw = _even(OW * 0.30)
        m = 48
        pos = {"tl": (m, m + 80), "tr": (OW - fw - m, m + 80),
               "bl": (m, OH - fw - m - 200), "br": (OW - fw - m, OH - fw - m - 200)}[pip_corner]
        r = PIP_RADIUS
        bw = fw + PIP_BORDER * 2

        def mask(rad, size):
            return (f"geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':"
                    f"a='clip(255*({rad}+0.5-hypot(max(abs(X-W/2+0.5)-(W/2-{rad}),0),max(abs(Y-H/2+0.5)-(H/2-{rad}),0))),0,255)'")
        return (f"[{src}]split=2[a][b];[a]{_cover(_crop(main, sw, sh), OW, OH)}[bg];"
                f"[b]{_cover(_crop(face, sw, sh), fw, fw)},format=yuva420p,{mask(r, fw)}[face];"
                f"color=c=white:s={bw}x{bw}:r={fps}:d={dur:.3f},format=yuva420p,{mask(r + PIP_BORDER, bw)}[ring];"
                f"[bg][ring]overlay={pos[0] - PIP_BORDER}:{pos[1] - PIP_BORDER}:format=auto[bg2];"
                f"[bg2][face]overlay={pos[0]}:{pos[1]}:format=auto[base]")

    # single full frame
    if blur_bg:
        return (f"[{src}]split=2[a][b];[a]scale={OW}:{OH}:force_original_aspect_ratio=increase,crop={OW}:{OH},"
                f"boxblur=40:6,eq=brightness=-0.08[bg];[b]{_crop(main, sw, sh)},scale={OW}:-2[fg];"
                f"[bg][fg]overlay=(W-w)/2:(H-h)/2[base]")
    return f"[{src}]{_cover(_crop(main, sw, sh), OW, OH)}[base]"


# --------------------------------------------------------------------------- ffmpeg runner
def run_ffmpeg(args: list[str], duration: float, on_progress: Callable[[float, str], None] | None = None):
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-progress", "pipe:1", "-nostats"] + args
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, **_SUBPROC_KW)
    tail: deque[str] = deque(maxlen=25)
    for line in p.stdout:
        line = line.strip()
        if line.startswith(("out_time_us=", "out_time_ms=")):
            try:
                t = int(line.split("=")[1]) / 1e6
                if on_progress and duration > 0:
                    on_progress(min(0.99, t / duration), f"encoding {t:.1f}s / {duration:.1f}s")
            except ValueError:
                pass
        elif "=" not in line or line.startswith(("error", "[")):
            tail.append(line)
    p.wait()
    if p.returncode != 0:
        raise RuntimeError("ffmpeg failed:\n" + "\n".join(tail))


def write_concat(segs, list_path: Path):
    lines = []
    for p, d in segs:
        lines += [f"file '{Path(p).as_posix()}'", f"duration {max(d, 0.001):.6f}"]
    lines.append(f"file '{Path(segs[-1][0]).as_posix()}'")  # concat demuxer quirk: repeat last
    list_path.write_text("\n".join(lines), encoding="utf-8")


def verify_alpha(path: Path) -> dict:
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=codec_name,pix_fmt,width,height,r_frame_rate:stream_tags=alpha_mode:format=duration",
                        "-print_format", "json", str(path)], capture_output=True, text=True, **_SUBPROC_KW)
    d = json.loads(r.stdout)
    s = d["streams"][0]
    return {"codec": s["codec_name"], "pix_fmt": s["pix_fmt"], "size": f"{s['width']}x{s['height']}",
            "fps": s["r_frame_rate"], "duration": float(d["format"]["duration"]),
            # ProRes 4444 reports yuva444p12le on decode; VP9 stores alpha as a side channel (alpha_mode tag)
            "alpha_ok": s["pix_fmt"].startswith("yuva") or s.get("tags", {}).get("alpha_mode") == "1"}


# --------------------------------------------------------------------------- exports
def export_mov_alpha(list_path: Path, out: Path, meta: dict, on_progress=None) -> dict:
    fps, dur = meta["fps_str"], meta["duration"]
    run_ffmpeg(["-f", "concat", "-safe", "0", "-i", str(list_path),
                "-vf", f"fps={fps},format=yuva444p10le", "-t", f"{dur:.3f}",
                "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", "-alpha_bits", "16",
                "-vendor", "apl0", str(out)], dur, on_progress)
    return verify_alpha(out)


def export_webm_alpha(list_path: Path, out: Path, meta: dict, on_progress=None) -> dict:
    fps, dur = meta["fps_str"], meta["duration"]
    run_ffmpeg(["-f", "concat", "-safe", "0", "-i", str(list_path),
                "-vf", f"fps={fps},format=yuva420p", "-t", f"{dur:.3f}",
                "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "24",
                "-auto-alt-ref", "0", str(out)], dur, on_progress)
    return verify_alpha(out)


def export_mp4(src: Path, list_path: Path, out: Path, meta: dict, layout_args: dict, on_progress=None) -> dict:
    fps, dur = meta["fps_str"], meta["duration"]
    if layout_args.get("reframe", False):
        layout = build_layout(sw=meta["width"], sh=meta["height"], fps=fps, dur=dur, src="0:v",
                              **{k: v for k, v in layout_args.items() if k != "reframe"})
        subtitle_filter = f"fps={fps},format=rgba"
    else:
        layout = "[0:v]null[base]"
        width, height = meta["width"], meta["height"]
        subtitle_filter = (f"fps={fps},scale={width}:{height}:force_original_aspect_ratio=decrease,"
                           f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba")
    fc = (f"{layout};[1:v]{subtitle_filter}[sub];"
          f"[base][sub]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[v]")
    common = ["-i", str(src), "-f", "concat", "-safe", "0", "-i", str(list_path), "-filter_complex", fc,
              "-map", "[v]", "-map", "0:a?", "-c:a", "aac", "-b:a", "192k", "-t", f"{dur:.3f}", "-movflags", "+faststart"]
    if sys.platform == "darwin":
        preferred_encoder = "h264_videotoolbox"
        preferred_args = ["-c:v", preferred_encoder, "-b:v", "8M", "-pix_fmt", "yuv420p"]
    else:
        preferred_encoder = "h264_nvenc"
        preferred_args = ["-c:v", preferred_encoder, "-preset", "p4", "-rc", "vbr", "-cq", "20",
                          "-b:v", "0", "-pix_fmt", "yuv420p"]
    x264 = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p"]
    encoder = preferred_encoder
    try:
        run_ffmpeg(common + preferred_args + [str(out)], dur, on_progress)
    except RuntimeError:
        encoder = "libx264"
        if on_progress:
            on_progress(0.0, f"{preferred_encoder} unavailable, falling back to libx264")
        run_ffmpeg(common + x264 + [str(out)], dur, on_progress)
    return {"encoder": encoder, "duration": dur}


def layout_still(src: Path, t: float, meta: dict, layout_args: dict, out_png: Path):
    """Single composited layout frame (no subtitles) for the live preview."""
    if layout_args.get("reframe", True):
        layout = build_layout(sw=meta["width"], sh=meta["height"], fps="30", dur=1.0, src="0:v",
                              **{k: v for k, v in layout_args.items() if k != "reframe"})
    else:
        layout = "[0:v]null[base]"
    fc = f"{layout};[base]scale=540:960[v]"
    run_ffmpeg(["-ss", f"{max(t, 0):.3f}", "-i", str(src), "-filter_complex", fc, "-map", "[v]",
                "-frames:v", "1", str(out_png)], 0)
