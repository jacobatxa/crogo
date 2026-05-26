from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from config import settings


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS ingest_jobs (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                file_count INTEGER DEFAULT 0,
                chunk_count INTEGER DEFAULT 0,
                message TEXT DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS kb_documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                chunk_count INTEGER DEFAULT 0,
                ingested_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                file_path TEXT NOT NULL,
                sections_json TEXT DEFAULT '[]',
                placeholders_json TEXT DEFAULT '[]',
                mappings_json TEXT DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                sponsor TEXT DEFAULT '',
                template_id INTEGER,
                pdf_path TEXT NOT NULL,
                pdf_filename TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                fields_json TEXT DEFAULT '[]',
                output_path TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (template_id) REFERENCES templates(id)
            );
            """
        )


@contextmanager
def get_conn():
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def create_ingest_job(job_id: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO ingest_jobs (id, status, created_at) VALUES (?, ?, ?)",
            (job_id, "processing", _now()),
        )


def update_ingest_job(
    job_id: str,
    status: str,
    file_count: int = 0,
    chunk_count: int = 0,
    message: str = "",
) -> None:
    with get_conn() as conn:
        conn.execute(
            """UPDATE ingest_jobs SET status=?, file_count=?, chunk_count=?, message=?
               WHERE id=?""",
            (status, file_count, chunk_count, message, job_id),
        )


def get_ingest_job(job_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM ingest_jobs WHERE id=?", (job_id,)).fetchone()
        return dict(row) if row else None


def add_kb_document(filename: str, chunk_count: int) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO kb_documents (filename, chunk_count, ingested_at) VALUES (?, ?, ?)",
            (filename, chunk_count, _now()),
        )


def kb_stats() -> dict[str, int]:
    with get_conn() as conn:
        docs = conn.execute("SELECT COUNT(*) AS c FROM kb_documents").fetchone()["c"]
        chunks = conn.execute("SELECT COALESCE(SUM(chunk_count),0) AS c FROM kb_documents").fetchone()["c"]
        projects = conn.execute("SELECT COUNT(*) AS c FROM projects").fetchone()["c"]
    return {"document_count": docs, "chunk_count": chunks, "project_count": projects}


def create_template(
    type_: str,
    name: str,
    description: str,
    file_path: str,
    sections: list,
    placeholders: list,
) -> int:
    now = _now()
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO templates
               (type, name, description, file_path, sections_json, placeholders_json, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                type_,
                name,
                description,
                file_path,
                json.dumps(sections, ensure_ascii=False),
                json.dumps(placeholders, ensure_ascii=False),
                now,
                now,
            ),
        )
        return cur.lastrowid


def list_templates() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM templates ORDER BY id DESC").fetchall()
    return [dict(r) for r in rows]


def get_template(tpl_id: int) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM templates WHERE id=?", (tpl_id,)).fetchone()
    return dict(row) if row else None


def update_template_mappings(tpl_id: int, mappings: dict) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE templates SET mappings_json=?, updated_at=? WHERE id=?",
            (json.dumps(mappings, ensure_ascii=False), _now(), tpl_id),
        )


def create_project(
    name: str,
    sponsor: str,
    template_id: int | None,
    pdf_path: str,
    pdf_filename: str,
) -> int:
    now = _now()
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO projects
               (name, sponsor, template_id, pdf_path, pdf_filename, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)""",
            (name, sponsor, template_id, pdf_path, pdf_filename, now, now),
        )
        return cur.lastrowid


def list_projects() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM projects ORDER BY id DESC").fetchall()
    return [dict(r) for r in rows]


def get_project(proj_id: int) -> dict | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM projects WHERE id=?", (proj_id,)).fetchone()
    return dict(row) if row else None


def update_project(
    proj_id: int,
    *,
    status: str | None = None,
    fields_json: str | None = None,
    output_path: str | None = None,
    sponsor: str | None = None,
) -> None:
    parts = ["updated_at=?"]
    vals: list[Any] = [_now()]
    if status is not None:
        parts.append("status=?")
        vals.append(status)
    if fields_json is not None:
        parts.append("fields_json=?")
        vals.append(fields_json)
    if output_path is not None:
        parts.append("output_path=?")
        vals.append(output_path)
    if sponsor is not None:
        parts.append("sponsor=?")
        vals.append(sponsor)
    vals.append(proj_id)
    with get_conn() as conn:
        conn.execute(f"UPDATE projects SET {', '.join(parts)} WHERE id=?", vals)
