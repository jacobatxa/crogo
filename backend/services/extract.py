from __future__ import annotations

import json
import re
from pathlib import Path

import httpx

from config import settings
from models.field_schema import EXTRACTION_HINTS, FIELD_DEFINITIONS
from models.schemas import FieldValue
from services.pdf_loader import extract_text_from_pdf
from services.vector_store import search


def _find_line_for_hint(text: str, hints: list[str]) -> tuple[str, float]:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for line in lines:
        for hint in hints:
            if hint.lower() in line.lower():
                for sep in ["：", ":", "—", "-"]:
                    if hint in line and sep in line:
                        parts = line.split(sep, 1)
                        if len(parts) == 2 and len(parts[1].strip()) > 1:
                            return parts[1].strip()[:500], 0.72
                if len(line) < 300:
                    return line, 0.55

    for hint in hints:
        pattern = rf"{re.escape(hint)}\s*[：:\-—]?\s*([^\n\r]{{2,200}})"
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return m.group(1).strip()[:500], 0.65
    return "", 0.0


def rule_based_extract(pdf_text: str, rag_context: str) -> list[FieldValue]:
    combined = pdf_text + "\n" + rag_context
    fields: list[FieldValue] = []

    for defn in FIELD_DEFINITIONS:
        key = defn["key"]
        hints = EXTRACTION_HINTS.get(key, [])
        value, conf = _find_line_for_hint(combined, hints)

        if not value and rag_context:
            for hint in hints:
                idx = rag_context.find(hint)
                if idx >= 0:
                    snippet = rag_context[idx : idx + 200]
                    value = snippet[:200]
                    conf = 0.45
                    break

        snippet = value[:120] if value else ""
        fields.append(
            FieldValue(
                key=key,
                label=defn["label"],
                value=value or "",
                confidence=conf,
                source_snippet=snippet,
                required=defn.get("required", True),
            )
        )
    return fields


async def llm_extract(pdf_text: str, rag_chunks: list[dict]) -> list[FieldValue]:
    schema_desc = "\n".join(
        f"- {d['key']}: {d['label']}" for d in FIELD_DEFINITIONS
    )
    context = "\n---\n".join(
        f"[{c.get('source', '')}] {c.get('text', '')[:400]}" for c in rag_chunks[:6]
    )
    prompt = f"""你是医药CRO文档专家。从以下临床试验方案文本中提取结构化字段。
仅返回 JSON 数组，每项格式: {{"key":"...", "value":"...", "confidence":0.0-1.0, "source_snippet":"..."}}

字段列表:
{schema_desc}

方案文本（节选）:
{pdf_text[:6000]}

知识库参考:
{context[:3000]}
"""

    url = f"{settings.llm_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": "只输出合法 JSON 数组，不要 markdown。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, headers=headers, json=body)
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]

    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```\w*\n?", "", content)
        content = re.sub(r"\n?```$", "", content)

    parsed = json.loads(content)
    by_key = {item.get("key"): item for item in parsed if isinstance(item, dict)}

    fields: list[FieldValue] = []
    for defn in FIELD_DEFINITIONS:
        key = defn["key"]
        item = by_key.get(key, {})
        fields.append(
            FieldValue(
                key=key,
                label=defn["label"],
                value=str(item.get("value", "") or ""),
                confidence=float(item.get("confidence", 0.8) or 0.8),
                source_snippet=str(item.get("source_snippet", "") or "")[:200],
                required=defn.get("required", True),
            )
        )
    return fields


async def extract_fields_from_pdf(pdf_path: Path) -> list[FieldValue]:
    pdf_text = extract_text_from_pdf(pdf_path)

    queries = [
        "主要终点 样本量 研究设计",
        "安全性监测 DMC 数据监查",
        "申办方 适应症 方案编号",
    ]
    rag_chunks: list[dict] = []
    seen: set[str] = set()
    for q in queries:
        for hit in search(q, top_k=3):
            t = hit.get("text", "")[:200]
            if t not in seen:
                seen.add(t)
                rag_chunks.append(hit)

    rag_context = "\n".join(c.get("text", "") for c in rag_chunks)

    if settings.llm_api_key:
        try:
            return await llm_extract(pdf_text, rag_chunks)
        except Exception:
            pass

    return rule_based_extract(pdf_text, rag_context)


def fields_to_json(fields: list[FieldValue]) -> str:
    return json.dumps([f.model_dump() for f in fields], ensure_ascii=False)


def fields_from_json(raw: str) -> list[FieldValue]:
    if not raw:
        return []
    data = json.loads(raw)
    return [FieldValue(**item) for item in data]


def preview_project_from_pdf(pdf_path: Path) -> dict:
    """Generate a preview dict for project creation from a PDF."""
    pdf_text = extract_text_from_pdf(pdf_path)
    fields = rule_based_extract(pdf_text, "")
    return {
        "name": pdf_path.stem,
        "fields": fields_to_json(fields),
    }
