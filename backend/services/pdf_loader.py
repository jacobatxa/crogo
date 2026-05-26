from __future__ import annotations

from pathlib import Path

import fitz

from config import settings


class PDFLoadError(Exception):
    pass


def extract_text_from_pdf(path: Path) -> str:
    try:
        doc = fitz.open(path)
    except Exception as e:
        raise PDFLoadError(f"无法打开 PDF: {e}") from e

    pages: list[str] = []
    for page in doc:
        text = page.get_text("text").strip()
        if text:
            pages.append(text)
    doc.close()

    full = "\n\n".join(pages).strip()
    if not full:
        raise PDFLoadError(
            "PDF 未提取到文本，可能是扫描件。请使用可选中文本的 PDF。"
        )
    return full


def chunk_text(text: str) -> list[str]:
    size = settings.chunk_size
    overlap = settings.chunk_overlap
    if len(text) <= size:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + size
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = end - overlap
    return chunks
