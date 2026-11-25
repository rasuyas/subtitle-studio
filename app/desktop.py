"""Native desktop window launcher (pywebview + local FastAPI server)."""
from __future__ import annotations

import ctypes
import logging
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "workspace"
EXPORTS = ROOT / "exports"
STATIC = Path(__file__).resolve().parent / "static"
ICON_ICO = STATIC / "icon.ico"
ICON_PNG = STATIC / "icon.png"


def _setup_logging():
    """Ensure stdout/stderr and logging work cleanly under pythonw.exe (no console)."""
    WORK.mkdir(parents=True, exist_ok=True)
    log_path = WORK / "desktop.log"
    if log_path.exists() and log_path.stat().st_size > 1_000_000:
        log_path.write_text("", encoding="utf-8")
    if sys.stdout is None or sys.stderr is None:
        stream = open(log_path, "a", encoding="utf-8", buffering=1)
        if sys.stdout is None:
            sys.stdout = stream
        if sys.stderr is None:
            sys.stderr = stream
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[logging.FileHandler(log_path, encoding="utf-8")],
    )


def _show_error(title: str, message: str):
    """Display a native error popup even when launched without a console."""
    if sys.platform == "win32":
        try:
            ctypes.windll.user32.MessageBoxW(None, message, title, 0x10)
            return
        except Exception:
            pass
    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(title, message)
        root.destroy()
    except Exception:
        print(f"{title}: {message}", file=sys.stderr)


def _open_path(path: Path):
    if sys.platform == "win32":
        os.startfile(str(path))
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path)])


def _reveal_path(path: Path):
    if sys.platform == "win32":
        subprocess.Popen(["explorer", "/select,", str(path)])
    elif sys.platform == "darwin":
        subprocess.Popen(["open", "-R", str(path)])
    else:
        subprocess.Popen(["xdg-open", str(path.parent)])


def _safe_export(filename: str) -> Path | None:
    if not filename:
        return None
    exports_root = EXPORTS.resolve()
    target = (exports_root / Path(filename).name).resolve()
    if not target.is_relative_to(exports_root) or not target.is_file():
        return None
    return target


class DesktopApi:
    """Native desktop actions exposed to the UI via window.pywebview.api."""

    def __init__(self):
        self._window = None

    def attach(self, window):
        self._window = window

    def pick_media_file(self) -> str | None:
        import webview

        if not self._window:
            return None
        file_types = (
            "Media files (*.mp4;*.mov;*.mkv;*.webm;*.mp3;*.wav;*.m4a;*.aac;*.ogg)",
            "Video files (*.mp4;*.mov;*.mkv;*.webm)",
            "Audio files (*.mp3;*.wav;*.m4a;*.aac;*.ogg)",
            "All files (*.*)",
        )
        res = self._window.create_file_dialog(webview.FileDialog.OPEN, allow_multiple=False, file_types=file_types)
        return res[0] if res else None

    def pick_model_folder(self) -> str | None:
        import webview

        if not self._window:
            return None
        res = self._window.create_file_dialog(webview.FileDialog.FOLDER)
        return res[0] if res else None

    def open_exports_folder(self) -> bool:
        EXPORTS.mkdir(parents=True, exist_ok=True)
        _open_path(EXPORTS)
        return True

    def show_in_explorer(self, filename: str) -> bool:
        target = _safe_export(filename)
        if not target:
            return self.open_exports_folder()
        _reveal_path(target)
        return True

    def open_export_file(self, filename: str) -> bool:
        target = _safe_export(filename)
        if not target:
            return False
        _open_path(target)
        return True

    def save_export_as(self, filename: str) -> str | None:
        import webview

        target = _safe_export(filename)
        if not target or not self._window:
            return None
        ext = target.suffix.lower().lstrip(".")
        file_types = (f"{ext.upper()} file (*.{ext})", "All files (*.*)") if ext else ("All files (*.*)",)
        res = self._window.create_file_dialog(
            webview.FileDialog.SAVE,
            directory=str(Path.home() / "Videos"),
            save_filename=target.name,
            file_types=file_types,
        )
        dest = res[0] if isinstance(res, (list, tuple)) and res else (res if isinstance(res, str) else None)
        if not dest:
            return None
        shutil.copy2(target, dest)
        return dest


def _bind_local_socket() -> tuple[socket.socket, int]:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", 0))
    sock.listen(128)
    return sock, sock.getsockname()[1]


def _wait_for_server(port: int, server_err: list[Exception], timeout: float = 15.0):
    deadline = time.monotonic() + timeout
    url = f"http://127.0.0.1:{port}/api/health"
    while time.monotonic() < deadline:
        if server_err:
            raise server_err[0]
        try:
            with urllib.request.urlopen(url, timeout=0.5) as resp:
                if resp.status == 200:
                    return
        except Exception:
            time.sleep(0.08)
    raise RuntimeError("Local backend server did not become ready in time.")


def main():
    _setup_logging()
    if sys.platform == "win32":
        try:
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("SubtitleStudio.Desktop")
        except Exception:
            pass

    missing = [tool for tool in ("ffmpeg", "ffprobe") if not shutil.which(tool)]
    if missing:
        _show_error(
            "Subtitle Studio — Missing Dependency",
            f"Could not find {', '.join(missing)} on your system PATH.\n\n"
            "Please install FFmpeg (with ffprobe) and restart Subtitle Studio.",
        )
        sys.exit(1)

    try:
        import uvicorn
        import webview
        from app.main import app
    except Exception as exc:
        logging.exception("Failed to import desktop dependencies")
        setup_command = "launch.bat --setup" if sys.platform == "win32" else "bash ./launch.sh --setup"
        _show_error(
            "Subtitle Studio — Startup Error",
            f"Could not start Subtitle Studio:\n{exc}\n\n"
            f"Try running {setup_command} to reinstall dependencies.",
        )
        sys.exit(1)

    sock, port = _bind_local_socket()
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_config=None, access_log=False)
    server = uvicorn.Server(config)
    server_err: list[Exception] = []

    def serve():
        try:
            server.run(sockets=[sock])
        except Exception as exc:
            server_err.append(exc)
            logging.exception("Backend server exited with error")

    server_thread = threading.Thread(target=serve, name="uvicorn-server", daemon=True)
    server_thread.start()

    try:
        _wait_for_server(port, server_err)
    except Exception as exc:
        server.should_exit = True
        sock.close()
        _show_error("Subtitle Studio — Server Error", f"Failed to start local engine:\n{exc}")
        sys.exit(1)

    api = DesktopApi()
    window = webview.create_window(
        "Subtitle Studio",
        url=f"http://127.0.0.1:{port}/",
        js_api=api,
        width=1440,
        height=920,
        min_size=(1024, 680),
        background_color="#0f1114",
        text_select=True,
    )
    api.attach(window)

    storage_dir = WORK / ".webview"
    storage_dir.mkdir(parents=True, exist_ok=True)
    icon_path = ICON_ICO if ICON_ICO.exists() else (ICON_PNG if ICON_PNG.exists() else None)
    try:
        webview.start(
            gui="edgechromium" if sys.platform == "win32" else None,
            debug=bool(os.environ.get("SUBGEN_DEBUG")),
            private_mode=False,
            storage_path=str(storage_dir),
            icon=str(icon_path) if icon_path else None,
        )
    finally:
        server.should_exit = True
        server_thread.join(timeout=3.0)
        try:
            sock.close()
        except OSError:
            pass


if __name__ == "__main__":
    main()
