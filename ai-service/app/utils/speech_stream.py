import re


_STRONG_BOUNDARY = re.compile(r"^([\s\S]*?[。！？；!?;])")
_WEAK_BOUNDARY = re.compile(r"^([\s\S]*?[，、,：:])")
_MARKDOWN_NOISE = re.compile(r"[#*`>|]")
_SEPARATOR_RUN = re.compile(r"[-]{2,}")
_BRACKETS = re.compile(r"[()\[\]（）【】]")
_WHITESPACE_RUN = re.compile(r"\s+")


def normalize_speech_piece(value: str) -> str:
    """Normalize one token or complete chunk before it reaches the digital human TTS."""
    value = value.replace("\r", "\n")
    value = _SEPARATOR_RUN.sub("", value)
    value = _MARKDOWN_NOISE.sub("", value)
    value = _BRACKETS.sub("，", value)
    value = value.replace("\n", "，")
    value = _WHITESPACE_RUN.sub("，", value)
    value = re.sub(r"，+", "，", value)
    return value.strip()


class SpeechChunkStream:
    """Accumulates normalized speech text and yields complete spoken chunks.

    The display token stream stays raw. This stream only feeds the digital human
    TTS path, so Markdown structure and machine punctuation never reach the
    runtime.
    """

    def __init__(self, min_weak_chars: int = 12, max_chars: int = 28):
        self.buffer = ""
        self.min_weak_chars = min_weak_chars
        self.max_chars = max_chars

    def push(self, value: str):
        if not value:
            return
        self.buffer += normalize_speech_piece(value)
        return self._drain()

    def flush(self):
        if not self.buffer:
            return []
        result = self.buffer.strip()
        self.buffer = ""
        return [result] if result else []

    def _drain(self):
        chunks = []
        while self.buffer:
            strong = _STRONG_BOUNDARY.match(self.buffer)
            if strong:
                chunk = strong.group(1)
                self.buffer = self.buffer[len(chunk):]
                chunks.append(chunk.strip())
                continue

            weak = _WEAK_BOUNDARY.match(self.buffer)
            if weak and len(weak.group(1)) >= self.min_weak_chars:
                chunk = weak.group(1)
                self.buffer = self.buffer[len(chunk):]
                chunks.append(chunk.strip())
                continue

            if len(self.buffer) < self.max_chars:
                break

            # Avoid cutting inside a word when the model emitted a long run with
            # no punctuation. Prefer the last weak boundary if one exists.
            weak_index = max(
                self.buffer.rfind("，"),
                self.buffer.rfind("、"),
                self.buffer.rfind(","),
                self.buffer.rfind("："),
                self.buffer.rfind(":"),
            )
            if weak_index > 0:
                chunk = self.buffer[: weak_index + 1]
                self.buffer = self.buffer[weak_index + 1:]
                chunks.append(chunk.strip())
                continue

            # Long punctuation-free text is rare after prompt cleanup. Delay it
            # until a real boundary or the end rather than risking a bad split.
            break

        return [chunk for chunk in chunks if chunk]
