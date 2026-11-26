# PyInstaller spec for the macOS .app (must be built on macOS).
# Build: pyinstaller "Subtitle Studio.spec"  ->  dist/Subtitle Studio.app
import PyInstaller.utils.hooks as hooks
from pathlib import Path

ROOT = Path(SPECPATH)
VERSION = (ROOT / "VERSION").read_text(encoding="utf-8").strip()

datas = [
    (str(ROOT / "VERSION"), "."),
    (str(ROOT / "app" / "static"), "app/static"),  # frozen __file__ lives in _MEIPASS/app
    *hooks.collect_data_files("faster_whisper"),
]
# ffmpeg/ffprobe are optional here; desktop.py also searches Homebrew when they are absent.
datas += [(str(ROOT / "ffmpeg" / name), "ffmpeg") for name in ("ffmpeg", "ffprobe") if (ROOT / "ffmpeg" / name).is_file()]

hiddenimports = hooks.collect_submodules("uvicorn") + hooks.collect_submodules("yt_dlp")

a = Analysis(
    [str(ROOT / "Subtitle Studio.pyw")],
    pathex=[str(ROOT)],
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["tkinter.test", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="Subtitle Studio", console=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="Subtitle Studio")
app = BUNDLE(
    coll,
    name="Subtitle Studio.app",
    bundle_identifier="com.rasuyas.subtitlestudio",
    version=VERSION,
    info_plist={"NSHighResolutionCapable": True, "LSMinimumSystemVersion": "11.0"},
)
