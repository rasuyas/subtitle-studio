#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

MODE="desktop"
FORCE_SETUP=0
for arg in "$@"; do
  case "$arg" in
    --web) MODE="web" ;;
    --setup) FORCE_SETUP=1 ;;
  esac
done

if [ ! -d venv ]; then
  python3 -m venv venv
  FORCE_SETUP=1
fi
. venv/bin/activate

if [ "$FORCE_SETUP" = "0" ]; then
  python -c "import fastapi, uvicorn, webview, faster_whisper, PIL, yt_dlp" >/dev/null 2>&1 || FORCE_SETUP=1
fi

if [ "$FORCE_SETUP" = "1" ]; then
  pip install -q -r requirements.txt
fi

command -v ffmpeg >/dev/null || { echo "ffmpeg not found on PATH"; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe not found on PATH"; exit 1; }

if [ "$MODE" = "web" ]; then
  (sleep 3; xdg-open http://127.0.0.1:8000 >/dev/null 2>&1 || true) &
  exec python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
fi

exec python -m app.desktop
