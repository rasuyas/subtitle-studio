"""FastAPI server: uploads, YouTube, transcription, preview frames, SSE progress, rendering."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import io
import json
import mimetypes
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import uuid
from pathlib import Path

from fastapi import Body, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import subtitle_engine as se
from . import video_renderer as vr
from .transcriber import MODELS_DIR, list_custom_models

_SUBPROC_KW = {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}

ROOT = Path(__file__).resolve().parent.parent
VERSION = (ROOT / "VERSION").read_text(encoding="utf-8").strip() if (ROOT / "VERSION").exists() else "0.0.0"
WORK, EXPORTS, STATIC = ROOT / "workspace", ROOT / "exports", Path(__file__).parent / "static"
for d in (WORK, EXPORTS, se.FONT_DIR, MODELS_DIR):
    d.mkdir(exist_ok=True)

AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".ogg"}
VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm"}

FONT_URLS = {
    "Montserrat-ExtraBold.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-ExtraBold.ttf",
    "Poppins-ExtraBold.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-ExtraBold.ttf",
    "Anton-Regular.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf",
}


def ensure_fonts():
    for name, url in FONT_URLS.items():
        dest = se.FONT_DIR / name
        if not dest.exists():
            try:
                print(f"[fonts] downloading {name}")
                urllib.request.urlretrieve(url, dest)
            except Exception as e:
                print(f"[fonts] could not download {name}: {e}")


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    threading.Thread(target=ensure_fonts, daemon=True).start()
    yield


app = FastAPI(title="Subtitle Studio", lifespan=_lifespan)


# --------------------------------------------------------------------------- jobs
class Job:
    def __init__(self, name: str = "untitled"):
        self.id = uuid.uuid4().hex[:10]
        self.dir = WORK / self.id
        self.dir.mkdir(parents=True, exist_ok=True)
        self.name = re.sub(r"[^\w\-]+", "_", Path(name).stem)[:60] or "video"
        self.src: Path | None = None
        self.meta: dict = {}
        self.words: list[dict] = []
        self.events: list[dict] = []
        self.busy = False

    def emit(self, stage: str, pct: float = 0.0, msg: str = "", state: str = "running", **extra):
        self.events.append({"stage": stage, "pct": round(pct, 4), "msg": msg, "state": state, **extra})

    def set_source(self, path: Path, audio_only: bool = False):
        self.src = path
        self.meta = vr.probe(path)
        if audio_only or path.suffix.lower() in AUDIO_EXT:
            self.meta["has_video"] = False
            self.meta["fps"], self.meta["fps_str"] = 30.0, "30"

    def public(self) -> dict:
        return {"job_id": self.id, "name": self.name, "meta": self.meta, "words": self.words,
                "kind": "video" if self.meta.get("has_video") else "audio"}


JOBS: dict[str, Job] = {}


def get_job(job_id: str) -> Job:
    if job_id not in JOBS:
        raise HTTPException(404, "Unknown job")
    return JOBS[job_id]


def run_task(job: Job, stage: str, fn):
    """Run a blocking task in a thread, converting exceptions into SSE error events."""
    if job.busy:
        raise HTTPException(409, "Job is already running a task")
    job.busy = True

    def target():
        try:
            fn()
        except Exception as e:  # noqa
            job.emit(stage, 0, str(e)[-900:], state="error")
        finally:
            job.busy = False

    threading.Thread(target=target, daemon=True).start()


# --------------------------------------------------------------------------- basic routes
@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/api/health")
def health():
    return {"ok": True, "version": VERSION}


@app.get("/api/fonts")
def fonts():
    return {"fonts": se.list_fonts(), "default_style": se.DEFAULT_STYLE}


@app.get("/api/models")
def models():
    return {"custom": list_custom_models(), "folder": str(MODELS_DIR)}


@app.get("/api/progress/{job_id}")
async def progress(job_id: str, request: Request):
    job = get_job(job_id)

    async def gen():
        i = 0
        last_ping = time.monotonic()
        while True:
            if await request.is_disconnected():
                return
            while i < len(job.events):
                yield f"data: {json.dumps(job.events[i])}\n\n"
                i += 1
                last_ping = time.monotonic()
            await asyncio.sleep(0.25)
            now = time.monotonic()
            if now - last_ping >= 15.0:
                last_ping = now
                yield ": keepalive\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


# --------------------------------------------------------------------------- inputs
@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in AUDIO_EXT | VIDEO_EXT:
        raise HTTPException(400, f"Unsupported file type {ext or '(none)'}")
    job = Job(file.filename or "upload")
    dest = job.dir / f"source{ext}"
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f, 1024 * 1024)
    try:
        job.set_source(dest)
    except Exception as e:
        raise HTTPException(400, f"Could not read media: {e}")
    JOBS[job.id] = job
    job.emit("upload", 1, "ready", state="done")
    return job.public()


@app.post("/api/open-local")
def open_local(body: dict = Body(...)):
    raw = (body.get("path") or "").strip()
    if not raw:
        raise HTTPException(400, "Missing file path")
    src = Path(raw).expanduser().resolve()
    if not src.is_file():
        raise HTTPException(404, f"File not found: {src}")
    ext = src.suffix.lower()
    if ext not in AUDIO_EXT | VIDEO_EXT:
        raise HTTPException(400, f"Unsupported file type {ext or '(none)'}")
    job = Job(src.name)
    try:
        job.set_source(src)
    except Exception as e:
        raise HTTPException(400, f"Could not read media: {e}")
    JOBS[job.id] = job
    job.emit("upload", 1, "ready", state="done")
    return job.public()


@app.post("/api/youtube/info")
def yt_info(body: dict = Body(...)):
    from .downloader import fetch_info
    try:
        return fetch_info(body["url"])
    except Exception as e:
        raise HTTPException(400, f"Could not read that URL: {str(e)[-300:]}")


@app.post("/api/youtube/download")
def yt_download(body: dict = Body(...)):
    from .downloader import download
    job = Job(body.get("title") or "youtube")
    JOBS[job.id] = job

    def task():
        path = download(body["url"], job.dir, bool(body.get("audio_only")),
                        lambda p, m: job.emit("download", p, m))
        job.set_source(path, audio_only=bool(body.get("audio_only")))
        job.emit("download", 1, "downloaded", state="done", result=job.public())

    run_task(job, "download", task)
    return {"job_id": job.id}


@app.post("/api/jobs/{job_id}/transcribe")
def transcribe(job_id: str, body: dict = Body(...)):
    job = get_job(job_id)

    def task():
        from .transcriber import transcribe as run
        words, info = run(job.src, body.get("model", "large-v3-turbo"), body.get("language", "auto"),
                          lambda p, m: job.emit("transcribe", p, m))
        job.words = words
        job.emit("transcribe", 1, f"{len(words)} words ({info['language']})", state="done",
                 result={"words": words, "language": info["language"]})

    run_task(job, "transcribe", task)
    return {"ok": True}


# --------------------------------------------------------------------------- previews
@app.get("/api/jobs/{job_id}/media")
def media(job_id: str):
    job = get_job(job_id)
    if not job.src or not job.src.is_file():
        raise HTTPException(404, "Source file not found")
    proxy = job.dir / "preview_proxy.mp4"
    target = proxy if proxy.is_file() else job.src
    mime, _ = mimetypes.guess_type(str(target))
    return FileResponse(target, media_type=mime or "application/octet-stream")


@app.post("/api/jobs/{job_id}/proxy")
def build_proxy(job_id: str):
    job = get_job(job_id)
    if not job.src or not job.src.is_file():
        raise HTTPException(404, "Source file not found")
    if not job.meta.get("has_video"):
        raise HTTPException(400, "Audio-only job")
    proxy = job.dir / "preview_proxy.mp4"
    if not proxy.is_file():
        tmp = job.dir / "preview_proxy.tmp.mp4"
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(job.src),
            "-vf", "scale='min(1280,iw)':-2",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "-g", "15", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(tmp),
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, **_SUBPROC_KW)
        if r.returncode != 0 or not tmp.is_file():
            raise HTTPException(500, f"Could not create playback proxy: {r.stderr[-300:]}")
        tmp.replace(proxy)
    return {"url": f"/api/jobs/{job_id}/media?v={int(proxy.stat().st_mtime)}"}


@app.get("/api/jobs/{job_id}/frame")
def frame(job_id: str, t: float = 0.0):
    job = get_job(job_id)
    if not job.meta.get("has_video"):
        raise HTTPException(400, "Audio-only job")
    r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{max(t, 0):.3f}", "-i", str(job.src), "-frames:v", "1",
                        "-vf", "scale=960:-2", "-q:v", "3", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"],
                       capture_output=True, **_SUBPROC_KW)
    if not r.stdout:
        raise HTTPException(500, "Could not extract frame")
    return Response(r.stdout, media_type="image/jpeg")


@app.post("/api/chunk")
def chunk(body: dict = Body(...)):
    c = body.get("chunk", {})
    return {"phrases": se.chunk_words(body["words"], c.get("max_words", 3), c.get("max_chars", 24), c.get("pause", 0.55))}


@app.post("/api/preview")
def preview(body: dict = Body(...)):
    words = se.clean_words(body.get("words") or [])
    anim_t = body.get("anim_t")
    img = se.render_state(words, body.get("active"), body.get("style"), scale=0.5,
                          anim_t=float(anim_t) if anim_t is not None else None)
    buf = io.BytesIO()
    img.save(buf, "PNG", compress_level=1)
    return Response(buf.getvalue(), media_type="image/png")


def _layout_args(req: dict) -> dict:
    full = {"x": 0, "y": 0, "w": 1, "h": 1}
    return {"layout": req.get("layout", "split50"), "main": req.get("main_crop") or full,
            "face": req.get("face_crop") or full, "pip_corner": req.get("pip_corner", "br"),
            "blur_bg": bool(req.get("blur_bg")), "reframe": bool(req.get("reframe", False))}


@app.post("/api/jobs/{job_id}/layout_preview")
def layout_preview(job_id: str, body: dict = Body(...)):
    job = get_job(job_id)
    if not job.meta.get("has_video"):
        raise HTTPException(400, "Audio-only job")
    out = job.dir / "layout_preview.png"
    try:
        vr.layout_still(job.src, float(body.get("t", 0)), job.meta, _layout_args(body), out)
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    return Response(out.read_bytes(), media_type="image/png")


# --------------------------------------------------------------------------- render
@app.post("/api/jobs/{job_id}/render")
def render(job_id: str, body: dict = Body(...)):
    job = get_job(job_id)
    mode = body.get("mode", "mp4")          # mp4 | mov | webm
    if not job.meta.get("has_video") and mode == "mp4":
        mode = "mov"

    def task():
        meta, dur = job.meta, job.meta["duration"]
        c = body.get("chunk", {})
        phrases = se.chunk_words(body["words"], c.get("max_words", 3), c.get("max_chars", 24), c.get("pause", 0.55))
        if not phrases:
            raise RuntimeError("No words to render. Run transcription first.")
        timeline = se.build_timeline(phrases, dur, meta["fps"], style=body.get("style"))
        frames = job.dir / "frames"
        shutil.rmtree(frames, ignore_errors=True)
        job.emit("render", 0.02, f"rendering {len(timeline)} subtitle states")
        segs = se.write_state_pngs(phrases, timeline, body.get("style"), frames)
        lst = job.dir / "subs.txt"
        vr.write_concat(segs, lst)

        def prog(p, m):
            job.emit("render", 0.1 + p * 0.9, m)

        stamp = time.strftime("%Y%m%d_%H%M%S")
        if mode == "mp4":
            out = EXPORTS / f"{job.name}_{stamp}.mp4"
            info = vr.export_mp4(job.src, lst, out, meta, _layout_args(body), prog)
        elif mode == "webm":
            out = EXPORTS / f"{job.name}_{stamp}_alpha.webm"
            info = vr.export_webm_alpha(lst, out, meta, prog)
        else:
            out = EXPORTS / f"{job.name}_{stamp}_alpha.mov"
            info = vr.export_mov_alpha(lst, out, meta, prog)
        job.emit("render", 1, "done", state="done",
                 result={"file": out.name, "url": f"/exports/{out.name}", "info": info})

    run_task(job, "render", task)
    return {"ok": True}


app.mount("/static", StaticFiles(directory=STATIC), name="static")
app.mount("/exports", StaticFiles(directory=EXPORTS), name="exports")
