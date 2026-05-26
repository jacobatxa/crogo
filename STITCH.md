# Stitch 集成说明

设计系统来源：[google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills)

## 已生成资源

| 资源 | 路径 |
|------|------|
| 设计规范 | [.stitch/DESIGN.md](.stitch/DESIGN.md) |
| Stitch 项目 | `projects/3283688892708958711`（Crogo CRO Platform） |
| 工作台屏幕 | `screens/6e1bab15de9b43a586d5ee80c84ab645` |

在 [Stitch 控制台](https://stitch.withgoogle.com/) 打开上述项目可查看/编辑高保真稿。

## Cursor 中启用 Stitch MCP

1. 复制配置模板：

```bash
cp .cursor/mcp.json.example .cursor/mcp.json
```

2. 将 `YOUR_STITCH_API_KEY` 替换为你的 API Key（或写入根目录 `.env` 的 `STITCH_API_KEY`）。

3. **重启 Cursor** 或刷新 MCP 服务器列表。

4. 在对话中即可使用 `generate_screen_from_text`、`edit_screens` 等工具。

## API Key 获取

Stitch 设置页 → 生成 API Key。文档：<https://stitch.withgoogle.com/docs/mcp/setup>

## 安全提示

- 切勿将 API Key 提交到 Git（`.env`、`.cursor/mcp.json` 已加入 `.gitignore`）
- 若 Key 曾在聊天中暴露，建议在 Stitch 控制台轮换
