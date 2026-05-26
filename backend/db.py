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
                template_ids TEXT DEFAULT '[]',
                pdf_path TEXT NOT NULL,
                pdf_filename TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                fields_json TEXT DEFAULT '[]',
                output_path TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (template_id) REFERENCES templates(id)
            );

            CREATE TABLE IF NOT EXISTS project_generations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                template_id INTEGER NOT NULL,
                output_path TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending',
                message TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id),
                FOREIGN KEY (template_id) REFERENCES templates(id)
            );
            """
        )
        # Migrate older DBs that miss template_ids column.
        cols = {row["name"] for row in conn.execute("PRAGMA table_info(projects)").fetchall()}
        if "template_ids" not in cols:
            conn.execute("ALTER TABLE projects ADD COLUMN template_ids TEXT DEFAULT '[]'")
        conn.execute(
            "UPDATE projects SET template_ids = json_array(template_id) "
            "WHERE (template_ids IS NULL OR template_ids = '' OR template_ids = '[]') "
            "AND template_id IS NOT NULL"
        )
        # Backfill project_generations for legacy single-template projects that already produced output.
        legacy = conn.execute(
            """SELECT id, template_id, output_path, updated_at FROM projects
               WHERE template_id IS NOT NULL
                 AND output_path IS NOT NULL AND output_path != ''
                 AND id NOT IN (SELECT DISTINCT project_id FROM project_generations)"""
        ).fetchall()
        for row in legacy:
            conn.execute(
                """INSERT INTO project_generations
                   (project_id, template_id, output_path, status, created_at)
                   VALUES (?, ?, ?, 'done', ?)""",
                (row["id"], row["template_id"], row["output_path"], row["updated_at"] or _now()),
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


def delete_template(tpl_id: int) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM templates WHERE id=?", (tpl_id,))


def count_projects_using_template(tpl_id: int) -> int:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT template_id, template_ids FROM projects"
        ).fetchall()
    n = 0
    for r in rows:
        ids = []
        try:
            ids = json.loads(r["template_ids"] or "[]")
        except Exception:
            ids = []
        if r["template_id"] == tpl_id or tpl_id in ids:
            n += 1
    return n


def create_project(
    name: str,
    sponsor: str,
    template_ids: list[int],
    pdf_path: str,
    pdf_filename: str,
) -> int:
    now = _now()
    primary = template_ids[0] if template_ids else None
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO projects
               (name, sponsor, template_id, template_ids, pdf_path, pdf_filename, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)""",
            (
                name,
                sponsor,
                primary,
                json.dumps(template_ids),
                pdf_path,
                pdf_filename,
                now,
                now,
            ),
        )
        return cur.lastrowid


def update_project_templates(proj_id: int, template_ids: list[int]) -> None:
    primary = template_ids[0] if template_ids else None
    with get_conn() as conn:
        conn.execute(
            "UPDATE projects SET template_id=?, template_ids=?, updated_at=? WHERE id=?",
            (primary, json.dumps(template_ids), _now(), proj_id),
        )


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


# ── Project generations ──────────────────────────────────────────


def reset_project_generations(proj_id: int, template_ids: list[int]) -> None:
    now = _now()
    with get_conn() as conn:
        conn.execute("DELETE FROM project_generations WHERE project_id=?", (proj_id,))
        for tid in template_ids:
            conn.execute(
                """INSERT INTO project_generations
                   (project_id, template_id, status, created_at)
                   VALUES (?, ?, 'pending', ?)""",
                (proj_id, tid, now),
            )


def update_generation(
    proj_id: int,
    template_id: int,
    *,
    status: str,
    output_path: str = "",
    message: str = "",
) -> None:
    with get_conn() as conn:
        conn.execute(
            """UPDATE project_generations
               SET status=?, output_path=?, message=?
               WHERE project_id=? AND template_id=?""",
            (status, output_path, message, proj_id, template_id),
        )


def list_project_generations(proj_id: int) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM project_generations WHERE project_id=? ORDER BY id ASC",
            (proj_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_generation(proj_id: int, template_id: int) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM project_generations WHERE project_id=? AND template_id=?",
            (proj_id, template_id),
        ).fetchone()
    return dict(row) if row else None
