from __future__ import annotations

import json
import re
from pathlib import Path

import httpx

from config import settings
from models.schemas import FieldValue
from services.pdf_loader import extract_text_from_pdf

CONFIDENCE_OK = 0.75


def classify_review_status(field: FieldValue) -> str:
    value = (field.value or "").strip()
    if field.required and not value:
        return "missing"
    if not value or (field.confidence or 0) < CONFIDENCE_OK:
        return "needs_review"
    return "auto_ok"


def _rule_suggestion(field: FieldValue) -> tuple[str, str]:
    status = classify_review_status(field)
    if status == "missing":
        return "必填项为空，请从方案 PDF 中补充", ""
    if status == "needs_review":
        if field.source_snippet:
            return f"置信度较低，请核对依据：{field.source_snippet[:120]}", ""
        return "置信度较低或值为空，请人工确认", ""
    return "", ""


def sort_review_fields(items: list[dict]) -> list[dict]:
    order = {"missing": 0, "needs_review": 1, "auto_ok": 2}
    return sorted(items, key=lambda x: (order.get(x["review_status"], 9), -(x.get("confidence") or 0)))


def build_summary(items: list[dict]) -> dict:
    counts = {"missing": 0, "needs_review": 0, "auto_ok": 0, "total": len(items)}
    for it in items:
        counts[it.get("review_status", "needs_review")] = (
            counts.get(it.get("review_status", "needs_review"), 0) + 1
        )
    counts["can_confirm"] = counts["missing"] == 0
    return counts


async def llm_field_suggestions(
    fields: list[FieldValue], pdf_text: str
) -> dict[str, dict[str, str]]:
    flagged = [f for f in fields if classify_review_status(f) != "auto_ok"]
    if not flagged or not settings.llm_api_key:
        return {}

    schema_lines = "\n".join(
        f"- {f.key} ({f.label}): 当前「{f.value or '(空)'}」"
        for f in flagged[:12]
    )
    prompt = f"""你是医药 CRO 文档专家。以下字段从临床试验方案中提取，但需人工审核。
请为每个字段给出简短审核建议（中文，一句）及建议值（若可推断）。

仅返回 JSON 对象，键为 field key，值格式:
{{"suggestion_note": "...", "suggested_value": "..."}}

待审核字段:
{schema_lines}

方案文本节选:
{pdf_text[:5000]}
"""

    url = f"{settings.llm_chat_base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": settings.llm_chat_model,
        "messages": [
            {"role": "system", "content": "只输出合法 JSON 对象，不要 markdown。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
    }
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(url, headers=headers, json=body)
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = re.sub(r"^```\w*\n?", "", content)
            content = re.sub(r"\n?```$", "", content)
        data = json.loads(content)
        if not isinstance(data, dict):
            return {}
        out: dict[str, dict[str, str]] = {}
        for key, item in data.items():
            if isinstance(item, dict):
                out[key] = {
                    "suggestion_note": str(item.get("suggestion_note", "") or ""),
                    "suggested_value": str(item.get("suggested_value", "") or ""),
                }
        return out
    except Exception:
        return {}


async def build_project_review(
    fields: list[FieldValue], pdf_path: Path | None = None
) -> dict:
    pdf_text = ""
    if pdf_path and pdf_path.exists():
        try:
            pdf_text = extract_text_from_pdf(pdf_path)
        except Exception:
            pdf_text = ""

    llm_hints = await llm_field_suggestions(fields, pdf_text)
    items: list[dict] = []
    for f in fields:
        status = classify_review_status(f)
        note, suggested = _rule_suggestion(f)
        hint = llm_hints.get(f.key, {})
        if hint.get("suggestion_note"):
            note = hint["suggestion_note"]
        if hint.get("suggested_value"):
            suggested = hint["suggested_value"]
        items.append(
            {
                **f.model_dump(),
                "review_status": status,
                "suggestion_note": note,
                "suggested_value": suggested,
            }
        )

    items = sort_review_fields(items)
    return {"summary": build_summary(items), "fields": items}
