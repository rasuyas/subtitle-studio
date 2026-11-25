# Subtitle Studio

**Version 0.2.0**

**A local subtitle generator with alpha-channel export, plus a layout tool for turning landscape clips into vertical (9:16) videos.**

Drop in a video, an audio file or a YouTube link. The app transcribes it with word-level timestamps, draws animated highlight subtitles, and exports either a finished vertical video or a **transparent subtitle-only overlay** you can drag straight into your editor.

Everything runs on your own computer. Nothing is uploaded anywhere.

> [!WARNING]
> **Work in progress.** It already works well for short videos in the author's own use, but it is still buggy and not optimized. Expect rough edges, and see [Known issues](#known-issues).

---

## AI disclaimer

This project was **written with AI coding assistants** (mainly Claude by Anthropic), not by a professional developer.

- **About the author:** I work in video editing. My coding knowledge is old. I can read error messages and point the AI to where something is broken, but I mostly contribute **ideas, feature design and testing** from an editor's point of view.
- **What that means for you:** the code has not had a professional review. It may contain bugs, inefficient code or security weaknesses I can't spot myself. Read it before you trust it, and use it at your own risk.
- **Local only:** the server binds to `127.0.0.1` and is meant for your own machine. Do not expose it to a network or the internet.
- **Contributions are welcome**, especially from developers who can review, simplify or harden the code.

---

## What it does

### Subtitle generator (the main focus)

- **Inputs:** local video (`.mp4`, `.mov`, `.mkv`, `.webm`), local audio (`.mp3`, `.wav`, `.m4a`, `.aac`, `.ogg`), or a **YouTube link** (video, or audio only).
- **Word-level transcription** with faster-whisper on an NVIDIA GPU. Models: `small`, `medium`, `large-v3`, `large-v3-turbo` (default). Language: auto-detect, Indonesian or English.
- **Bring your own model:** use any faster-whisper (CTranslate2) model, from a folder or a Hugging Face repo.
- **Editable transcript:** fix misheard words, casing, slang and timing, then render again without transcribing again.
- **Phrase chunking:** 1 to 5 words per line, max characters, automatic breaks on punctuation and pauses.
- **Highlight styles:**
  - **Red rounded pill** (default): a rounded box follows the spoken word.
  - **Color pop:** the spoken word changes color and scales up.
  - **Word-by-word pop-in:** words appear one by one as they are spoken.
- **Customization:** font (Montserrat ExtraBold, Poppins ExtraBold, Anton, plus any `.ttf` or `.otf` you drop into `fonts/`), size, all caps, vertical position, text color, outline width and color, drop shadow (offset, blur, opacity), highlight color, corner radius, padding, optional box border, pop color and scale.
- **Live preview** of the subtitle style before you render.

### Alpha-channel export

| Export | Format | Use it for |
|---|---|---|
| Transparent subtitles | `.mov`, ProRes 4444 with alpha | Importing into an editor and placing subtitles over your own footage |
| Transparent subtitles (smaller) | `.webm`, VP9 with alpha | Smaller files |
| Video with subtitles | `.mp4`, H.264 | A finished vertical video |

The alpha overlay matches your source video's frame rate and duration, so it lines up on the timeline. It is intended for editors such as Premiere Pro, DaVinci Resolve and CapCut. Alpha support varies between editors and versions, so test it in yours.

### Clip layout tool

Turns a landscape video into a 1080x1920 vertical video using draggable crop boxes for the **main content** and the **facecam**:

- Split top/bottom, 50/50
- Split top/bottom, 35/65
- Picture-in-picture, with the facecam in any corner
- Single full frame, with an optional blurred background

Layouts are presets plus manual crop boxes. Automatic face detection is not implemented.

---

## Requirements

- **Windows, macOS or Linux**
- **Python 3.10 or newer**
- **FFmpeg and FFprobe** installed and available on your PATH
- **NVIDIA GPU with CUDA 12.x** for fast transcription on Windows/Linux. macOS uses CPU int8; without CUDA on other platforms it also falls back to CPU, which is much slower.
- Internet access on first run, to download the Whisper model and the fonts

