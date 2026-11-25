@echo off
setlocal
cd /d "%~dp0"

set "MODE=desktop"
set "FORCE_SETUP=0"
for %%A in (%*) do (
  if /i "%%~A"=="--web" set "MODE=web"
  if /i "%%~A"=="--setup" set "FORCE_SETUP=1"
)

if not exist "venv\Scripts\python.exe" (
  echo Creating virtual environment...
  python -m venv venv || (echo Python 3.10+ is required. & pause & exit /b 1)
  set "FORCE_SETUP=1"
)

if "%FORCE_SETUP%"=="0" (
  "venv\Scripts\python.exe" -c "import fastapi, uvicorn, webview, faster_whisper, PIL, yt_dlp" >nul 2>nul || set "FORCE_SETUP=1"
)

if "%FORCE_SETUP%"=="1" (
  echo Installing dependencies...
  "venv\Scripts\python.exe" -m pip install -q --upgrade pip
  "venv\Scripts\python.exe" -m pip install -q -r requirements.txt || (echo Install failed. & pause & exit /b 1)
)

where ffmpeg >nul 2>nul || (echo ffmpeg was not found on PATH. Install it and run again. & pause & exit /b 1)
where ffprobe >nul 2>nul || (echo ffprobe was not found on PATH. Install it and run again. & pause & exit /b 1)

if "%MODE%"=="web" (
  start "" /b cmd /c "timeout /t 3 >nul & start http://127.0.0.1:8000"
  "venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
  pause
  exit /b 0
)

start "" "venv\Scripts\pythonw.exe" -m app.desktop
exit /b 0
