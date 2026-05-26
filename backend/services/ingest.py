from __future__ import annotations

import uuid
from pathlib import Path

from config import settings
from db import add_kb_document, create_ingest_job, update_ingest_job
from services.pdf_loader import PDFLoadError, chunk_text, extract_text_from_pdf
from services.vector_store import add_chunks


def run_ingest(files: list[tuple[str, bytes]]) -> dict:
    job_id = str(uuid.uuid4())
    create_ingest_job(job_id)

    total_chunks = 0
    saved_count = 0
    errors: list[str] = []

    for filename, content in files:
        if not filename.lower().endswith(".pdf"):
            errors.append(f"{filename}: 仅支持 PDF")
            continue

        safe_name = f"{uuid.uuid4().hex[:8]}_{Path(filename).name}"
        dest = settings.pdfs_dir / safe_name
        dest.write_bytes(content)

        try:
            text = extract_text_from_pdf(dest)
            chunks = chunk_text(text)
            if not chunks:
                errors.append(f"{filename}: 无有效文本块")
                continue

            ids = [f"{job_id}_{safe_name}_{i}" for i in range(len(chunks))]
            metadatas = [
                {"source": filename, "file": safe_name, "chunk_index": i}
                for i in range(len(chunks))
            ]
            add_chunks(chunks, metadatas, ids)
            add_kb_document(filename, len(chunks))
            total_chunks += len(chunks)
            saved_count += 1
        except PDFLoadError as e:
            errors.append(f"{filename}: {e}")
            dest.unlink(missing_ok=True)

    if saved_count == 0:
        status = "error"
        msg = "; ".join(errors) if errors else "未处理任何文件"
    else:
        status = "done"
        msg = f"成功入库 {saved_count} 个文件，共 {total_chunks} 个片段"
        if errors:
            msg += f"；跳过: {'; '.join(errors)}"

    update_ingest_job(job_id, status, saved_count, total_chunks, msg)
    return {
        "job_id": job_id,
        "status": status,
        "file_count": saved_count,
        "chunk_count": total_chunks,
        "message": msg,
    }
