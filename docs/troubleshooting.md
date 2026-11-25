# Troubleshooting

| Problem | What to try |
|---|---|
| Windows Defender or antivirus warns about downloaded `.bat` or `.vbs` files | This may be a false positive. The launcher scripts use PowerShell and `WScript.Shell` to create shortcuts or start the app without a console window. Inspect the scripts before running them, or use the manual setup in [Installation and first run](getting-started.md#manual-setup). |
| `open() got an unexpected keyword argument 'metadata_errors'` | PyAV 19 is too new for faster-whisper. The requirements already pin a compatible version; if needed, run `pip install "av<19"` inside the virtual environment. |
| `ffmpeg` or `ffprobe` not found | Install FFmpeg, add it to your PATH, then restart the launcher. |
| CUDA or cuDNN errors during transcription | Check that your NVIDIA driver supports CUDA 12. The app can fall back to CPU if CUDA cannot load, but transcription will be slower. |
| NVENC not available | MP4 export automatically retries with the slower CPU encoder (`libx264`). |
| FFmpeg reports memory allocation errors during export | Close memory-intensive apps and try a smaller source video. |
| Fonts are missing | Check your internet connection and restart the app, or place `.ttf` files in `fonts/`. |

When reporting a bug, include the full terminal error text and the steps that
caused it.
