from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path

from typing import List, Optional

from pydantic import BaseModel
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import db
from config import settings

FRONTEND_DIR = Path(__file__).resolve().parent.parent
from models.field_schema import FIELD_DEFINITIONS
from models.schemas import (
    FieldValue,
    GenerateResponse,
    IngestJobResponse,
    IngestJobStatus,
    KBStats,
    MappingUpdate,
    ProjectCreateResponse,
    ProjectDetail,
    ProjectGenerationOut,
    ProjectOut,
    SearchResult,
    TemplateDetailOut,
    TemplateOut,
)
from services.docx_generate import generate_docx
from services.docx_parser import parse_docx
from services.extract import extract_fields_from_pdf, fields_from_json, fields_to_json
from services.ingest import run_ingest
from services.pdf_loader import PDFLoadError, extract_text_from_pdf
from services.vector_store import count_chunks, search

app = FastAPI(title="Crogo API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    db.init_db()


@app.get("/api/health")
def health():
    return {"ok": True, "llm_configured": bool(settings.llm_api_key)}


@app.get("/api/kb/stats", response_model=KBStats)
def kb_stats():
    stats = db.kb_stats()
    chroma_count = count_chunks()
    return KBStats(
        chunk_count=max(stats["chunk_count"], chroma_count),
        document_count=stats["document_count"],
        project_count=stats["project_count"],
    )


@app.post("/api/kb/ingest", response_model=IngestJobResponse)
async def kb_ingest(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(400, "请上传至少一个 PDF 文件")
    payloads: list[tuple[str, bytes]] = []
    for f in files:
        payloads.append((f.filename or "unknown.pdf", await f.read()))
    result = run_ingest(payloads)
    return IngestJobResponse(
        job_id=result["job_id"],
        status=result["status"],
        file_count=result["file_count"],
        chunk_count=result["chunk_count"],
        message=result["message"],
    )


@app.get("/api/kb/jobs/{job_id}", response_model=IngestJobStatus)
def kb_job_status(job_id: str):
    job = db.get_ingest_job(job_id)
    if not job:
        raise HTTPException(404, "任务不存在")
    return IngestJobStatus(
        job_id=job["id"],
        status=job["status"],
        file_count=job["file_count"],
        chunk_count=job["chunk_count"],
        message=job["message"] or "",
    )


@app.get("/api/kb/search")
def kb_search(q: str, limit: int = 8):
    if not q.strip():
        return []
    hits = search(q.strip(), top_k=limit)
    return [SearchResult(text=h["text"], source=h["source"], score=h["score"]) for h in hits]


@app.get("/api/fields/schema")
def field_schema():
    return FIELD_DEFINITIONS


# ── Templates ──


def _template_out(row: dict) -> TemplateOut:
    sections = json.loads(row.get("sections_json") or "[]")
    placeholders = json.loads(row.get("placeholders_json") or "[]")
    mappings = json.loads(row.get("mappings_json") or "{}")
    updated = (row.get("updated_at") or "")[:7].replace("-", "-")
    if len(updated) >= 7:
        updated = updated[:7]
    return TemplateOut(
        id=row["id"],
        type=row["type"],
        name=row["name"],
        desc=row.get("description") or "",
        sections=len(sections),
        placeholders=len(placeholders),
        updated=updated or "—",
        mappings_complete=len(mappings) >= min(1, len(placeholders)),
    )


@app.get("/api/templates", response_model=list[TemplateOut])
def list_templates():
    return [_template_out(r) for r in db.list_templates()]


@app.post("/api/templates", response_model=TemplateOut)
async def upload_template(
    type: str = Form(...),
    name: str = Form(""),
    file: UploadFile = File(...),
):
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(400, "请上传 .docx 文件")

    safe = f"{uuid.uuid4().hex[:8]}_{file.filename}"
    dest = settings.templates_dir / safe
    dest.write_bytes(await file.read())

    sections, placeholders = parse_docx(dest)
    tpl_name = name.strip() or Path(file.filename).stem
    tpl_id = db.create_template(
        type,
        tpl_name,
        f"已解析 {len(sections)} 个章节、{len(placeholders)} 个占位符",
        str(dest),
        sections,
        placeholders,
    )
    row = db.get_template(tpl_id)
    return _template_out(row)


@app.get("/api/templates/{tpl_id}", response_model=TemplateDetailOut)
def get_template(tpl_id: int):
    row = db.get_template(tpl_id)
    if not row:
        raise HTTPException(404, "模板不存在")
    base = _template_out(row)
    return TemplateDetailOut(
        **base.model_dump(),
        sections_list=json.loads(row.get("sections_json") or "[]"),
        placeholders_list=json.loads(row.get("placeholders_json") or "[]"),
        mappings=json.loads(row.get("mappings_json") or "{}"),
    )


@app.patch("/api/templates/{tpl_id}/mappings")
def update_mappings(tpl_id: int, body: MappingUpdate):
    row = db.get_template(tpl_id)
    if not row:
        raise HTTPException(404, "模板不存在")
    db.update_template_mappings(tpl_id, body.mappings)
    return {"ok": True}


@app.delete("/api/templates/{tpl_id}")
def delete_template(tpl_id: int):
    row = db.get_template(tpl_id)
    if not row:
        raise HTTPException(404, "模板不存在")
    if db.count_projects_using_template(tpl_id) > 0:
        raise HTTPException(409, "模板已被项目引用，无法删除")
    try:
        p = Path(row["file_path"])
        if p.exists():
            p.unlink()
    except Exception:
        pass
    db.delete_template(tpl_id)
    return {"ok": True}


# ── Projects ──


def _parse_template_ids(row: dict) -> List[int]:
    try:
        ids = json.loads(row.get("template_ids") or "[]")
        ids = [int(x) for x in ids if x is not None]
    except Exception:
        ids = []
    if not ids and row.get("template_id"):
        ids = [int(row["template_id"])]
    return ids


def _project_out(row: dict) -> ProjectOut:
    return ProjectOut(
        id=row["id"],
        name=row["name"],
        sponsor=row.get("sponsor") or "",
        template_id=row.get("template_id"),
        template_ids=_parse_template_ids(row),
        status=row["status"],
        updated_at=row.get("updated_at") or "",
        has_output=bool(row.get("output_path")),
    )


@app.get("/api/projects", response_model=list[ProjectOut])
def list_projects():
    return [_project_out(r) for r in db.list_projects()]


def _parse_template_ids_form(raw: str) -> List[int]:
    if not raw:
        return []
    out: List[int] = []
    for chunk in raw.replace(";", ",").split(","):
        s = chunk.strip()
        if s.isdigit():
            out.append(int(s))
    seen = set()
    dedup: List[int] = []
    for t in out:
        if t not in seen:
            seen.add(t)
            dedup.append(t)
    return dedup


@app.post("/api/projects", response_model=ProjectCreateResponse)
async def create_project(
    name: str = Form(...),
    sponsor: str = Form(""),
    template_ids: str = Form(""),
    template_id: str = Form(""),
    file: UploadFile = File(...),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "请上传 PDF 方案文件")

    safe = f"proj_{uuid.uuid4().hex[:8]}_{file.filename}"
    dest = settings.pdfs_dir / safe
    dest.write_bytes(await file.read())

    try:
        extract_text_from_pdf(dest)
    except PDFLoadError as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, str(e)) from e

    ids = _parse_template_ids_form(template_ids)
    if not ids:
        legacy = _parse_template_ids_form(template_id)
        ids = legacy

    if not ids:
        raise HTTPException(400, "请选择至少一个模板")

    for tid in ids:
        tpl = db.get_template(tid)
        if not tpl:
            raise HTTPException(400, f"模板 {tid} 不存在")
        mappings = json.loads(tpl.get("mappings_json") or "{}")
        placeholders = json.loads(tpl.get("placeholders_json") or "[]")
        if placeholders and not mappings:
            raise HTTPException(400, f"模板「{tpl['name']}」尚未完成映射")

    proj_id = db.create_project(name, sponsor, ids, str(dest), file.filename)
    db.reset_project_generations(proj_id, ids)
    return ProjectCreateResponse(id=proj_id, name=name, status="draft")


def _generation_out(proj_id: int, template_ids: List[int]) -> List[ProjectGenerationOut]:
    gens = {g["template_id"]: g for g in db.list_project_generations(proj_id)}
    out: List[ProjectGenerationOut] = []
    for tid in template_ids:
        tpl = db.get_template(tid)
        if not tpl:
            continue
        g = gens.get(tid) or {}
        status = g.get("status") or "pending"
        out.append(
            ProjectGenerationOut(
                template_id=tid,
                template_name=tpl["name"],
                template_type=tpl["type"],
                status=status,
                message=g.get("message") or "",
                download_url=(
                    f"/api/projects/{proj_id}/download?template_id={tid}"
                    if status == "done"
                    else ""
                ),
            )
        )
    return out


@app.get("/api/projects/{proj_id}", response_model=ProjectDetail)
def get_project(proj_id: int):
    row = db.get_project(proj_id)
    if not row:
        raise HTTPException(404, "项目不存在")
    base = _project_out(row)
    fields = fields_from_json(row.get("fields_json") or "[]")
    template_ids = _parse_template_ids(row)
    return ProjectDetail(
        **base.model_dump(),
        fields=fields,
        pdf_filename=row.get("pdf_filename") or "",
        generations=_generation_out(proj_id, template_ids),
    )


@app.post("/api/projects/{proj_id}/extract")
async def extract_project(proj_id: int):
    row = db.get_project(proj_id)
    if not row:
        raise HTTPException(404, "项目不存在")

    db.update_project(proj_id, status="extracting")
    try:
        fields = await extract_fields_from_pdf(Path(row["pdf_path"]))
        db.update_project(
            proj_id,
            status="validating",
            fields_json=fields_to_json(fields),
        )
        return {"ok": True, "fields": [f.model_dump() for f in fields]}
    except Exception as e:
        db.update_project(proj_id, status="draft")
        raise HTTPException(500, f"提取失败: {e}") from e


class FieldsUpdateBody(BaseModel):
    fields: List[FieldValue]


@app.patch("/api/projects/{proj_id}/fields")
def save_fields(proj_id: int, body: FieldsUpdateBody):
    row = db.get_project(proj_id)
    if not row:
        raise HTTPException(404, "项目不存在")
    db.update_project(
        proj_id,
        status="validating",
        fields_json=fields_to_json(body.fields),
    )
    return {"ok": True}


@app.post("/api/projects/{proj_id}/generate", response_model=GenerateResponse)
def generate_project(proj_id: int):
    row = db.get_project(proj_id)
    if not row:
        raise HTTPException(404, "项目不存在")

    template_ids = _parse_template_ids(row)
    if not template_ids:
        raise HTTPException(400, "请先为项目选择模板")

    fields = fields_from_json(row.get("fields_json") or "[]")
    if not fields:
        raise HTTPException(400, "请先完成字段提取与校验")

    if not db.list_project_generations(proj_id):
        db.reset_project_generations(proj_id, template_ids)

    db.update_project(proj_id, status="generating")
    success_count = 0
    primary_output = ""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    for tid in template_ids:
        tpl = db.get_template(tid)
        if not tpl:
            db.update_generation(proj_id, tid, status="error", message="模板不存在")
            continue
        mappings = json.loads(tpl.get("mappings_json") or "{}")
        placeholders = json.loads(tpl.get("placeholders_json") or "[]")
        if placeholders and not mappings:
            db.update_generation(
                proj_id, tid, status="error", message="模板未完成映射"
            )
            continue

        out_name = f"project_{proj_id}_tpl{tid}_{timestamp}.docx"
        out_path = settings.outputs_dir / out_name
        try:
            generate_docx(Path(tpl["file_path"]), out_path, fields, mappings)
            db.update_generation(
                proj_id, tid, status="done", output_path=str(out_path)
            )
            success_count += 1
            if not primary_output:
                primary_output = str(out_path)
        except Exception as e:
            db.update_generation(
                proj_id, tid, status="error", message=str(e)
            )

    if success_count == 0:
        db.update_project(proj_id, status="validating")
        raise HTTPException(500, "所有模板生成均失败")

    final_status = "done" if success_count == len(template_ids) else "partial"
    db.update_project(proj_id, status=final_status, output_path=primary_output)
    gens = _generation_out(proj_id, template_ids)
    first_done = next((g for g in gens if g.status == "done"), None)
    return GenerateResponse(
        success=True,
        message=(
            f"已生成 {success_count} / {len(template_ids)} 份文档"
            if success_count < len(template_ids)
            else "文档生成成功"
        ),
        download_url=first_done.download_url if first_done else "",
        generations=gens,
    )


@app.get("/api/projects/{proj_id}/download")
def download_project(proj_id: int, template_id: Optional[int] = None):
    row = db.get_project(proj_id)
    if not row:
        raise HTTPException(404, "项目不存在")

    output_path = ""
    chosen_tpl_id: Optional[int] = None

    if template_id is not None:
        gen = db.get_generation(proj_id, template_id)
        if not gen or gen.get("status") != "done":
            raise HTTPException(404, "该模板尚未生成或生成失败")
        output_path = gen.get("output_path") or ""
        chosen_tpl_id = template_id
    else:
        for g in db.list_project_generations(proj_id):
            if g.get("status") == "done" and g.get("output_path"):
                output_path = g["output_path"]
                chosen_tpl_id = g["template_id"]
                break
        if not output_path:
            output_path = row.get("output_path") or ""

    if not output_path:
        raise HTTPException(404, "生成文件不存在")
    path = Path(output_path)
    if not path.exists():
        raise HTTPException(404, "文件已丢失")

    tpl_name = ""
    if chosen_tpl_id is not None:
        tpl = db.get_template(chosen_tpl_id)
        if tpl:
            tpl_name = tpl.get("name") or ""
    filename = (
        f"{row['name']}-{tpl_name}.docx" if tpl_name else f"{row['name']}.docx"
    )
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
    )


# ── 前端静态资源（与 API 同端口，一条命令即可访问完整应用）──

@app.get("/")
def serve_index():
    index = FRONTEND_DIR / "index.html"
    if not index.exists():
        raise HTTPException(500, "index.html 未找到")
    return FileResponse(index)


if (FRONTEND_DIR / "css").is_dir():
    app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
if (FRONTEND_DIR / "js").is_dir():
    app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")
