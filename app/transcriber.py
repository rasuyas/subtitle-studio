"""faster-whisper CUDA loader + word-timestamp extractor."""
from __future__ import annotations

import ctypes
import glob
import os
import subprocess
import sys
from pathlib import Path
from typing import Callable

import numpy as np

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
_models: dict = {}


def list_custom_models() -> list[str]:
    """Folders inside models/ that look like CTranslate2 (faster-whisper) models."""
    if not MODELS_DIR.exists():
        return []
    return sorted(d.name for d in MODELS_DIR.iterdir() if (d / "model.bin").exists())


def resolve_model(name: str) -> str:
    """Built-in size name | folder in models/ | any local folder path | Hugging Face repo id."""
    name = (name or "").strip().strip('"')
    local = MODELS_DIR / name
    if local.is_dir() and (local / "model.bin").exists():
        return str(local)
    p = Path(name).expanduser()
    if p.is_dir():
        if not (p / "model.bin").exists():
            raise RuntimeError(f"{p} has no model.bin. It must be a CTranslate2 (faster-whisper) model folder.")
        return str(p)
    return name


_SUBPROC_KW = {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}


def decode_audio(path: Path) -> np.ndarray:
    """16 kHz mono float32 via ffmpeg, so we never depend on PyAV's decoder."""
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", "16000",
                        "-f", "f32le", "pipe:1"], capture_output=True, **_SUBPROC_KW)
    if r.returncode != 0 or not r.stdout:
        raise RuntimeError("Could not read audio from this file: " + r.stderr.decode(errors="ignore")[-300:])
    return np.frombuffer(r.stdout, dtype=np.float32)


def _setup_cuda_paths():
    """Make pip-installed cuBLAS/cuDNN (nvidia-*-cu12 wheels) discoverable."""
    try:
        import nvidia  # noqa
    except ImportError:
        return
    for base in list(getattr(nvidia, "__path__", [])):
        for sub in Path(base).glob("*"):
            if sys.platform == "win32":
                b = sub / "bin"
                if b.exists():
                    os.add_dll_directory(str(b))
                    os.environ["PATH"] = f"{b}{os.pathsep}{os.environ.get('PATH', '')}"
            else:
                for lib in sorted(glob.glob(str(sub / "lib" / "lib*.so*"))):
                    try:
                        ctypes.CDLL(lib, mode=ctypes.RTLD_GLOBAL)
                    except OSError:
                        pass


def get_model(name: str):
    name = resolve_model(name)
    if name in _models:
        return _models[name]
    _setup_cuda_paths()
    from faster_whisper import WhisperModel
    if sys.platform == "darwin":
        m = WhisperModel(name, device="cpu", compute_type="int8")
    else:
        try:
            m = WhisperModel(name, device="cuda", compute_type="float16")
        except Exception as e:  # CUDA missing -> CPU fallback so the app still works
            print(f"[whisper] CUDA init failed ({e}); falling back to CPU int8")
            m = WhisperModel(name, device="cpu", compute_type="int8")
    _models[name] = m
    return m


def transcribe(path: Path, model_name: str, language: str, on_progress: Callable[[float, str], None]):
    on_progress(0.0, f"loading {model_name} (first run downloads the model)")
    model = get_model(model_name)
    on_progress(0.0, "decoding audio")
    audio = decode_audio(path)
    lang = None if language in ("auto", "", None) else language
    segments, info = model.transcribe(
        audio, language=lang, word_timestamps=True, vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 400}, beam_size=5)
    total = max(info.duration, 0.1)
    words = []
    for seg in segments:
        for w in (seg.words or []):
            t = w.word.strip()
            if t:
                words.append({"w": t, "start": round(w.start, 3), "end": round(w.end, 3)})
        on_progress(min(0.99, seg.end / total), f"transcribing {seg.end:.0f}s / {total:.0f}s")
    return words, {"language": info.language, "duration": info.duration}
