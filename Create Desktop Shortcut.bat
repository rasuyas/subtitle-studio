@echo off
setlocal
cd /d "%~dp0"

if not exist "venv\Scripts\pythonw.exe" (
  echo Virtual environment not found. Running initial setup first...
  call launch.bat --setup
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = (Get-Location).Path; " ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$targets = @(" ^
  "  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Subtitle Studio.lnk'), " ^
  "  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Subtitle Studio.lnk')" ^
  "); " ^
  "foreach ($lnk in $targets) { " ^
  "  $s = $ws.CreateShortcut($lnk); " ^
  "  $s.TargetPath = Join-Path $root 'venv\Scripts\pythonw.exe'; " ^
  "  $s.Arguments = '-m app.desktop'; " ^
  "  $s.WorkingDirectory = $root; " ^
  "  $s.IconLocation = Join-Path $root 'app\static\icon.ico'; " ^
  "  $s.Description = 'Subtitle Studio - GPU-accelerated subtitle and 9:16 layout studio'; " ^
  "  $s.Save(); " ^
  "  Write-Host ('Created shortcut: ' + $lnk) " ^
  "}"

echo.
echo Done! You can now launch Subtitle Studio from your Desktop or Start Menu.
pause
