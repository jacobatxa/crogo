# Crogo 回归测试清单

## 启动

```bash
./start.sh
```

打开：**http://127.0.0.1:8000**

## 用例

| # | 步骤 | 预期 |
|---|------|------|
| 1 | 打开 http://127.0.0.1:8000 | 直接进入工作台 |
| 2 | 知识库 → 上传 PDF | 统计数字增加 |
| 3 | 模板库 → 上传 .docx（含 `{{protocol_id}}` 等） | 进入映射页 |
| 4 | 保存占位符映射 | 成功提示 |
| 5 | 新建项目 + PDF | 字段提取、校验页 |
| 6 | 生成 DMC → 下载 | docx 占位符已替换 |

测试 PDF：`cd backend && source .venv/bin/activate && python scripts/make_test_pdf.py`

## API 冒烟

```bash
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:8000/
```
