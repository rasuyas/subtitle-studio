# Changelog

## 0.5.0 - 2026-11-28

### Added
- Dropdown menus open the app's styled list instead of the native system menu. Keyboard: Space, Enter or Alt+Down opens, arrows move, Escape closes.
- Deleting a project asks for confirmation; Cancel is focused by default.
- Toast notifications report saves and failures.
- macOS packaging: packaged builds keep user data in Application Support.
- Saved Jobs show full names, clock-style durations and pluralized counts.

### Changed
- Refreshed dark theme and workspace styling.
- Modal, button and progress bar motion uses ease-out curves; reduced-motion settings disable it.

### Fixed
- Pressing Space on an open dropdown no longer also starts or pauses playback.
- Update extraction resolves its path correctly.

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
