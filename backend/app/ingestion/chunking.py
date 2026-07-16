import re

from .parsers import Block


def _split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n", text)
    return [p.strip() for p in parts if p.strip()]


def chunk_blocks(
    blocks: list[Block], chunk_size: int = 1000, overlap: int = 150
) -> list[dict]:
    chunks: list[dict] = []
    buffer = ""
    buf_page = None
    buf_heading = None

    def flush():
        nonlocal buffer, buf_page, buf_heading
        content = buffer.strip()
        if content:
            chunks.append(
                {
                    "content": content,
                    "page_number": buf_page,
                    "heading": buf_heading,
                    "token_count": max(1, len(content) // 4),
                }
            )
        buffer = ""

    for block in blocks:
        if buf_page is None:
            buf_page = block.page
            buf_heading = block.heading
        sentences = _split_sentences(block.text)
        for sentence in sentences:
            if len(buffer) + len(sentence) + 1 > chunk_size and buffer:
                flush()
                buf_page = block.page
                buf_heading = block.heading
                if overlap > 0:
                    tail = buffer[-overlap:]
                    buffer = tail
            buffer += (" " if buffer else "") + sentence
        if block.page is not None:
            buf_page = block.page
        if block.heading:
            buf_heading = block.heading

    flush()
    return chunks
