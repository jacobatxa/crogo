"""Create a Chinese-capable test PDF. Run: python scripts/make_test_pdf.py"""
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "test.pdf"

TEXT = """方案编号：TEST-001
申办方：测试制药有限公司
适应症：胰腺癌
主要终点：总生存期 OS
样本量：120例
研究设计：随机、双盲、安慰剂对照"""


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = fitz.open()
    page = doc.new_page()
    fontname = "china-s"
    try:
        page.insert_text((72, 72), TEXT, fontname=fontname, fontsize=11)
    except Exception:
        page.insert_text((72, 72), TEXT, fontsize=11)
    doc.save(str(OUT))
    doc.close()
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
