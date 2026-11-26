"""Standard-library GitHub updater for desktop installations."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile
import time
import urllib.error
import urllib.request
import zipfile

OWNER = "rasuyas"
REPO = "subtitle-studio"
API_URL = f"https://api.github.com/repos/{OWNER}/{REPO}/releases/latest"
NIGHTLY_API_URL = f"https://api.github.com/repos/{OWNER}/{REPO}/releases/tags/nightly"
RAW_VERSION_URL = f"https://raw.githubusercontent.com/{OWNER}/{REPO}/main/VERSION"
MAIN_ZIP_URL = f"https://github.com/{OWNER}/{REPO}/archive/refs/heads/main.zip"
PRESERVED_PATHS = {
    ".config", ".git", ".nightly_sha", ".venv", ".webview", "config", "env", "exports",
    "fonts", "models", "presets", "settings", "user_presets", "user_settings",
    "venv", "workspace",
}


def _strip_version_prefix(value: str) -> str:
    value = value.strip()
    return value[1:] if value.startswith(("v", "V")) else value


def parse_version(value: str) -> tuple[int, int, int]:
    """Parse a semantic version, accepting an optional leading v and suffix."""
    version = _strip_version_prefix(value).split("+", 1)[0].split("-", 1)[0]
    parts = version.split(".")
    if len(parts) != 3 or any(not part.isdigit() for part in parts):
        raise ValueError(f"Invalid semantic version: {value!r}")
    return tuple(int(part) for part in parts)


def _read_url(url: str, timeout: float, accept: str = "text/plain") -> bytes:
    request = urllib.request.Request(
        url,
        headers={"Accept": accept, "User-Agent": "Subtitle-Studio-Updater"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def _nightly_release_sha(release: dict) -> str:
    target = release.get("target_commitish")
    if isinstance(target, str):
        target = target.strip()
        if re.fullmatch(r"[0-9a-fA-F]{7,40}", target):
            return target.lower()

    title = release.get("name")
    if isinstance(title, str):
        match = re.search(r"@\s*([0-9a-fA-F]{7,40})\s*\)?\s*$", title)
        if match:
            return match.group(1).lower()
    raise ValueError("Nightly release does not contain a commit SHA.")


def _same_commit(left: str, right: str) -> bool:
    left = left.lower()
    right = right.lower()
    return len(left) >= 7 and len(right) >= 7 and (left.startswith(right) or right.startswith(left))


def _check_nightly_for_updates(root: Path, local_version: str, timeout: float) -> dict:
    try:
        payload = _read_url(
            NIGHTLY_API_URL,
            timeout,
            "application/vnd.github+json",
        )
        release = json.loads(payload.decode("utf-8"))
        if not isinstance(release, dict):
            raise ValueError("Invalid GitHub Nightly release response.")
        if release.get("draft") or not release.get("prerelease"):
            raise ValueError("The Nightly release is not an available pre-release.")
        nightly_sha = _nightly_release_sha(release)
        archive_url = release.get("zipball_url")
        if not isinstance(archive_url, str) or not archive_url.startswith("https://"):
            raise ValueError("The Nightly release does not have a valid ZIP URL.")
        marker = root / ".nightly_sha"
        local_sha = marker.read_text(encoding="utf-8").strip() if marker.is_file() else ""
        if local_sha and not re.fullmatch(r"[0-9a-fA-F]{7,40}", local_sha):
            raise ValueError("The saved Nightly commit SHA is invalid.")
        title = release.get("name", "")
        version_match = re.search(r"\bv?(\d+\.\d+\.\d+)\b", title) if isinstance(title, str) else None
        latest_version = version_match.group(1) if version_match else "Nightly"
    except (OSError, UnicodeDecodeError, ValueError, json.JSONDecodeError, urllib.error.URLError) as exc:
        raise RuntimeError(f"Could not check GitHub for Nightly updates: {exc}") from exc

    return {
        "channel": "Nightly",
        "current_version": local_version,
        "latest_version": latest_version,
        "nightly_sha": nightly_sha,
        "update_available": not _same_commit(local_sha, nightly_sha),
        "archive_url": archive_url,
        "source": "nightly",
    }


def check_for_updates(root: Path, timeout: float = 4.0, channel: str = "Stable") -> dict:
    local_version = _strip_version_prefix((root / "VERSION").read_text(encoding="utf-8").strip())
    local_version_tuple = parse_version(local_version)
    if channel == "Nightly":
        return _check_nightly_for_updates(root, local_version, timeout)
    if channel != "Stable":
        raise ValueError(f"Invalid update channel: {channel!r}")

    deadline = time.monotonic() + timeout
    api_error = None
    release = None
    latest = None
    try:
        payload = _read_url(API_URL, max(0.1, deadline - time.monotonic()), "application/vnd.github+json")
        release = json.loads(payload.decode("utf-8"))
        if not isinstance(release, dict):
            raise ValueError("Invalid GitHub release response.")
        if release.get("draft") or release.get("prerelease"):
            release = None
        else:
            tag_name = release.get("tag_name")
            latest = tag_name.strip() if isinstance(tag_name, str) else ""
            parse_version(latest)
    except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as exc:
        api_error = exc

    source = "release"
    if latest is None:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            if isinstance(api_error, urllib.error.HTTPError) and api_error.code == 403:
                raise RuntimeError("GitHub rate limit reached; could not check for updates.")
            raise RuntimeError(f"Could not check GitHub for updates: {api_error}")
        try:
            latest = _read_url(RAW_VERSION_URL, remaining).decode("utf-8").strip()
            parse_version(latest)
            source = "main"
        except (OSError, UnicodeDecodeError, ValueError, urllib.error.URLError) as exc:
            if isinstance(api_error, urllib.error.HTTPError) and api_error.code == 403:
                raise RuntimeError("GitHub rate limit reached; raw version fallback also failed.") from exc
            raise RuntimeError(f"Could not check GitHub for updates: {exc}") from exc

    archive_url = MAIN_ZIP_URL
    if source == "release":
        archive_url = (release or {}).get("zipball_url")
        if not archive_url:
            archive_url = next(
                (
                    asset["browser_download_url"]
                    for asset in (release or {}).get("assets", [])
                    if isinstance(asset.get("browser_download_url"), str)
                    and asset["browser_download_url"].lower().endswith(".zip")
                ),
                MAIN_ZIP_URL,
            )

    return {
        "channel": "Stable",
        "current_version": local_version,
        "latest_version": _strip_version_prefix(latest),
        "update_available": parse_version(latest) > local_version_tuple,
        "archive_url": archive_url,
        "source": source,
    }


def _is_preserved(relative: PurePosixPath) -> bool:
    parts = [part.casefold() for part in relative.parts]
    if any(part in PRESERVED_PATHS for part in parts):
        return True
    filename = parts[-1] if parts else ""
    return filename.startswith(("settings.", "presets.", "user-settings.", "user-presets."))


def _archive_root(file_names: list[str]) -> str | None:
    paths = [PurePosixPath(name.rstrip("/")) for name in file_names]
    if not paths or not paths[0].parts:
        return None
    candidate = paths[0].parts[0]
    if all(len(path.parts) > 1 and path.parts[0] == candidate for path in paths):
        return candidate
    return None


def _safe_archive_path(name: str, archive_root: str | None) -> PurePosixPath | None:
    if "\\" in name or name.startswith("/"):
        raise ValueError("Update archive contains an unsafe path.")
    path = PurePosixPath(name.rstrip("/"))
    if not path.parts or any(part in ("", ".", "..") or ":" in part for part in path.parts):
        raise ValueError("Update archive contains an unsafe path.")
    if archive_root is None:
        return path
    if path.parts[0] != archive_root or len(path.parts) == 1:
        return None
    return PurePosixPath(*path.parts[1:])


def _inside(path: Path, root: Path) -> bool:
    return path == root or root in path.parents


def apply_archive(archive_path: Path, root: Path) -> bool:
    """Safely apply a GitHub source ZIP, preserving local data and virtualenvs."""
    root = root.resolve()
    requirements = root / "requirements.txt"
    before_hash = _sha256(requirements) if requirements.is_file() else None
    copied = 0

    with tempfile.TemporaryDirectory(prefix="subtitle-studio-update-") as temp_dir:
        extracted = Path(temp_dir) / "files"
        extracted.mkdir()
        with zipfile.ZipFile(archive_path) as archive:
            file_names = [info.filename for info in archive.infolist() if not info.is_dir()]
            if not file_names:
                raise ValueError("Update archive contains no files.")
            archive_root = _archive_root(file_names)
            for info in archive.infolist():
                if info.is_dir():
                    continue
                relative = _safe_archive_path(info.filename, archive_root)
                if relative is None or _is_preserved(relative):
                    continue
                if info.external_attr >> 28 == 0xA:
                    continue
                source_path = extracted.joinpath(*relative.parts)
                resolved_source = source_path.resolve()
                if not _inside(resolved_source, extracted):
                    raise ValueError("Update archive contains an unsafe path.")
                source_path.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as source, source_path.open("wb") as target:
                    shutil.copyfileobj(source, target)

        for source in extracted.rglob("*"):
            if not source.is_file():
                continue
            relative = source.relative_to(extracted)
            if _is_preserved(PurePosixPath(*relative.parts)):
                continue
            destination = root.joinpath(*relative.parts)
            if not _inside(destination.resolve(), root):
                raise ValueError(f"Refusing to write outside the app folder: {relative}")
            parent = destination.parent
            while parent != root:
                if parent.is_symlink():
                    raise ValueError(f"Refusing to write through a symbolic link: {parent}")
                parent = parent.parent
            if destination.is_symlink():
                raise ValueError(f"Refusing to replace a symbolic link: {destination}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            staged = destination.with_name(destination.name + ".update")
            shutil.copy2(source, staged)
            try:
                os.replace(staged, destination)
            except PermissionError:
                if os.name != "nt" or not destination.exists():
                    raise
                old = destination.with_name(destination.name + ".old")
                if old.exists():
                    old.unlink()
                os.replace(destination, old)
                try:
                    os.replace(staged, destination)
                except OSError:
                    if not destination.exists() and old.exists():
                        os.replace(old, destination)
                    raise
            finally:
                if staged.exists():
                    staged.unlink()
            copied += 1

    if copied == 0:
        raise ValueError("Update archive did not contain any installable files.")
    ensure_command_permissions(root)
    after_hash = _sha256(requirements) if requirements.is_file() else None
    return before_hash != after_hash


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_and_apply(root: Path, archive_url: str, progress=None, nightly_sha: str | None = None) -> bool:
    if not archive_url.startswith("https://"):
        raise ValueError("Refusing to download an update from a non-HTTPS URL.")
    if nightly_sha is not None and not re.fullmatch(r"[0-9a-fA-F]{7,40}", nightly_sha):
        raise ValueError("Refusing to save an invalid Nightly commit SHA.")
    with tempfile.TemporaryDirectory(prefix="subtitle-studio-download-") as temp_dir:
        archive_path = Path(temp_dir) / "update.zip"
        request = urllib.request.Request(archive_url, headers={"User-Agent": "Subtitle-Studio-Updater"})
        if progress:
            progress("Downloading update...")
        with urllib.request.urlopen(request, timeout=30) as response, archive_path.open("wb") as target:
            shutil.copyfileobj(response, target)
        if progress:
            progress("Applying update...")
        requirements_changed = apply_archive(archive_path, root)
        if nightly_sha is not None:
            (root / ".nightly_sha").write_text(nightly_sha.lower() + "\n", encoding="utf-8")
        return requirements_changed


def ensure_command_permissions(root: Path) -> None:
    command = root / "Subtitle Studio.command"
    if os.name != "nt" and command.is_file():
        os.chmod(command, 0o755)


def cleanup_old_files(root: Path) -> list[OSError]:
    root = root.resolve()
    errors = []
    for current, dirs, files in os.walk(root):
        dirs[:] = [name for name in dirs if name.casefold() not in PRESERVED_PATHS]
        for name in files:
            if not name.casefold().endswith(".old"):
                continue
            path = Path(current) / name
            try:
                if not path.is_symlink() and path.is_file():
                    path.unlink()
            except OSError as exc:
                errors.append(exc)
    return errors