---

## Install and run

```bash
git clone https://github.com/<your-username>/sub-generator.git
cd sub-generator
```

You can run Subtitle Studio as a **Desktop app** on Windows or in a **web browser** on Windows or Linux. On first run, the launchers automatically create a virtual environment and install the requirements. The first transcription also downloads the Whisper model, so it takes longer.

### Desktop App

- **Windows:** double-click `Subtitle Studio.bat` (or `Subtitle Studio.pyw` / `Subtitle Studio.vbs` to launch without a console window).
- **macOS:** install FFmpeg and FFprobe, then double-click `Subtitle Studio.command`. If macOS blocks it, allow it in Privacy & Security or launch it with `"./Subtitle Studio.command"` from Terminal.
- **Linux:** run `bash ./launch.sh`.
- **Windows shortcuts:** double-click `Create Desktop Shortcut.bat` to generate shortcuts on your Desktop and Start Menu.

### Web-based (browser)

- **Windows:** run `launch.bat --web`
- **macOS or Linux:** run `bash ./launch.sh --web`

This starts the local server and opens `http://127.0.0.1:8000` in your web browser.

### Manual start (Terminal) - Not Tested

If you prefer running things manually:

```bash
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt

# Desktop app:
python -m app.desktop

# Web-based (browser):
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

---

## Quick start

1. Load a **file** or paste a **YouTube link** (use *Look up*, then *Download*).
2. Pick a model and language, then press **Transcribe**.
3. Fix any mistakes in the **Transcript** panel.
4. Choose a **layout** and drag the crop boxes (video sources only).
5. Pick a **highlight style** and adjust the look. Watch the live preview.
6. Choose an **export mode** and press **Render**. Files are saved in `exports/`.

### Using your own Whisper model

Put a CTranslate2-format model folder (it contains `model.bin`) inside `models/`, then reload the page. It appears in the model list. You can also choose *Other folder or Hugging Face repo* and paste a folder path or a repo id.

To convert a regular Hugging Face Whisper model:

```bash
pip install ctranslate2 "transformers[torch]"
ct2-transformers-converter --model your/finetune --output_dir models/my-model --copy_files tokenizer.json preprocessor_config.json --quantization float16
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Windows Defender or antivirus warns about `.bat` / `.vbs` files downloaded from GitHub | This can be a false-positive warning. These Windows launcher scripts use PowerShell and `WScript.Shell` to create shortcuts or start the app without a console window. Inspect the files in a text editor before running them, or use the **Manual start (Terminal)** commands above instead. |
| `open() got an unexpected keyword argument 'metadata_errors'` | PyAV 19 is too new for faster-whisper. Run `pip install "av<19"` inside the venv. The requirements file already pins this. |
| `ffmpeg` or `ffprobe` not found | Install FFmpeg and add it to your PATH, then restart the launcher. |
| CUDA or cuDNN errors when transcribing | Check that your NVIDIA driver supports CUDA 12. The app falls back to CPU if CUDA cannot load. |
| NVENC not available | The MP4 export automatically retries with the slower CPU encoder (`libx264`). |
| Fonts missing | Check your internet connection and restart, or put `.ttf` files into `fonts/` yourself. |

When you report a bug, please paste the **full error text** from the terminal and the steps that caused it.

---

## Known issues

- Still buggy and not optimized. Short videos work best; very long videos have not been tested properly.
- Jobs are kept in memory and are lost when the server restarts. The `workspace/` folder is not cleaned automatically.
- The word-by-word pop-in style has no scale-in animation.
- The layout preview can be slow on CPU or with large source files.
- No automated tests yet.
- No audio playback in the transcript editor, so timing has to be checked by rendering.

## Ideas and roadmap

- Playback with the live subtitle overlay for timing checks
- Pop-in animation and word fades
- SRT and ASS export
- Save and load a project (words, style, crops)
- Automatic face detection for layouts
- Job cleanup, tests and code review

---

## Project structure

