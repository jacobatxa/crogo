#!/usr/bin/env python3
"""End-to-end API smoke test for Crogo project workflow."""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8000"
PDF = Path(__file__).resolve().parents[2] / "data" / "pdfs" / (
    "86909064_伊立替康脂质体胰腺癌RWS方案 -1.0-2023年12月22.pdf"
)


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def ok(msg: str) -> None:
    print(f"OK: {msg}")


def main() -> None:
    client = httpx.Client(base_url=BASE, timeout=120.0)

    r = client.get("/api/health")
    r.raise_for_status()
    health = r.json()
    ok(f"health llm_configured={health.get('llm_configured')}")
    if not health.get("llm_configured"):
        print("WARN: LLM not configured — review suggestions will be rule-only")

    if not PDF.is_file():
        fail(f"PDF missing: {PDF}")

    with PDF.open("rb") as f:
        r = client.post(
            "/api/projects/preview",
            files={"file": (PDF.name, f, "application/pdf")},
        )
    r.raise_for_status()
    preview = r.json()
    ok(f"preview name={preview.get('name', '')[:40]!r} sponsor={preview.get('sponsor', '')[:24]!r}")

    r = client.get("/api/templates")
    r.raise_for_status()
    templates = r.json()
    sap = next((t for t in templates if "SAP" in (t.get("name") or "")), None)
    if not sap:
        sap = templates[0] if templates else None
    if not sap:
        fail("no templates")
    ok(f"template id={sap['id']} name={sap.get('name')}")

    with PDF.open("rb") as f:
        r = client.post(
            "/api/projects",
            data={
                "name": preview.get("name") or "E2E Test Project",
                "sponsor": preview.get("sponsor") or "Test Sponsor",
                "template_ids": str(sap["id"]),
            },
            files={"file": (PDF.name, f, "application/pdf")},
        )
    r.raise_for_status()
    proj = r.json()
    proj_id = proj["id"]
    ok(f"created project id={proj_id}")

    r = client.post(f"/api/projects/{proj_id}/extract")
    r.raise_for_status()
    extracted = r.json().get("fields") or []
    ok(f"extract returned {len(extracted)} fields")

    r = client.get(f"/api/projects/{proj_id}")
    r.raise_for_status()
    detail = r.json()
    if not detail.get("fields"):
        fail("project detail has no fields after extract")

    r = client.get(f"/api/projects/{proj_id}/review")
    r.raise_for_status()
    review = r.json()
    summary = review.get("summary") or {}
    ok(
        f"review total={summary.get('total')} missing={summary.get('missing')} "
        f"can_confirm={summary.get('can_confirm')}"
    )

    field_list = list(detail.get("fields") or [])
    by_key = {f["key"]: f for f in field_list}
    for item in review.get("fields") or []:
        if item.get("review_status") == "missing":
            f = by_key.get(item["key"])
            if f:
                f["value"] = item.get("suggested_value") or f.get("value") or "E2E-测试值"

    r = client.patch(
        f"/api/projects/{proj_id}/fields",
        json={"fields": field_list, "confirmed": True},
    )
    r.raise_for_status()
    ok("fields confirmed")

    r = client.post(f"/api/projects/{proj_id}/generate")
    r.raise_for_status()
    ok("generate started")

    for i in range(90):
        r = client.get(f"/api/projects/{proj_id}")
        r.raise_for_status()
        detail = r.json()
        gens = detail.get("generations") or []
        g = gens[0] if gens else {}
        status = g.get("status")
        phase = g.get("phase")
        print(f"  poll {i}: status={status} phase={phase}")
        if status == "done":
            ok(f"generation done grade={g.get('grade')} fill_rate={g.get('fill_rate')}")
            break
        if status == "error":
            fail(g.get("display_message") or g.get("message") or "generation error")
        time.sleep(2)
    else:
        fail("generation timeout")

    r = client.get(
        f"/api/projects/{proj_id}/download",
        params={"template_id": sap["id"]},
    )
    if r.status_code != 200:
        fail(f"download status={r.status_code}")
    if len(r.content) < 1000:
        fail(f"download too small ({len(r.content)} bytes)")
    ok(f"download docx size={len(r.content)}")

    print("\n=== E2E PASSED ===")


if __name__ == "__main__":
    main()
