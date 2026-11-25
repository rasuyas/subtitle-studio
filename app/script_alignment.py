"""Conservative reference-script alignment for timestamped transcript words."""
from __future__ import annotations

from difflib import SequenceMatcher
import re
import unicodedata


_STAGE_NOTES = re.compile(
    r"\[[^\]]*\]|\{[^}]*\}|\([^)]*(?:laugh|pause|sigh|music|applause|scream|whisper)[^)]*\)",
    re.IGNORECASE,
)


def _normalize(word: str) -> str:
    return "".join(char for char in word.lower() if not unicodedata.category(char).startswith("P"))


def _script_words(reference: str) -> list[str]:
    tokens = []
    pending_prefix = ""
    for token in _STAGE_NOTES.sub(" ", reference).split():
        if _normalize(token):
            tokens.append(pending_prefix + token)
            pending_prefix = ""
        elif tokens:
            tokens[-1] += token
        else:
            pending_prefix += token
    return tokens


def fix_words_from_script(words: list[dict], reference: str) -> tuple[list[dict], int]:
    """Apply script wording without moving the spoken transcript's outer timing bounds."""
    if not isinstance(reference, str) or not reference.strip():
        raise ValueError("Paste a reference script first.")
    if not words:
        raise ValueError("Transcribe audio before fixing words from a script.")

    script_words = _script_words(reference)
    if not script_words:
        raise ValueError("The reference script does not contain any words.")

    transcript = []
    for word in words:
        if not isinstance(word, dict) or not isinstance(word.get("w"), str):
            raise ValueError("Transcript words must include text and timestamps.")
        try:
            start, end = float(word["start"]), float(word["end"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("Transcript words must include valid timestamps.") from exc
        if end < start:
            raise ValueError("Transcript word end times must not precede start times.")
        transcript.append(word)

    matcher = SequenceMatcher(
        a=[_normalize(word["w"]) for word in transcript],
        b=[_normalize(word) for word in script_words],
        autojunk=False,
    )
    result = [dict(word) for word in transcript]
    fixed = 0

    # Work backwards so unequal-length replacements don't shift later opcode indexes.
    for tag, i1, i2, j1, j2 in reversed(matcher.get_opcodes()):
        if tag == "equal":
            for offset in range(i2 - i1):
                script_word = script_words[j1 + offset]
                if result[i1 + offset]["w"] != script_word:
                    result[i1 + offset]["w"] = script_word
                    fixed += 1
        elif tag == "replace":
            old_count, new_count = i2 - i1, j2 - j1
            if old_count == new_count:
                for offset in range(old_count):
                    script_word = script_words[j1 + offset]
                    if result[i1 + offset]["w"] != script_word:
                        result[i1 + offset]["w"] = script_word
                        fixed += 1
                continue

            if not old_count or not new_count:
                continue

            start = float(result[i1]["start"])
            end = float(result[i2 - 1]["end"])
            span = max(0.0, end - start)
            replacement = script_words[j1:j2]
            weights = [max(1, len(_normalize(word))) for word in replacement]
            total_weight = sum(weights)
            cursor = start
            rebuilt = []
            for index, (script_word, weight) in enumerate(zip(replacement, weights)):
                token_end = end if index == len(replacement) - 1 else cursor + span * weight / total_weight
                token = {"w": script_word, "start": cursor, "end": token_end}
                if index == 0:
                    token = {**result[i1], **token}
                rebuilt.append(token)
                cursor = token_end
            result[i1:i2] = rebuilt
            fixed += sum(
                1 for index, script_word in enumerate(replacement)
                if index >= old_count or transcript[i1 + index]["w"] != script_word
            )

    return result, fixed
