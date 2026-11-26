# Packaging

## macOS `.app`

Build on macOS (PyInstaller cannot cross-compile):

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt pyinstaller
pyinstaller "Subtitle Studio.spec"
# -> dist/Subtitle Studio.app
```

- Data (`workspace/`, `exports/`, `models/`, `fonts/`, `user_settings/`) is written to
  `~/Library/Application Support/Subtitle Studio/`, not inside the app bundle.
- Whisper models download on first use, as in source mode.
- Bundle `ffmpeg`/`ffprobe` by putting them in `ffmpeg/` before building; otherwise the
  app uses Homebrew's (`/opt/homebrew/bin`, `/usr/local/bin`) or `PATH`.
- The in-app updater is disabled in the packaged app; updates are a new download.
- Unsigned builds are blocked by Gatekeeper: users right-click → Open, or you sign and
  notarize with an Apple Developer ID before publishing.

## Windows `.exe`

See `HANDOVER-BUILD-EXE.md`.
