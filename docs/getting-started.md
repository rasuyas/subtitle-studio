# Installation and first run

## Requirements

- Windows, macOS, or Linux
- Python 3.10 or newer
- FFmpeg and FFprobe installed and available on your PATH
- Internet access on first run to download the Whisper model and fonts
- An NVIDIA GPU with CUDA 12.x is recommended for faster transcription on Windows
  and Linux. macOS uses CPU int8; other systems can also fall back to CPU, which is
  much slower.

## Download

With Git:

```bash
git clone https://github.com/rasuyas/subtitle-studio.git
cd subtitle-studio
```

Without Git, download the [latest release](https://github.com/rasuyas/subtitle-studio/releases/latest)
and choose **Source code (zip)** under Assets. Extract the ZIP and open the
extracted folder.

## Launch the desktop app

- **Windows:** double-click `Subtitle Studio.bat`. You can also use
  `Subtitle Studio.pyw` or `Subtitle Studio.vbs` to launch without a console window.
- **macOS:** install FFmpeg and FFprobe, then double-click
  `Subtitle Studio.command`. If macOS blocks it, allow it in Privacy & Security or
  run `./Subtitle Studio.command` from Terminal.
- **Linux:** run `bash ./launch.sh`.

On Windows, double-click `Create Desktop Shortcut.bat` to create Desktop and Start
Menu shortcuts.

## Launch in a browser

- **Windows:** run `launch.bat --web`.
- **macOS or Linux:** run `bash ./launch.sh --web`.

The local server opens at <http://127.0.0.1:8000>. It is intended for use on your
own computer; do not expose it to a network or the internet.

## Manual setup

If you prefer to install and launch the app yourself:

```bash
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
```

Start the desktop app with `python -m app.desktop`, or start the browser version
with:

```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Manual setup has not been tested as extensively as the launchers.
