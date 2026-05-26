# Crogo 架构设计 — 四层文档生成引擎

> 版本 v1.0 · 架构决策记录 · 2024-12

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CROGO 架构总览                                │
└─────────────────────────────────────────────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
   ┌─────────────┐          ┌──────────────┐          ┌──────────────┐
   │  Template   │          │  Knowledge   │          │   Feedback   │
   │  Engine     │          │  Engine      │          │   Engine     │
   └──────┬──────┘          └──────┬───────┘          └──────┬───────┘
          │                        │                         │
          └──────────┬─────────────┘                         │
                     ▼                                       │
              ┌──────────────┐                                │
              │   Mapping   │  ←── 核心创新层 ←──────────────┘
              │   Engine    │
              └──────┬──────┘
                     ▼
              ┌──────────────┐
              │ Generation  │
              │  Engine     │
              └──────┬──────┘
                     ▼
              ┌──────────────┐
              │   Quality    │
              │    Check     │
              └──────────────┘
```

---

## 一、Template Engine（模板引擎）

**职责：** .docx → 结构化模板 Schema

### 核心数据结构

```typescript
interface TemplateSchema {
  id: string;
  name: string;
  type: 'DMC' | 'DMP' | 'SAP' | 'CSR' | 'ICF';
  version: string;
  chapters: Chapter[];
  placeholderIndex: Map<string, PlaceholderDef>;
  metadata: {
    totalSections: number;
    totalPlaceholders: number;
    totalTables: number;
    templateSize: number;
    parsedAt: string;
  };
}

interface Chapter {
  id: string;           // 'ch-1'
  number: string;       // '1'
  title: string;        // '引言'
  level: 1 | 2 | 3;    // 章节层级
  sections: Section[];
  placeholders: PlaceholderDef[];
}

interface Section {
  id: string;
  number: string;       // '1.1'
  title: string;
  level: number;
  content: string;      // 原始文本
  placeholders: PlaceholderDef[];
  tables?: TableDef[];
  subsections?: Section[];
}

interface PlaceholderDef {
  id: string;           // 'ph-001'
  raw: string;          // '<项目名称>' / 'XXXXXX公司'
  type: 'exact' | 'fuzzy' | 'free_text';
  category: 'sponsor' | 'protocol' | 'design' | 'endpoint' | 'timeline' | 'general';
  context: string;      // 周围文本片段，用于消歧
  expectedType: 'string' | 'number' | 'date';
  confidence: number;
  resolvedBy: 'knowledge' | 'ai' | 'rule' | null;
}

interface TableDef {
  id: string;
  caption: string;
  rows: number;
  cols: number;
  mergedCells: boolean;
  headers: string[];
  cellsPlaceholderCount: number;
}
```

### 解析流程

```
.docx 文件
   │
   ▼
[1. 章节检测]  ← 正则匹配 "第X章" "X." "X.X." 格式
   │
   ▼
[2. 树形构建]  ← 章节编号 → 父子关系 → 树形结构
   │
   ▼
[3. 占位符扫描]  ← 四类模式：
   • <XXX>     → exact（精确必填）
   • XXXX      → fuzzy（模糊替换）
   • [请填写]  → free_text（自由文本）
   • {AI:xxx}  → ai_generated（AI生成）
   │
   ▼
[4. 表格解析]  ← 提取行列结构、合并单元格、占位符位置
   │
   ▼
[5. Schema 输出]  ← JSON 格式，存入模板库索引
```

### 关键算法：占位符消歧

同一字符串在不同章节可能有不同含义：

```python
# 示例：模板中有两个 <项目名称>
# - 章节 1.0（封面）→ 取方案全称
# - 章节 5.0（统计方法）→ 取方案缩写
# 
# 消歧策略：按上下文 + 章节位置 + 邻接文本 联合判定
def disambiguate(placeholder, chapter, neighbor_text):
    context_signals = {
        '封面': 'full_name',
        '标题页': 'full_name',
        '统计': 'abbreviation',
        '编号': 'protocol_id',
    }
    for keyword, intent in context_signals.items():
        if keyword in chapter.title or keyword in neighbor_text:
            return intent
    return 'default'
