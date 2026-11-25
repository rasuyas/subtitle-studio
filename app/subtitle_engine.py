"""Phrase chunking + Pillow RGBA subtitle rendering (rounded pill, color pop, pop-in)."""
from __future__ import annotations

import functools
import os
from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_DIR = Path(__file__).resolve().parent.parent / "fonts"
W, H = 1080, 1920
PREFERRED = ["Montserrat-ExtraBold", "Poppins-ExtraBold", "Anton-Regular"]
BREAK_CHARS = ".,?!;:…"

DEFAULT_STYLE = {
    "style": "pill",            # pill | pop | popin
    "font": "Montserrat-ExtraBold",
    "font_size": 84,
    "uppercase": True,
    "text_color": "#FFFFFF",
    "stroke_width": 6,
    "stroke_color": "#000000",
    "shadow_dx": 4, "shadow_dy": 6, "shadow_blur": 5, "shadow_opacity": 0.85,
    "y_pos": 0.72,              # 0.10 - 0.90, vertical center of the text block
    # pill style
    "highlight_color": "#E50914", "box_fill": True, "box_stroke": False,
    "box_stroke_color": "#FFFFFF", "box_stroke_width": 4,
    "border_radius": 14, "pad_x": 22, "pad_y": 10,
    # color pop style
    "pop_color": "#FFE600", "pop_scale": 1.12,
}


# --------------------------------------------------------------------------- fonts
def _system_font_dirs() -> list[Path]:
    if sys.platform == "win32":
        dirs = [Path(r"C:\Windows\Fonts")]
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            dirs.append(Path(local_app_data) / "Microsoft" / "Windows" / "Fonts")
        return dirs
    if sys.platform.startswith("linux"):
        return [Path("/usr/share/fonts"), Path("/usr/local/share/fonts"),
                Path.home() / ".local" / "share" / "fonts"]
    return []


