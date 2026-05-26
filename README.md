# Crogo — CRO文档智能平台

医药CRO文档工作台。核心链路：PDF上传 → 知识库查询 → 模板匹配 → 一键生成。

## 一键启动（推荐）

```bash
chmod +x start.sh   # 首次需要
./start.sh
```

浏览器打开：**http://127.0.0.1:8000**

页面与 API 同一端口，无需再开第二个服务。

## 手动启动

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt   # 首次
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

同样访问：**http://127.0.0.1:8000**

## 可选：AI 字段提取

复制 `.env.example` 为 `.env` 并填写：

```
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

未配置时使用规则提取，仍可走完上传 → 校验 → 生成流程。

## 功能页面

| 路径 | 功能 |
|------|------|
| `/` | 工作台（免登录） |
| `/` + `?login=1` | 登录页（开发用） |
| `/docs` | API 文档 |

侧边栏：模板库、知识库、项目、设置。

## 内置模板（DMC / DMP / SAP）

首次启动会自动写入模板库（已映射字段，可直接用于新建项目）。手动补种：

```bash
cd backend && source .venv/bin/activate
python scripts/seed_templates.py          # 仅补缺
python scripts/seed_templates.py --force  # 按名称覆盖重建
```

## 测试数据

```bash
cd backend && source .venv/bin/activate
python scripts/make_test_pdf.py
```

完整用例见 [TESTING.md](TESTING.md)。

## 技术栈

- 前端：Vanilla JS（由 FastAPI 托管静态文件）
- 后端：FastAPI + ChromaDB + PyMuPDF + python-docx
- UI/UX：Google Stitch 设计系统（见 [.stitch/DESIGN.md](.stitch/DESIGN.md)、[STITCH.md](STITCH.md)）

## 数据目录

运行时数据在 `data/`（gitignore）：向量库、SQLite、PDF/docx、生成输出。
