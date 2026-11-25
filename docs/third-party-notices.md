# Third-party software and font notices

Subtitle Studio uses the projects and fonts listed below. License information is
provided as a convenience; verify each project's current license in its own
repository before redistribution or commercial use.

## Core dependencies

| Project | Use | License |
|---|---|---|
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | Speech-to-text with word timestamps | MIT |
| [CTranslate2](https://github.com/OpenNMT/CTranslate2) | Inference engine used by faster-whisper | MIT |
| [OpenAI Whisper](https://github.com/openai/whisper) | Speech models | MIT |
| [FFmpeg](https://ffmpeg.org) | Media processing and encoding | LGPL 2.1+ or GPL 2+, depending on the build |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | YouTube downloads | Unlicense |
| [Pillow](https://github.com/python-pillow/Pillow) | Subtitle frame drawing | HPND |
| [FastAPI](https://github.com/fastapi/fastapi) | Web server framework | MIT |
| [Uvicorn](https://github.com/encode/uvicorn) | Web server | BSD-3-Clause |
| [pywebview](https://github.com/r0x0r/pywebview) | Desktop window | BSD-3-Clause |
| [python-multipart](https://github.com/Kludex/python-multipart) | File uploads | Apache-2.0 |
| [NumPy](https://github.com/numpy/numpy) | Audio arrays | BSD-3-Clause |
| [PyAV](https://github.com/PyAV-Org/PyAV) | Media library used by faster-whisper | BSD-3-Clause |

## Automatically installed dependencies

| Project | Use | License |
|---|---|---|
| [Hugging Face Hub](https://github.com/huggingface/huggingface_hub) | Model downloads | Apache-2.0 |
| [Tokenizers](https://github.com/huggingface/tokenizers) | Text tokenization | Apache-2.0 |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) | Runtime dependency | MIT |
| [Silero VAD](https://github.com/snakers4/silero-vad) | Voice activity detection | MIT |

## Web interface

| Project | Use | License |
|---|---|---|
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | Styling, loaded from a CDN | MIT |
| [IBM Plex Sans](https://github.com/IBM/plex) | Interface font, loaded from Google Fonts | SIL Open Font License 1.1 |

## Subtitle fonts

| Font | Designer or source | License |
|---|---|---|
| [Montserrat](https://github.com/JulietaUla/Montserrat) | Julieta Ulanovsky and contributors | SIL Open Font License 1.1 |
| [Poppins](https://github.com/itfoundry/poppins) | Indian Type Foundry | SIL Open Font License 1.1 |
| [Anton](https://fonts.google.com/specimen/Anton) | Vernon Adams | SIL Open Font License 1.1 |

Fonts are downloaded at first run from the Montserrat repository and the
[Google Fonts repository](https://github.com/google/fonts).

## NVIDIA software

GPU transcription uses NVIDIA CUDA, cuBLAS, and cuDNN through the
`nvidia-cublas-cu12` and `nvidia-cudnn-cu12` packages. These are proprietary
NVIDIA software distributed under NVIDIA's own license.
