# Subtitle Studio - Known Issues Kanban

Columns: **Backlog** → **In Progress** → **Done**

## Backlog

### Optimization & Performance
- [x] app still being optimized; short videos best tested.
- [ ] Live subtitle preview rendering is debounced and cached, but layout previews can still be slow on CPU or large source files.
- [ ] downscaled proxy is generated on demand playback when source codec is unsupported; downscaling layout-preview sources remains pending.

### Feature Gaps
- [ ] Output preview is locked to a 9:16 stage: a horizontal source renders portrait unless Crop Box/Reframe is on, and in a wide panel the stage fills the height and leaves side gutters (1920px). Deriving the stage aspect from the source when reframe is off is a future change.
- [ ] word-by-word pop-in style has no scale-in animation.
- [ ] Automated tests cover updater/version checks, transcript editing and script alignment, subtitle rendering, and desktop geometry; broader integration coverage remains limited.

### Architecture & Data
- [ ] Jobs are kept in memory and are lost when server restarts. Stale per-job folders in workspace/ are cleaned startup and shutdown 24 hours; active jobs and exports preserved.
- [ ] Audio/video playback with synchronized word highlighting is available in transcript editor. (verify status)

## In Progress

_(no items currently)_

## Done

_(items moved here when resolved)_