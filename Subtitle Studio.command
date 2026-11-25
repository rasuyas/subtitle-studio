#!/bin/bash
set -e
cd "$(dirname "$0")"

if [ ! -x venv/bin/python ]; then
  echo "Creating virtual environment..."
  python3 -m venv venv
fi

source venv/bin/activate

if ! python -c "import fastapi, uvicorn, webview, faster_whisper, PIL, yt_dlp" >/dev/null 2>&1; then
  echo "Installing dependencies..."
  python3 -m pip install --upgrade pip
  python3 -m pip install -r requirements.txt
fi

command -v ffmpeg >/dev/null || { echo "ffmpeg not found on PATH"; read -r -p "Press Return to close..."; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe not found on PATH"; read -r -p "Press Return to close..."; exit 1; }

exec python3 "Subtitle Studio.pyw"