```

---

## 二、Knowledge Engine（知识引擎）

**职责：** PDF → 结构化知识 + 语义检索

### 核心数据结构

```typescript
interface KnowledgeEntry {
  id: string;
  type: 'protocol_info' | 'treatment_regimen' | 'endpoint_def' 
      | 'safety_monitoring' | 'statistical_method' | 'inclusion_criterion'
      | 'exclusion_criterion' | 'study_design' | 'timeline';
  source: {
    projectId: string;
    fileName: string;
    protocolVersion: string;
    sponsor: string;
    diseaseArea: string;
  };
  content: {
    raw: string;          // 原文
    structured: Record<string, string>;  // 结构化字段
    summary: string;      // AI 摘要
  };
  embedding: number[];    // 向量（chromadb 自动管理）
  confidence: number;     // 入库时 0-1
  confirmed: boolean;     // 用户确认为 true
  confirmedAt?: string;
  usageCount: number;     // 被引用次数
  lastUsedAt?: string;
}

interface KnowledgeQuery {
  text: string;
  chapter?: string;
  templateType?: string;
  diseaseArea?: string;
  topK: number;
  minConfidence: number;
}

interface QueryResult {
  entries: KnowledgeEntry[];
  scores: number[];         // 相似度 0-1
  aggregation: {            // 聚合结果
    direct: string | null;  // 精确匹配
    semantic: string;       // 语义匹配加权
    fallback: string | null;// AI 推理结果
  };
  confidence: number;       // 综合置信度
}
```

### 三级检索策略

```
用户查询 "非小细胞肺癌二线治疗OS终点"
        │
        ▼
[Level 1: 精确匹配]  ← 关键词完全命中知识条目
        │ 成功 → 返回，置信度 0.95+
        │ 失败
        ▼
[Level 2: 语义检索]  ← embedding 相似度搜索 (chromadb)
        │ 成功 → 返回 TOP-3，置信度 0.7-0.95
        │ 失败
        ▼
[Level 3: AI 推理]   ← LLM 从方案PDF原文推理
                     → 返回结果，置信度 0.4-0.7
                     → 标记为"AI推测，请确认"
```

### 知识库生长模型

```
种子阶段（Day 1）
  └─ 用户批量导入 50 个历史项目 PDF
  └─ 自动提取 + AI 梳理 → 初始知识库
  └─ 用户确认关键条目 → 置信度提升

成熟阶段（Day 90+）
  └─ 200+ 项目，每个新方案匹配率 ≥ 85%
  └─ 每生成一份文档，AI 提炼 2-5 条新知识
  └─ 用户确认后入库，形成数据飞轮
```

---

## 三、Mapping Engine（映射引擎）★ 核心

**职责：** 连接 Template Schema 和 Knowledge Engine — 决定"哪个占位符填什么"

### 核心数据结构

```typescript
interface MappingRule {
  id: string;
  placeholderKey: string;     // '<项目名称>'
  knowledgeSource: string;    // 'protocol_info.project_name'
  templateType: 'DMC' | 'DMP' | 'SAP';
  templateVersion: string;
  chapterNumber?: string;     // 限定特定章节
  confidence: number;         // 学习成熟度
  strategy: 'direct' | 'semantic' | 'ai_fallback';
  history: CorrectionEvent[]; // 修正历史
  learnedAt: string;
}

interface CorrectionEvent {
  timestamp: string;
  oldValue: string;
  newValue: string;
  userId: string;
  confirmed: boolean;
}

