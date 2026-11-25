# User guide

## Generate subtitles

1. Load a local video or audio file, or paste a YouTube link and use **Look up**,
   then **Download**.
2. Choose a Whisper model and language, then select **Transcribe**.
3. Review and correct words and timings in the **Transcript** panel. You can search
   and replace transcript text or apply wording corrections from a reference script.
4. Choose a highlight style and adjust its appearance; use the live preview to
   check the result.
5. Choose an export mode and select **Render**. Output files are saved in `exports/`.

Transcription provides word-level timestamps. Available model choices include
`small`, `medium`, `large-v3`, `large-v3-turbo` (the default), and custom
CTranslate2 models. Language can be auto-detected or set to Indonesian or English.

## Style and layout

Subtitle lines can be chunked from 1 to 5 words, with a character limit and
automatic breaks at punctuation and pauses. Highlight styles include:

- **Red rounded pill:** a rounded box follows the spoken word.
- **Color pop:** the spoken word changes color and scales up.
- **Word-by-word pop-in:** words appear as they are spoken.

You can customize fonts, size, capitalization, vertical position, text and outline
colors, shadows, highlight color, corner radius, padding, and related style
settings. Montserrat ExtraBold, Poppins ExtraBold, and Anton are included; add
`.ttf` or `.otf` fonts to `fonts/` to use your own.

For video sources, the optional layout tool reframes landscape footage into a
1080x1920 vertical video. Choose a split top/bottom layout, picture-in-picture, or
a full frame with an optional blurred background, then position the crop boxes.
Automatic face detection is not implemented. Audio-only sources do not have crop
controls.

## Export formats

| Export | Format | Use |
|---|---|---|
| Transparent subtitles | `.mov`, ProRes 4444 with alpha | Overlay in a video editor |
| Transparent subtitles (smaller) | `.webm`, VP9 with alpha | Smaller overlay files |
| Video with subtitles | `.mp4`, H.264 | Finished vertical video |

Transparent overlays match the source video's frame rate and duration. Alpha
support varies by editor and version, so test the overlay in your editing software.
If NVENC is unavailable, MP4 export retries with the slower CPU encoder (`libx264`).

## Use a custom Whisper model

Place a CTranslate2-format model folder (containing `model.bin`) inside `models/`,
then reload the app. Alternatively, choose **Other folder or Hugging Face repo** in
the model list and enter a folder path or repository ID.

To convert a regular Hugging Face Whisper model:

```bash
pip install ctranslate2 "transformers[torch]"
ct2-transformers-converter --model your/finetune --output_dir models/my-model --copy_files tokenizer.json preprocessor_config.json --quantization float16
```