def _font_files(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    return sorted(
        (p for p in directory.rglob("*") if p.is_file() and p.suffix.lower() in (".ttf", ".otf")),
        key=lambda p: (p.stem.casefold(), p.suffix.lower() != ".ttf", str(p).casefold()),
    )


@functools.lru_cache(maxsize=1)
def _font_catalog() -> tuple[dict[str, Path], set[str]]:
    paths: dict[str, Path] = {}
    custom_names = set()
    for path in _font_files(FONT_DIR):
        paths.setdefault(path.stem, path)
        custom_names.add(path.stem)
    for directory in _system_font_dirs():
        for path in _font_files(directory):
            paths.setdefault(path.stem, path)
    return paths, custom_names


def list_fonts() -> list[str]:
    paths, custom_names = _font_catalog()
    preferred = [name for name in PREFERRED if name in paths]
    custom = sorted(custom_names - set(preferred))
    system = sorted(paths.keys() - custom_names - set(preferred))
    return preferred + custom + system


@functools.lru_cache(maxsize=64)
def get_font(name: str, size: int) -> ImageFont.FreeTypeFont:
    path = _font_catalog()[0].get(name)
    if path:
        f = ImageFont.truetype(str(path), size)
        try:  # variable fonts: pick the ExtraBold instance
            names = [n.decode() if isinstance(n, bytes) else n for n in f.get_variation_names()]
            if "ExtraBold" in names:
                f.set_variation_by_name("ExtraBold")
        except Exception:
            pass
        return f
    fonts = list_fonts()
    if fonts:
        return get_font(fonts[0], size)
    return ImageFont.load_default(size)


def _rgb(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha


# --------------------------------------------------------------------------- chunking
def clean_words(words: list[dict]) -> list[dict]:
    out = []
    for w in words:
        t = str(w.get("w", "")).strip()
        if t:
            out.append({"w": t, "start": float(w["start"]), "end": float(w["end"])})
    out.sort(key=lambda x: x["start"])
    return out


def chunk_words(words: list[dict], max_words: int = 3, max_chars: int = 24, pause: float = 0.55) -> list[dict]:
    """Group words into phrases: max words, max chars, break on punctuation or long pauses."""
    words = clean_words(words)
    for i, w in enumerate(words):
        w["i"] = i  # index into the (sorted, cleaned) word list, used by the transcript editor
    max_words = max(1, min(5, int(max_words)))
    phrases, cur = [], []

    def flush():
        if cur:
            phrases.append({"id": len(phrases), "start": cur[0]["start"], "end": cur[-1]["end"], "words": list(cur)})
            cur.clear()

    for w in words:
        if cur:
            chars = sum(len(x["w"]) + 1 for x in cur) + len(w["w"])
            gap = w["start"] - cur[-1]["end"]
            if (len(cur) >= max_words or chars > max_chars or gap > pause
                    or cur[-1]["w"][-1] in BREAK_CHARS):
                flush()
        cur.append(w)
    flush()
    return phrases


def build_timeline(phrases: list[dict], total: float, fps: float = 30.0, hold: float = 0.2):
    """Return [(key, t0, t1)] covering [0, total]. key=None is blank, else (phrase_idx, active_word_idx)."""
    events = []
    for pi, p in enumerate(phrases):
        ws = p["words"]
        nxt = phrases[pi + 1]["words"][0]["start"] if pi + 1 < len(phrases) else total
        for wi, w in enumerate(ws):
            t1 = ws[wi + 1]["start"] if wi + 1 < len(ws) else min(w["end"] + hold, nxt)
            events.append(((pi, wi), w["start"], t1))
    out, cur = [], 0.0
    for key, t0, t1 in events:
        t0 = max(t0, cur)
        t1 = min(t1, total)
        if t1 - t0 < 0.5 / fps:
            continue
        if t0 - cur > 1e-4:
            out.append((None, cur, t0))
        out.append((key, t0, t1))
        cur = t1
    if total - cur > 1e-4:
        out.append((None, cur, total))
    return out or [(None, 0.0, max(total, 0.1))]


# --------------------------------------------------------------------------- rendering
def _layout(texts, font, st, canvas_w: int = W):
    """Greedy line wrap. Returns list of lines; each line = list of (word_idx, x, width)."""
    space = font.getlength(" ")
    gap = space + (st["pad_x"] if st["style"] == "pill" else 0)
    max_w = canvas_w * 0.9
    lines, line, x = [], [], 0.0
    for i, t in enumerate(texts):
        wd = font.getlength(t)
        if line and x + gap + wd > max_w:
            lines.append((line, x))
            line, x = [], 0.0
        if line:
            x += gap
        line.append((i, x, wd))
        x += wd
    if line:
        lines.append((line, x))
    return lines


def render_state(words: list[dict], active: int | None, style: dict | None = None,
                 scale: float = 1.0) -> Image.Image:
    """Render one transparent RGBA frame with all words of a phrase and `active` highlighted."""
    st = {**DEFAULT_STYLE, **(style or {})}
    canvas_w, canvas_h = int(round(W * scale)), int(round(H * scale))
    img = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    if not words:
        return img

    for metric in ("font_size", "stroke_width", "shadow_dx", "shadow_dy", "shadow_blur",
                   "box_stroke_width", "border_radius", "pad_x", "pad_y"):
        st[metric] *= scale

    size = max(1, int(round(st["font_size"])))
    font = get_font(st["font"], size)
    texts = [w["w"].upper() if st["uppercase"] else w["w"] for w in words]
    visible = len(words) if st["style"] != "popin" else (active + 1 if active is not None else 0)
    if visible == 0:
        return img

    lines = _layout(texts, font, st, canvas_w)
    ascent, descent = font.getmetrics()
    line_h = int((ascent + descent) * 1.08)
    block_h = line_h * len(lines)
    sw = int(st["stroke_width"])
    margin = int(sw + st["shadow_blur"] * 3 + max(abs(st["shadow_dx"]), abs(st["shadow_dy"])) + st["pad_y"] + size * 0.3 + 24 * scale)

    top = int(canvas_h * st["y_pos"] - block_h / 2)
    oy = max(0, min(canvas_h - (block_h + 2 * margin), top - margin))
    lh = min(canvas_h, block_h + 2 * margin)
    box_layer = Image.new("RGBA", (canvas_w, lh), (0, 0, 0, 0))
    text_layer = Image.new("RGBA", (canvas_w, lh), (0, 0, 0, 0))
    shadow_mask = Image.new("L", (canvas_w, lh), 0)
    td, sd = ImageDraw.Draw(text_layer), ImageDraw.Draw(shadow_mask)

    cap_h = -font.getbbox("H", anchor="ls")[1]
    is_pill = st["style"] == "pill"
    is_pop = st["style"] == "pop"

    for li, (line, line_w) in enumerate(lines):
        x0 = (canvas_w - line_w) / 2
        baseline = top + li * line_h + ascent - oy
        for idx, rel_x, wd in line:
            if idx >= visible:
                continue
            x = x0 + rel_x
            is_active = idx == active
            f, fill, bx, by = font, _rgb(st["text_color"]), x, baseline
            if is_active and is_pop:
                f = get_font(st["font"], int(size * st["pop_scale"]))
                fill = _rgb(st["pop_color"])
                wd2 = f.getlength(texts[idx])
                bx = x - (wd2 - wd) / 2
                by = baseline + cap_h * (st["pop_scale"] - 1) / 2
            if is_active and is_pill:
                px, py = st["pad_x"], st["pad_y"]
                bottom = baseline + py + (0 if st["uppercase"] else size * 0.2)
                _pill(box_layer, (x - px, baseline - cap_h - py, x + wd + px, bottom), st,
                      ss=2 if scale < 1 else 4)
            swd = max(1, round(sw * (f.size / size)))
            td.text((bx, by), texts[idx], font=f, fill=fill, anchor="ls",
                    stroke_width=swd, stroke_fill=_rgb(st["stroke_color"]))
            sd.text((bx + st["shadow_dx"], by + st["shadow_dy"]), texts[idx], font=f, fill=255,
                    anchor="ls", stroke_width=swd)

    if st["shadow_blur"] > 0:
        shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(st["shadow_blur"]))
    shadow = Image.new("RGBA", (canvas_w, lh), (0, 0, 0, 0))
    shadow.putalpha(shadow_mask.point(lambda v: int(v * st["shadow_opacity"])))

    out = Image.new("RGBA", (canvas_w, lh), (0, 0, 0, 0))
    for layer in (shadow, box_layer, text_layer):
        out = Image.alpha_composite(out, layer)
    img.alpha_composite(out, (0, oy))
    return img


def _pill(layer: Image.Image, box, st, ss: int = 4):
    """Anti-aliased rounded rectangle via supersampling, composited onto `layer`."""
    x0, y0, x1, y1 = [int(round(v)) for v in box]
    pad = 2
    w, h = x1 - x0 + pad * 2, y1 - y0 + pad * 2
    big = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    rect = (pad * ss, pad * ss, (w - pad) * ss - 1, (h - pad) * ss - 1)
    r = int(st["border_radius"] * ss)
    if st["box_fill"]:
        d.rounded_rectangle(rect, radius=r, fill=_rgb(st["highlight_color"]))
    if st["box_stroke"]:
        d.rounded_rectangle(rect, radius=r, outline=_rgb(st["box_stroke_color"]),
                            width=int(st["box_stroke_width"] * ss))
    small = big.resize((w, h), Image.LANCZOS)
    dx, dy = x0 - pad, y0 - pad
    if dx < 0 or dy < 0:
        small = small.crop((max(0, -dx), max(0, -dy), w, h))
        dx, dy = max(0, dx), max(0, dy)
    layer.alpha_composite(small, (dx, dy))


def write_state_pngs(phrases, timeline, style, out_dir: Path):
    """Render each unique state once; return list of (png_path, duration)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    cache: dict = {}
    segs = []
    for key, t0, t1 in timeline:
        if key not in cache:
            p = out_dir / (f"s_{len(cache):05d}.png")
            if key is None:
                img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            else:
                pi, wi = key
                img = render_state(phrases[pi]["words"], wi, style)
            img.save(p, compress_level=1)
            cache[key] = p
        segs.append((cache[key], t1 - t0))
    return segs
