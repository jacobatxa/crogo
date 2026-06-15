#!/usr/bin/env bash
# Crogo 一键启动：页面 + API 均在 http://127.0.0.1:8000
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/backend"

if [ ! -d .venv ]; then
  echo ">>> 首次运行：创建虚拟环境并安装依赖（约 1–2 分钟）..."
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt -q
fi

.venv/bin/python scripts/seed_templates.py 2>/dev/null || true

echo ""
echo "  Crogo 已启动"
echo "  请在浏览器打开:  http://127.0.0.1:8000"
echo "  API 文档:        http://127.0.0.1:8000/docs"
echo "  按 Ctrl+C 停止"
echo ""

exec env PYTHONPATH="$ROOT/backend${PYTHONPATH:+:$PYTHONPATH}" .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --reload
