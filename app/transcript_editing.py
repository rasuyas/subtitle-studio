"""Pure helpers for editing timestamped transcript tokens."""
from __future__ import annotations


def replace_transcript_matches(
    words: list[dict], matches: list[dict], replacement: str
) -> list[dict]:
    """Replace searched text while preserving timestamps when token counts allow."""
    if not isinstance(replacement, str):
        raise ValueError("Replacement text must be a string.")

    updated_words = [dict(word) for word in words]
    for match in sorted(matches, key=lambda item: item["start"], reverse=True):
        first_index, last_index = match["firstIndex"], match["lastIndex"]
        if not isinstance(first_index, int) or not isinstance(last_index, int):
            raise ValueError("Transcript match indexes must be integers.")
        if first_index < 0 or last_index < first_index or last_index >= len(updated_words):
            raise ValueError("Transcript match indexes are out of range.")

        originals = updated_words[first_index:last_index + 1]
        first_offset, last_offset = match["firstOffset"], match["lastOffset"]
        first_text = str(originals[0].get("w", ""))
        last_text = str(originals[-1].get("w", ""))
        if not isinstance(first_offset, int) or not isinstance(last_offset, int):
            raise ValueError("Transcript match offsets must be integers.")
        if first_offset < 0 or first_offset > len(first_text) or last_offset < 0 or last_offset > len(last_text):
            raise ValueError("Transcript match offsets are out of range.")

        prefix = first_text[:first_offset]
        suffix = last_text[last_offset:]
        replacement_text = f"{prefix}{replacement}{suffix}".strip()
        pieces = replacement_text.split() if replacement_text else []
        start, end = originals[0]["start"], originals[-1]["end"]

        if len(pieces) == len(originals):
            replacement_words = [
                {**original, "w": piece}
                for original, piece in zip(originals, pieces)
            ]
        elif len(pieces) == 1 and len(originals) == 1:
            replacement_words = [{**originals[0], "w": pieces[0]}]
        else:
            duration = end - start
            replacement_words = []
            for index, piece in enumerate(pieces):
                source = dict(originals[min(index, len(originals) - 1)])
                source.update({
                    "w": piece,
                    "start": start + duration * index / len(pieces),
                    "end": start + duration * (index + 1) / len(pieces),
                })
                replacement_words.append(source)

        updated_words[first_index:last_index + 1] = replacement_words

    return updated_words
