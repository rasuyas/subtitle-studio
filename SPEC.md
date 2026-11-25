# Subtitle Studio

Local, GPU-accelerated word-highlight subtitle and 9:16 layout desktop app.

- **Desktop App (Windows):** Double-click `Subtitle Studio.bat`, `Subtitle Studio.vbs`, or `Subtitle Studio.pyw` (or run `launch.bat`).
- **Desktop / Start Menu Shortcut:** Double-click `Create Desktop Shortcut.bat` to create a shortcut with the Subtitle Studio icon.
- **Web Server Mode (optional):** Run `launch.bat --web` (or `./launch.sh --web`) to run on `http://127.0.0.1:8000` in a browser.
- **Requires:** Python 3.10+, `ffmpeg` + `ffprobe` on PATH, NVIDIA GPU with CUDA 12.x (falls back to CPU transcription / `libx264` if CUDA or NVENC is unavailable).
