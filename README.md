# Crogo — CRO文档智能平台

医药CRO文档工作台。核心链路：PDF上传 → 知识库查询 → 模板匹配 → 一键生成。

## 技术栈

- 纯前端单页应用 (Vanilla JS)
- 无外部依赖
- 设计参考：Google Stitch

## 页面

| 路由 | 页面 | 功能 |
|------|------|------|
| `/login` | 登录 | 邮箱密码登录 |
| `/dashboard` | 工作台 | 数据概览 + 上传区 + 最近项目 |
| `/templates` | 模板库 | 模板管理 |
| `/knowledge` | 知识库 | RAG知识管理 |
| `/projects` | 项目 | 项目列表 |
| `/settings` | 设置 | 系统配置 |

## 开发

```
直接打开 index.html 即可运行
```
