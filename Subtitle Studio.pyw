"""Desktop entry point for double-clicking Subtitle Studio without a console window."""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

from app.desktop import main  # noqa: E402

if __name__ == "__main__":
    main()
