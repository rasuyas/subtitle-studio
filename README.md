# Subtitle Studio

A local subtitle generator and video layout tool. Transcribe video or audio, edit
word-level captions, style animated highlights, and export a finished vertical video
or a transparent subtitle overlay.

> **Work in progress:** expect rough edges. This project was built with AI coding
> assistants and has not had a professional code or security review. It runs locally;
> do not expose its server to a network or the internet.

## Get started

You need Python 3.10 or newer and FFmpeg/FFprobe available on your PATH. An NVIDIA
GPU with CUDA 12.x is recommended for faster transcription; CPU transcription is
available but slower.

```bash
git clone https://github.com/rasuyas/subtitle-studio.git
cd subtitle-studio
```

- **Windows desktop:** double-click `Subtitle Studio.bat`.
- **macOS desktop:** install FFmpeg, then double-click `Subtitle Studio.command`.
- **Linux desktop:** run `bash ./launch.sh`.
- **Browser:** run `launch.bat --web` on Windows or `bash ./launch.sh --web` on
  macOS/Linux.

The launcher sets up the app on first run. The first transcription also downloads
the selected Whisper model.

## Documentation

- [Installation and first run](docs/getting-started.md) — prerequisites, download
  options, launch modes, and manual setup.
- [User guide](docs/user-guide.md) — transcription, editing, styles, exports, and
  custom Whisper models.
- [Troubleshooting](docs/troubleshooting.md) — common setup and rendering issues.
- [Known issues and implementation notes](SPEC.md#known-issues).
- [Third-party software and font notices](docs/third-party-notices.md).

## License

Subtitle Studio is licensed under the [MIT License](LICENSE). See the
[third-party notices](docs/third-party-notices.md) for dependency and font
information. Only process videos you own or have permission to use.