interface ResolvedMapping {
  placeholderId: string;
  placeholderRaw: string;
  chapter: string;
  source: 'knowledge' | 'ai' | 'rule' | 'empty';
  sourceId?: string;
  value: string;
  confidence: number;
  requiresReview: boolean;
}
```

### 四层解析策略

```
Template Placeholder "<项目名称>"
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  Strategy 1: Direct Mapping（精确映射）               │
│  条件: mapping_rules 表中有直接对应规则               │
│  置信度: 0.95+                                      │
│  示例: "<项目名称>" → protocol.projectName            │
├─────────────────────────────────────────────────────┤
│  Strategy 2: Semantic Mapping（语义映射）              │
│  条件: 无直接规则，但知识库有相似条目                   │
│  置信度: 0.7-0.95                                    │
│  示例: "主要终点定义" → 语义检索 "OS endpoint"         │
├─────────────────────────────────────────────────────┤
│  Strategy 3: Rule Inference（规则推理）                │
│  条件: 从用户修正历史中学习到模式                       │
│  置信度: 0.5-0.8                                     │
│  示例: "XX例" → 从方案PDF提取"样本量" → "240例"       │
├─────────────────────────────────────────────────────┤
│  Strategy 4: AI Inference（AI 推理）                  │
│  条件: 以上均不可用                                   │
│  置信度: 0.3-0.6                                     │
│  示例: "[请在此处填写分析人群]" → AI 从PDF推理         │
│  标记: 需人工确认                                     │
└─────────────────────────────────────────────────────┘
```

### 自学习流程

```
用户修正填充值
        │
        ▼
[1. 记录修正]  →  {placeholder, chapter, oldValue, newValue}
        │
        ▼
[2. 分析模式]  →  是否同一 placeholder 被多次修正？
        │
        ├─ 是 → 更新 MappingRule（置信度提升）
        │     确认次数 ≥ 3 → 自动提升策略等级
        │
        └─ 否 → 作为单次修正记录，不改变规则
        │
        ▼
[3. 规则强化]  →  mapping_rules 表更新
        │
        ▼
[4. 下次生成]  → 使用更新后的规则，准确率提升
```

---

## 四、Generation Engine（生成引擎）

**职责：** Template Schema + Resolved Mappings → 最终 docx + 质量报告

### 核心流程

```
输入:
  • TemplateSchema（模板结构）
  • ResolvedMapping[]（映射结果）
  • KnowledgeContext（知识上下文）
        │
        ▼
┌─────────────────────────────────────────────┐
│  Phase 1: 基础填充                            │
│  • 遍历所有 paragraph，替换精确+模糊占位符     │
│  • 处理跨 run 替换                            │
│  • 表格单元格替换                             │
│  • 页眉页脚替换                               │
├─────────────────────────────────────────────┤
│  Phase 2: AI 辅助填充                         │
│  • 对 free_text 占位符调用 LLM 生成          │
│  • 上下文注入：前后段落 + 方案PDF原文          │
│  • 生成后标注"AI 生成"                        │
├─────────────────────────────────────────────┤
│  Phase 3: 格式后处理                          │
│  • 标题对齐 LEFT（修复 JUSTIFY 问题）          │
│  • 字体统一（中文宋体/英文字体）               │
│  • 字号规范                                   │
│  • 行距统一                                   │
├─────────────────────────────────────────────┤
│  Phase 4: 质量检查                            │
│  • 残留占位符扫描                             │
│  • 空段落检测                                 │
│  • 跨文档一致性校验                           │
│  • 生成质检报告                               │
└─────────────────────────────────────────────┘
        │
        ▼
输出:
  • 填充完成的 .docx
  • 质检报告 JSON
  • 需确认条目列表
```

### 质检报告格式

```json
{
  "overall": {
    "grade": "A",
    "fillRate": 0.87,
    "totalPlaceholders": 78,
    "filled": 68,
    "aiGenerated": 5,
    "requiresReview": 5
  },
  "issues": [
    {
      "severity": "high",
      "chapter": "5.3",
      "type": "unfilled_placeholder",
      "content": "<期中分析时间点>",
      "suggestion": "从方案 PDF 安全性评估章节提取"
    }
  ],
  "formatChecks": {
    "alignmentOK": true,
    "fontOK": true,
    "spacingOK": false,
    "details": ["章节 3 行距不一致：部分段落 20pt，部分 18pt"]
  }
}
```

---

## 五、数据流总图

```
                       用户操作层
    ┌─────────────────────────────────────────────────────┐
    │  上传.docx   上传PDF   确认映射   修正值   下载成品   │
    └──────┬──────────┬──────────┬─────────┬──────────────┘
           │          │          │         │
           ▼          ▼          ▼         ▼
    ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────────┐
    │Template  │ │Knowledge │ │Feedback│ │   Generator   │
    │ Parser   │ │Extractor │ │Learner │ │   + Checker   │
    └────┬─────┘ └────┬─────┘ └───┬────┘ └──────┬───────┘
         │            │           │             │
         ▼            ▼           ▼             ▼
    ┌─────────────────────────────────────────────────────┐
    │                   存储层                              │
    │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
    │  │Template  │  │Knowledge │  │  Mapping         │  │
    │  │ Index    │  │  Store   │  │  Rules           │  │
    │  │(模板库)   │  │(向量库)  │  │  (规则引擎)      │  │
    │  └──────────┘  └──────────┘  └──────────────────┘  │
    │                           ┌──────────────────┐       │
    │                           │  Project State   │       │
    │                           │  (项目状态)      │       │
    │                           └──────────────────┘       │
    └─────────────────────────────────────────────────────┘
