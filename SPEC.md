# Subtitle Studio

Local, GPU-accelerated word-highlight subtitle and 9:16 layout desktop app.

- **Desktop App (Windows):** Double-click `Subtitle Studio.bat`, `Subtitle Studio.vbs`, or `Subtitle Studio.pyw` (or run `launch.bat`).
- **Desktop / Start Menu Shortcut:** Double-click `Create Desktop Shortcut.bat` to create a shortcut with the Subtitle Studio icon.
- **Web Server Mode (optional):** Run `launch.bat --web` (or `./launch.sh --web`) to run on `http://127.0.0.1:8000` in a browser.
- **Requires:** Python 3.10+, `ffmpeg` + `ffprobe` on PATH, NVIDIA GPU with CUDA 12.x (falls back to CPU transcription / `libx264` if CUDA or NVENC is unavailable).

## Desktop updates

The desktop app checks for updates in a background thread at startup. Use **Check for Updates** in the header to check manually; available updates can be downloaded and installed from the GitHub release ZIP, with the `main` branch `VERSION` as a fallback when the Releases API is unavailable. The updater uses only Python's standard library and targets the repository configured by `OWNER` and `REPO` in `app/updater.py` (`rasuyas/subtitle-studio`).

The updater preserves local fonts, settings, models, virtual environments, exports, and workspace data. It installs changed Python requirements before asking to restart the app.
