# Changelog

## 0.4.0 - 2026-11-26

### Fixed
- Startup cleanup no longer deletes projects it has just loaded.
- Cleanup age is validated on the server: only whole days from 1 to 30 are accepted, and the setting file is now stored under the app folder instead of the current directory.
- Project saves write to a temporary file and replace `project.json` atomically, under a lock, so a crash or overlapping save cannot corrupt a project.
- YouTube downloads are saved as soon as the file is downloaded.
- Saving cleanup settings now reports a rejected value instead of failing silently.
- Switching transcription models unloads the previous model first, so two models are not held in memory at once.

### Added
- Tests for the startup cleanup path, the project `save`/`load` round trip, and cleanup age validation.
- YouTube projects are named after the video title. Double-click a project name in Saved Jobs to rename it; its folder is renamed too.
