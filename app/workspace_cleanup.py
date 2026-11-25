"""Safe cleanup for abandoned per-job workspace directories."""
from __future__ import annotations

import os
from pathlib import Path
import re
import shutil
import time
from collections.abc import Iterable


_JOB_DIR = re.compile(r"[0-9a-f]{10}\Z")
DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60


def _last_modified(path: Path) -> float:
    latest = path.stat().st_mtime

    def raise_walk_error(error: OSError) -> None:
        raise error

    for root, dirs, files in os.walk(path, followlinks=False, onerror=raise_walk_error):
        for name in dirs + files:
            child = Path(root) / name
            if not child.is_symlink():
                latest = max(latest, child.stat().st_mtime)
    return latest


def cleanup_workspace(
    workspace: Path,
    active_job_ids: Iterable[str] = (),
    max_age_seconds: float = DEFAULT_MAX_AGE_SECONDS,
    now: float | None = None,
) -> list[Path]:
    """Remove only stale, inactive per-job directories; preserve workspace user data."""
    if max_age_seconds < 0:
        raise ValueError("Workspace cleanup age must not be negative.")
    if not workspace.is_dir():
        return []

    active = {job_id.casefold() for job_id in active_job_ids}
    cutoff = (time.time() if now is None else now) - max_age_seconds
    removed = []
    for path in workspace.iterdir():
        if not _JOB_DIR.fullmatch(path.name) or path.is_symlink() or not path.is_dir():
            continue
        if path.name.casefold() in active or _last_modified(path) >= cutoff:
            continue
        shutil.rmtree(path)
        removed.append(path)
    return removed