```

---

## 六、与前端集成方案

### API 端点设计

```yaml
/api/v1/templates:
  POST   /upload      # 上传 .docx → 解析 → TemplateSchema
  GET    /list        # 模板列表
  GET    /:id/schema  # 获取模板结构（章节树+占位符列表）

/api/v1/knowledge:
  POST   /batch-upload  # 批量导入 PDF → 提取 → 入库
  GET    /search        # 语义搜索知识库
  POST   /entries       # 确认/修正知识条目
  GET    /stats         # 知识库统计

/api/v1/projects:
  POST   /             # 创建项目（选模板+上传方案）
  GET    /:id/mappings # 获取映射预览（填写/未填/需确认）
  PUT    /:id/mappings # 用户修正映射
  POST   /:id/generate # 执行生成
  GET    /:id/report   # 获取质检报告
  GET    /:id/download # 下载生成的 docx

/api/v1/rules:
  GET    /             # 已学习的映射规则
  GET    /:id/history  # 某规则的修正历史
```

### 前端状态机

```
IDLE → UPLOADING → PARSING → MAPPING_REVIEW → GENERATING → QUALITY_CHECK → COMPLETE
                                                                                  │
                                                                    用户不满意 ───┤
        修正映射 ─────────────────────────────────────────────────────────────────┘
```

---

## 七、技术选型决策

| 组件 | 选择 | 理由 |
|------|------|------|
| 模板解析 | python-docx | 已验证稳定，支持段落/表格/样式操作 |
| PDF 提取 | pymupdf | 比 pypdf 快 10x，支持书签导航 |
| 向量数据库 | chromadb | 轻量无服务器，适合本地部署 |
| 后端框架 | FastAPI | 异步支持，自动 OpenAPI 文档 |
| 前端 | Vanilla JS | 无框架依赖，医药行业兼容性要求 |
| AI 接口 | Ollama API | 本地运行，数据不出域 |
| 文档质检 | 自定义规则引擎 | 针对医药文档的特殊格式需求 |

---

## 八、关键决策记录 (ADR)

### ADR-001: Mapping Engine 独立于 Template Engine

**决策：** Mapping 规则不嵌入 Template Schema，而是独立存储。

**理由：** 同一模板在不同项目中可能有不同映射规则（如恒瑞 vs 信达的 <项目名称> 字段位置不同）。解耦后支持模板+客户的交叉映射。

### ADR-002: 三级检索 + AI 兜底

**决策：** 知识库查询走精确→语义→AI 三级，每级降低一层置信度。

**理由：** 医药文档不允许"看起来差不多"——必须知道每个填充值的来源可靠性。三级机制让用户能区分"来自历史项目的可靠值"和"AI 猜的"。

### ADR-003: 修正即学习

**决策：** 用户的每一次修正都记录为正例，同一个 placeholder 被修正 ≥3 次后自动更新映射规则。

**理由：** 医药文档的映射规则高度碎片化（每个申办方的模板风格不同）。手动维护规则是不现实的，必须让系统从人工修正中学习。

### ADR-004: 生成后质检是必需环节

**决策：** 每份文档生成后必须经过自动化质检（残留占位符、格式、一致性）才能交付。

**理由：** DMC Charter 生成经验表明，<姓名> 残留、JUSTIFY 对齐、空段落等问题频繁出现。自动质检是保证 S 级交付的最后防线。
