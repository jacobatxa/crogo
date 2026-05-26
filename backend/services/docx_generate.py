from __future__ import annotations

import re
from pathlib import Path

from docx import Document

from models.schemas import FieldValue

PLACEHOLDER_PATTERNS = [
    (re.compile(r"\{\{([a-zA-Z0-9_]+)\}\}"), lambda k: f"{{{{{k}}}}}"),
    (re.compile(r"<([a-zA-Z0-9_]+)>"), lambda k: f"<{k}>"),
    (re.compile(r"【([a-zA-Z0-9_\u4e00-\u9fff]+)】"), lambda k: f"【{k}】"),
]


def _replace_in_text(text: str, value_map: dict[str, str], mappings: dict[str, str]) -> str:
    result = text
    for ph_name, field_key in mappings.items():
        val = value_map.get(field_key, "")
        if not val:
            continue
        for pat, fmt in PLACEHOLDER_PATTERNS:
            token = fmt(ph_name)
            if token in result:
                result = result.replace(token, val)
            result = pat.sub(lambda m, v=val: v if m.group(1) == ph_name else m.group(0), result, count=0)
    # Also replace direct field keys in templates
    for key, val in value_map.items():
        if not val:
            continue
        for pat, fmt in PLACEHOLDER_PATTERNS:
            token = fmt(key)
            if token in result:
                result = result.replace(token, val)
    return result


def generate_docx(
    template_path: Path,
    output_path: Path,
    fields: list[FieldValue],
    mappings: dict[str, str],
) -> None:
    value_map = {f.key: f.value for f in fields}
    # Map placeholder names to values via mappings
    for ph, fk in mappings.items():
        if fk in value_map and value_map[fk]:
            value_map[ph] = value_map[fk]

    doc = Document(template_path)

    for para in doc.paragraphs:
        if para.text.strip():
            new_text = _replace_in_text(para.text, value_map, mappings)
            if new_text != para.text:
                for run in para.runs:
                    run.text = ""
                if para.runs:
                    para.runs[0].text = new_text
                else:
                    para.add_run(new_text)

    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in cell.paragraphs:
                    if para.text.strip():
                        new_text = _replace_in_text(para.text, value_map, mappings)
                        if new_text != para.text:
                            for run in para.runs:
                                run.text = ""
                            if para.runs:
                                para.runs[0].text = new_text
                            else:
                                para.add_run(new_text)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(output_path)
