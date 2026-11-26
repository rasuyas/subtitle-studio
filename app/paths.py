"""Bundled assets (read-only) versus user data (writable). Source runs use the same folder for both."""
from __future__ import annotations

import sys
from pathlib import Path

FROZEN = getattr(sys, "frozen", False)
SOURCE_ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
# A packaged .app lives in /Applications and is replaced on upgrade, so data goes elsewhere.
DATA_ROOT = Path.home() / "Library" / "Application Support" / "Subtitle Studio" if FROZEN else SOURCE_ROOT