```
sub-generator/
  Subtitle Studio.bat       Windows desktop launcher
  Subtitle Studio.pyw       Python desktop launcher without a console
  Subtitle Studio.vbs       silent Windows desktop launcher
  Create Desktop Shortcut.bat
                            creates Desktop and Start Menu shortcuts
  launch.bat                Windows setup and launch script
  launch.sh                 Linux setup and launch script
  requirements.txt
  fonts/        subtitle fonts (downloaded on first run)
  models/       optional custom Whisper models
  workspace/    temporary files per job
  exports/      finished videos and overlays
  app/
    main.py             web server and API
    desktop.py          native desktop window via pywebview
    downloader.py       YouTube download
    transcriber.py      speech-to-text
    subtitle_engine.py  phrase chunking and subtitle drawing
    video_renderer.py   layouts and FFmpeg export
    static/             web interface (index.html, app.js)
```

---

## Open-source software used

This project stands on the work of these open-source projects. Licenses are listed from memory by the AI that wrote this file, so please **check each project's own repository** before you rely on them, especially if you redistribute or sell anything.

### Core

| Project | Used for | License |
|---|---|---|
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | Speech-to-text with word timestamps | MIT |
| [CTranslate2](https://github.com/OpenNMT/CTranslate2) | Inference engine behind faster-whisper | MIT |
| [OpenAI Whisper](https://github.com/openai/whisper) | The original speech models | MIT |
| [FFmpeg](https://ffmpeg.org) | Video and audio processing, layouts, encoding | LGPL 2.1+ or GPL 2+, depending on the build |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | YouTube download | Unlicense |
| [Pillow](https://github.com/python-pillow/Pillow) | Drawing the subtitle frames | HPND |
| [FastAPI](https://github.com/fastapi/fastapi) | Web server framework | MIT |
| [Uvicorn](https://github.com/encode/uvicorn) | Runs the web server | BSD-3-Clause |
| [pywebview](https://github.com/r0x0r/pywebview) | Native desktop window | BSD-3-Clause |
| [python-multipart](https://github.com/Kludex/python-multipart) | File uploads | Apache-2.0 |
| [NumPy](https://github.com/numpy/numpy) | Audio arrays | BSD-3-Clause |
| [PyAV](https://github.com/PyAV-Org/PyAV) | Media library required by faster-whisper | BSD-3-Clause |

### Installed automatically as dependencies

| Project | License |
|---|---|
| [Hugging Face Hub](https://github.com/huggingface/huggingface_hub) (model downloads) | Apache-2.0 |
| [Tokenizers](https://github.com/huggingface/tokenizers) | Apache-2.0 |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) | MIT |
| [Silero VAD](https://github.com/snakers4/silero-vad) (voice activity detection) | MIT |

### Web interface

| Project | Used for | License |
|---|---|---|
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | Styling (loaded from a CDN) | MIT |
| [IBM Plex Sans](https://github.com/IBM/plex) | Interface font (loaded from Google Fonts) | SIL Open Font License 1.1 |

### Subtitle fonts

| Font | Designer or source | License |
|---|---|---|
| [Montserrat](https://github.com/JulietaUla/Montserrat) | Julieta Ulanovsky and contributors | SIL Open Font License 1.1 |
| [Poppins](https://github.com/itfoundry/poppins) | Indian Type Foundry | SIL Open Font License 1.1 |
| [Anton](https://fonts.google.com/specimen/Anton) | Vernon Adams | SIL Open Font License 1.1 |

Fonts are downloaded at first run from the Montserrat repository and the [Google Fonts repository](https://github.com/google/fonts).

### Not open source, but required for GPU transcription

- **NVIDIA CUDA, cuBLAS and cuDNN** (installed through the `nvidia-cublas-cu12` and `nvidia-cudnn-cu12` packages) are proprietary NVIDIA software under NVIDIA's own license.

---

## Legal note

Only download or process videos you own or have permission to use. Respect YouTube's Terms of Service and copyright law. You are responsible for how you use this tool.

## License

This project is licensed under the [MIT License](LICENSE).