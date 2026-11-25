# Subtitle Studio

Local, GPU-accelerated word-highlight subtitle and 9:16 layout desktop app.

- **Desktop App (Windows):** Double-click `Subtitle Studio.bat`, `Subtitle Studio.vbs`, or `Subtitle Studio.pyw` (or run `launch.bat`).
- **Desktop / Start Menu Shortcut:** Double-click `Create Desktop Shortcut.bat` to create a shortcut with the Subtitle Studio icon.
- **Web Server Mode (optional):** Run `launch.bat --web` (or `./launch.sh --web`) to run on `http://127.0.0.1:8000` in a browser.
- **Requires:** Python 3.10+, `ffmpeg` + `ffprobe` on PATH, NVIDIA GPU with CUDA 12.x (falls back to CPU transcription / `libx264` if CUDA or NVENC is unavailable).

## Default workflow and optional reframing

The default workflow is Subtitle-Only: load video or audio, transcribe and style the
subtitles, then render without changing the source video's framing. Crop Box / Reframe
is an optional mode for video sources; enable it to adjust the main and facecam crop
areas and choose an output layout. It is off by default, and audio-only sources do not
offer crop controls. The export format remains selectable.

## Responsive desktop preview

The desktop UI adapts to the available screen and preview-pane dimensions. When the
window or pane is resized, the source video, output/subtitle preview, and enabled crop
boxes scale proportionally and remain centered. The preview panes reflow with the
available layout when optional crop controls are enabled or hidden, without reserving
space for hidden controls.

## Subtitle typography

The Text controls include **Line spacing**, a multiplier from 0.8x to 2.0x (default
1.0x) for the vertical distance between wrapped subtitle rows. The setting is saved
with the local style settings and is applied consistently to the live output preview
and exported subtitle frames, including their vertical text-block and background-box
layout.

## Desktop updates

The desktop app checks for updates in a background thread at startup. Use **Check for Updates** in the header to check manually; available updates can be downloaded and installed from the GitHub release ZIP, with the `main` branch `VERSION` as a fallback when the Releases API is unavailable. The updater uses only Python's standard library and targets the repository configured by `OWNER` and `REPO` in `app/updater.py` (`rasuyas/subtitle-studio`).

The updater preserves local fonts, settings, models, virtual environments, exports, and workspace data. It installs changed Python requirements before asking to restart the app.

## Known issues

- The app is still being optimized; short videos are best tested.
- Jobs are kept in memory and are lost when the server restarts. Stale per-job folders in `workspace/` are cleaned at startup and shutdown after 24 hours; active jobs and exports are preserved.
- The word-by-word pop-in style has no scale-in animation.
- Live subtitle preview rendering is debounced and cached, but layout previews can still be slow on CPU or with large source files. A downscaled proxy is generated on demand for playback when the source codec is unsupported; downscaling layout-preview sources remains pending.
- Audio/video playback with synchronized word highlighting is available in the transcript editor.
- Automated tests cover updater/version checks, transcript editing and script alignment, subtitle rendering, and desktop geometry; broader integration coverage remains limited.
