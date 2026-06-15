from __future__ import annotations

import re
from typing import Any

from models.field_schema import FIELD_DEFINITIONS

LABEL_TO_KEY: dict[str, str] = {
    "项目名称": "study_title",
    "研究标题": "study_title",
    "试验名称": "study_title",
    "方案编号": "protocol_id",
    "研究编号": "protocol_id",
    "版本号": "protocol_version",
    "申办方": "sponsor",
    "申办者": "sponsor",
    "适应症": "indication",
    "研究分期": "phase",
    "研究阶段": "phase",
    "研究类型": "design",
    "研究设计": "design",
    "试验设计": "design",
    "盲法": "blinding",
    "随机化": "randomization",
    "主要终点": "primary_endpoint",
    "次要终点": "secondary_endpoints",
    "探索性终点": "exploratory_endpoints",
    "安全性指标": "safety_monitoring",
    "安全性监测": "safety_monitoring",
    "样本量": "sample_size",
    "入组人数": "sample_size",
    "研究周期": "study_duration",
    "研究人群": "study_population",
    "入选标准": "inclusion_criteria",
    "排除标准": "exclusion_criteria",
    "期中分析": "interim_analysis",
    "期中分析时间点": "interim_analysis",
    "停止规则": "stopping_rules",
    "DMC主席": "dmc_chair",
    "DMC成员": "dmc_members",
    "会议频率": "meeting_frequency",
    "保密": "confidentiality",
    "保密条款": "confidentiality",
}

VALID_KEYS = {d["key"] for d in FIELD_DEFINITIONS}


def _suggest_one(ph_name: str, context: str = "") -> dict[str, Any]:
    raw = ph_name.strip()
    ctx = (context or "").strip()

    if raw.startswith("{{") and raw.endswith("}}"):
        inner = raw[2:-2].strip()
        if inner in VALID_KEYS:
            return {
                "field_key": inner,
                "confidence": 0.98,
                "requires_review": False,
                "strategy": "exact",
            }

    if raw in VALID_KEYS:
        return {
            "field_key": raw,
            "confidence": 0.98,
            "requires_review": False,
            "strategy": "exact",
        }

    for pat in (r"^<(.+)>$", r"^【(.+)】$"):
        m = re.match(pat, raw)
        if m:
            label = m.group(1).strip()
            if label in LABEL_TO_KEY and LABEL_TO_KEY[label] in VALID_KEYS:
                return {
                    "field_key": LABEL_TO_KEY[label],
                    "confidence": 0.92,
                    "requires_review": False,
                    "strategy": "alias",
                }
            return {
                "field_key": "",
                "confidence": 0.35,
                "requires_review": True,
                "strategy": "unknown",
            }

    if raw in LABEL_TO_KEY and LABEL_TO_KEY[raw] in VALID_KEYS:
        return {
            "field_key": LABEL_TO_KEY[raw],
            "confidence": 0.9,
            "requires_review": False,
            "strategy": "alias",
        }

    blob = f"{raw} {ctx}"
    best_key = ""
    best_score = 0.0
    for defn in FIELD_DEFINITIONS:
        label = defn["label"]
        if label in blob or label in raw:
            score = 0.75 if label in raw else 0.65
            if score > best_score:
                best_score = score
                best_key = defn["key"]
    if best_key:
        return {
            "field_key": best_key,
            "confidence": best_score,
            "requires_review": True,
            "strategy": "fuzzy",
        }

    if re.search(r"请.*填|待补充|TODO|TBD", raw + ctx, re.I):
        return {
            "field_key": "",
            "confidence": 0.2,
            "requires_review": True,
            "strategy": "free_text",
        }

    return {
        "field_key": "",
        "confidence": 0.0,
        "requires_review": True,
        "strategy": "unknown",
    }


def suggest_mappings(placeholders: list[dict]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for ph in placeholders:
        name = ph.get("name") or ""
        if name:
            out[name] = _suggest_one(name, ph.get("context") or "")
    return out


def auto_apply_mappings(
    placeholders: list[dict],
    *,
    min_confidence: float = 0.9,
) -> dict[str, str]:
    suggestions = suggest_mappings(placeholders)
    applied: dict[str, str] = {}
    for name, sug in suggestions.items():
        if (
            sug.get("field_key")
            and sug.get("confidence", 0) >= min_confidence
            and not sug.get("requires_review", True)
        ):
            applied[name] = sug["field_key"]
    return applied


def mappings_complete(placeholders: list[dict], mappings: dict[str, str]) -> bool:
    if not placeholders:
        return True
    for ph in placeholders:
        name = ph.get("name")
        if name and not mappings.get(name):
            return False
    return True


def compute_mapping_stats(
    placeholders: list[dict],
    mappings: dict[str, str],
    suggestions: dict[str, dict],
) -> dict:
    """Compute mapping statistics from placeholders and current mappings."""
    total = len(placeholders)
    auto = sum(1 for v in suggestions.values() if v.get("strategy") == "auto")
    pending = total - auto
    fill_rate = (auto / total * 100) if total > 0 else 0.0
    return {
        "total_placeholders": total,
        "auto_mapped": auto,
        "pending_review": pending,
        "fill_rate": round(fill_rate, 1),
    }


def enrich_mapping_suggestions(
    suggestions: dict[str, dict],
    mappings: dict[str, str],
) -> dict[str, dict]:
    """Enrich suggestions with applied mapping status."""
    out = {}
    for name, sug in suggestions.items():
        s = {**sug}
        s["applied"] = mappings.get(name) == s.get("field_key")
        out[name] = s
    return out
