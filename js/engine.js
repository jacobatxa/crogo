/* ═══════════════════════════════════════════════════════
   Crogo Engine — 四层文档生成引擎核心
   数据模型 + 映射引擎 + 生成管线
   ═══════════════════════════════════════════════════════ */

const CrogoEngine = (() => {

  /* ──── 1. 数据模型 ──── */

  /**
   * 模板 Schema — .docx 解析后的结构化表示
   */
  class TemplateSchema {
    constructor(raw = {}) {
      this.id = raw.id || crypto.randomUUID?.() || Date.now().toString(36);
      this.name = raw.name || '';
      this.type = raw.type || 'DMC'; // DMC | DMP | SAP | CSR | ICF
      this.version = raw.version || '1.0';
      this.chapters = raw.chapters || [];       // Chapter[]
      this.placeholderIndex = raw.placeholderIndex || {}; // key -> PlaceholderDef
      this.tableDefs = raw.tableDefs || [];     // TableDef[]
      this.metadata = {
        totalSections: 0,
        totalPlaceholders: 0,
        totalTables: 0,
        ...raw.metadata
      };
      this.parsedAt = raw.parsedAt || new Date().toISOString();
    }

    /** 按章节号查找 */
    findChapter(number) {
      return this.chapters.find(c => c.number === number);
    }

    /** 按章节标题模糊搜索 */
    searchChapters(keyword) {
      return this.chapters.filter(c =>
        c.title.includes(keyword) ||
        (c.sections || []).some(s => s.title.includes(keyword))
      );
    }

    /** 获取所有未映射占位符 */
    getUnmappedPlaceholders() {
      return Object.values(this.placeholderIndex)
        .filter(p => !p.resolvedBy);
    }

    /** 填充率统计 */
    getFillStats() {
      const all = Object.values(this.placeholderIndex);
      const filled = all.filter(p => p.resolvedBy);
      const aiGen = all.filter(p => p.resolvedBy === 'ai');
      const needsReview = all.filter(p => p.resolvedBy === 'ai' || !p.resolvedBy);
      return {
        total: all.length,
        filled: filled.length,
        fillRate: all.length ? (filled.length / all.length) : 0,
        aiGenerated: aiGen.length,
        requiresReview: needsReview.length
      };
    }
  }

  /**
   * 章节/段落定义
   */
  class Chapter {
    constructor(raw = {}) {
      this.id = raw.id || '';
      this.number = raw.number || '';
      this.title = raw.title || '';
      this.level = raw.level || 1;
      this.sections = raw.sections || [];       // Section[]
      this.placeholders = raw.placeholders || []; // PlaceholderDef[]
    }
  }

  class Section {
    constructor(raw = {}) {
      this.id = raw.id || '';
      this.number = raw.number || '';
      this.title = raw.title || '';
      this.level = raw.level || 2;
      this.content = raw.content || '';
      this.placeholders = raw.placeholders || [];
      this.tables = raw.tables || [];
      this.subsections = raw.subsections || [];
    }
  }

  /**
   * 占位符定义
   */
  class PlaceholderDef {
    constructor(raw = {}) {
      this.id = raw.id || '';
      this.raw = raw.raw || '';           // '<项目名称>' / 'XXXX'
      this.type = raw.type || 'exact';     // exact | fuzzy | free_text | ai_generated
      this.category = raw.category || 'general';
      this.context = raw.context || '';
      this.confidence = raw.confidence || 0;
      this.resolvedBy = raw.resolvedBy || null; // knowledge | ai | rule | null
      this.mappedValue = raw.mappedValue || null;
    }
  }

  /**
   * 表格定义
   */
  class TableDef {
    constructor(raw = {}) {
      this.id = raw.id || '';
      this.caption = raw.caption || '';
      this.rows = raw.rows || 0;
      this.cols = raw.cols || 0;
      this.mergedCells = raw.mergedCells || false;
      this.headers = raw.headers || [];
      this.placeholderCount = raw.placeholderCount || 0;
    }
  }

  /* ──── 知识模型 ──── */

  /**
   * 知识条目
   */
  class KnowledgeEntry {
    constructor(raw = {}) {
      this.id = raw.id || '';
      this.type = raw.type || 'protocol_info';
      this.source = {
        projectId: raw.source?.projectId || '',
        fileName: raw.source?.fileName || '',
        protocolVersion: raw.source?.protocolVersion || '',
        sponsor: raw.source?.sponsor || '',
        diseaseArea: raw.source?.diseaseArea || '',
      };
      this.content = {
        raw: raw.content?.raw || '',
        structured: raw.content?.structured || {},
        summary: raw.content?.summary || '',
      };
      this.confidence = raw.confidence || 0;
      this.confirmed = raw.confirmed || false;
      this.confirmedAt = raw.confirmedAt || null;
      this.usageCount = raw.usageCount || 0;
      this.lastUsedAt = raw.lastUsedAt || null;
    }

    displayText() {
      return this.content.summary || this.content.raw;
    }
  }

  /* ──── 映射模型 ──── */

  /**
   * 映射规则 — 连接占位符 → 知识源
   */
  class MappingRule {
    constructor(raw = {}) {
      this.id = raw.id || '';
      this.placeholderKey = raw.placeholderKey || '';
      this.knowledgeSource = raw.knowledgeSource || '';
      this.templateType = raw.templateType || '';
      this.templateVersion = raw.templateVersion || '';
      this.chapterNumber = raw.chapterNumber || null;
      this.confidence = raw.confidence || 0.5;
      this.strategy = raw.strategy || 'direct'; // direct | semantic | ai_fallback
      this.history = raw.history || [];          // CorrectionEvent[]
      this.learnedAt = raw.learnedAt || new Date().toISOString();
      this.confirmedCount = raw.confirmedCount || 0;
    }

    /** 记录用户修正 */
    recordCorrection(oldValue, newValue, userId) {
      this.history.push({
        timestamp: new Date().toISOString(),
        oldValue,
        newValue,
        userId,
        confirmed: true
      });
      this.confirmedCount++;
      // 修正 ≥3 次 → 自动提升置信度
      if (this.confirmedCount >= 3) {
        this.confidence = Math.min(1, this.confidence + 0.2);
      }
    }
  }

  /**
   * 解析后的映射结果
   */
  class ResolvedMapping {
    constructor(raw = {}) {
      this.placeholderId = raw.placeholderId || '';
      this.placeholderRaw = raw.placeholderRaw || '';
      this.chapter = raw.chapter || '';
      this.source = raw.source || 'empty'; // knowledge | ai | rule | empty
      this.sourceId = raw.sourceId || null;
      this.value = raw.value || '';
      this.confidence = raw.confidence || 0;
      this.requiresReview = raw.requiresReview ?? true;
    }
  }

  /* ──── 质检报告 ──── */

  class QualityReport {
    constructor() {
      this.overall = { grade: 'F', fillRate: 0, totalPlaceholders: 0, filled: 0, aiGenerated: 0, requiresReview: 0 };
      this.issues = [];     // { severity, chapter, type, content, suggestion }
      this.formatChecks = { alignmentOK: true, fontOK: true, spacingOK: true, details: [] };
    }

    /** 计算等级 */
    computeGrade() {
      const f = this.overall;
      if (f.fillRate >= 0.95 && f.requiresReview === 0) f.grade = 'S';
      else if (f.fillRate >= 0.80 && f.requiresReview <= 10) f.grade = 'A';
      else if (f.fillRate >= 0.60) f.grade = 'B';
      else f.grade = 'C';
    }

    addIssue(severity, chapter, type, content, suggestion) {
      this.issues.push({ severity, chapter, type, content, suggestion });
      this.overall.requiresReview = this.issues.length;
    }
  }

  /* ──── 2. 映射引擎（核心） ──── */

  class MappingEngine {
    constructor() {
      this.rules = [];        // MappingRule[]
      this.history = [];      // 所有修正事件
    }

    /** 加载已有规则 */
    loadRules(rules) {
      this.rules = rules.map(r => new MappingRule(r));
    }

    /** 解析模板的所有占位符 → 映射结果 */
    async resolve(schema, knowledgeContext) {
      const results = [];
      const allPlaceholders = Object.values(schema.placeholderIndex);

      for (const ph of allPlaceholders) {
        const result = await this._resolveOne(ph, schema, knowledgeContext);
        results.push(result);
      }
      return results;
    }

    /** 单占位符四层解析 */
    async _resolveOne(placeholder, schema, knowledgeContext) {
      const result = new ResolvedMapping({
        placeholderId: placeholder.id,
        placeholderRaw: placeholder.raw,
        chapter: this._findChapterByPlaceholder(placeholder.id, schema),
      });

      // Strategy 1: 精确映射
      const directRule = this._findDirectRule(placeholder, schema.type);
      if (directRule) {
        const value = this._extractFromContext(directRule.knowledgeSource, knowledgeContext);
        if (value) {
          result.value = value;
          result.source = 'knowledge';
          result.sourceId = directRule.id;
          result.confidence = directRule.confidence;
          result.requiresReview = directRule.confidence < 0.8;
          return result;
        }
      }

      // Strategy 2: 语义映射（模拟）
      const semanticMatch = this._semanticMatch(placeholder, knowledgeContext);
      if (semanticMatch) {
        result.value = semanticMatch.value;
        result.source = 'knowledge';
        result.sourceId = semanticMatch.entryId;
        result.confidence = 0.75;
        result.requiresReview = true;
        return result;
      }

      // Strategy 3: 规则推理（基于修正历史）
      const inferred = this._inferFromHistory(placeholder, knowledgeContext);
      if (inferred) {
        result.value = inferred;
        result.source = 'rule';
        result.confidence = 0.6;
        result.requiresReview = true;
        return result;
      }

      // Strategy 4: AI 推理（兜底）
      const aiValue = this._aiInfer(placeholder, schema, knowledgeContext);
      if (aiValue) {
        result.value = aiValue;
        result.source = 'ai';
        result.confidence = 0.4;
        result.requiresReview = true;
        return result;
      }

      // 全部失败
      result.value = placeholder.raw; // 保留原始占位符
      result.source = 'empty';
      result.confidence = 0;
      result.requiresReview = true;
      return result;
    }

    /** 精确规则匹配 */
    _findDirectRule(placeholder, templateType) {
      return this.rules.find(r =>
        r.placeholderKey === placeholder.raw &&
        r.templateType === templateType &&
        (r.chapterNumber === null || r.chapterNumber === this._currentChapter)
      );
    }

    /** 从知识上下文提取值 */
    _extractFromContext(sourceKey, context) {
      if (!context || !context.fieldValues) return null;
      // sourceKey 格式如 "protocol_info.project_name"
      const parts = sourceKey.split('.');
      let obj = context.fieldValues;
      for (const part of parts) {
        if (obj && typeof obj === 'object') obj = obj[part];
        else return null;
      }
      return obj || null;
    }

    /** 语义匹配（模拟 — 实际调用 chromadb） */
    _semanticMatch(placeholder, context) {
      // 模拟：匹配 placeholder 名称和上下文
      if (!context || !context.knowledgeEntries) return null;
      const key = placeholder.raw.replace(/[<>\[\]{}]/g, '').trim();
      for (const entry of context.knowledgeEntries) {
        if (entry.content.summary.includes(key) ||
            entry.content.raw.includes(key) ||
            entry.type.includes(key)) {
          return { value: entry.displayText(), entryId: entry.id };
        }
      }
      return null;
    }

    /** 从修正历史推理 */
    _inferFromHistory(placeholder, context) {
      const relevant = this.history.filter(h =>
        h.placeholderKey === placeholder.raw &&
        h.newValue !== h.oldValue
      );
      if (relevant.length >= 3) {
        // 取最新修正值
        return relevant[relevant.length - 1].newValue;
      }
      return null;
    }

    /** AI 推理兜底（模拟 LLM 调用） */
    _aiInfer(placeholder, schema, context) {
      const templates = {
        '<项目名称>': '临床研究项目',
        '<方案编号>': 'PROTO-2024-001',
        '<申办方>': '申办方名称',
        '<样本量>': 'N/A（待确认）',
        '<主要终点>': '主要终点定义（待从方案提取）',
      };
      return templates[placeholder.raw] || null;
    }

    _findChapterByPlaceholder(placeholderId, schema) {
      for (const ch of schema.chapters) {
        if (ch.placeholders?.some(p => p.id === placeholderId)) return ch.number;
        for (const sec of (ch.sections || [])) {
          if (sec.placeholders?.some(p => p.id === placeholderId)) return sec.number;
        }
      }
      return '';
    }

    /** 用户修正 → 学习新规则 */
    learnFromCorrection(placeholderRaw, templateType, knowledgeSource, oldValue, newValue, userId) {
      let rule = this.rules.find(r =>
        r.placeholderKey === placeholderRaw &&
        r.templateType === templateType
      );
      if (!rule) {
        rule = new MappingRule({
          id: `rule-${Date.now()}`,
          placeholderKey: placeholderRaw,
          knowledgeSource,
          templateType,
          strategy: oldValue ? 'rule' : 'direct',
        });
        this.rules.push(rule);
      }

      rule.recordCorrection(oldValue, newValue, userId);
      this.history.push({
        placeholderKey: placeholderRaw,
        templateType,
        oldValue,
        newValue,
        userId,
        timestamp: new Date().toISOString()
      });

      return rule;
    }
  }

  /* ──── 3. 生成引擎 ──── */

  class GenerationEngine {
    constructor() {
      this.mappings = [];
    }

    /** 执行完整生成管线 */
    async generate(templateSchema, resolvedMappings, knowledgeContext) {
      this.mappings = resolvedMappings;
      const report = new QualityReport();

      // Phase 1: 基础填充
      const filled = this._phase1BasicFill(templateSchema, resolvedMappings);
      report.overall.filled = filled;

      // Phase 2: AI 辅助填充
      const aiCount = this._phase2AIFill(templateSchema, resolvedMappings, knowledgeContext);
      report.overall.aiGenerated = aiCount;

      // Phase 3: 格式后处理
      this._phase3PostProcess(templateSchema);

      // Phase 4: 质量检查
      this._phase4QualityCheck(templateSchema, report);

      report.overall.totalPlaceholders = Object.keys(templateSchema.placeholderIndex).length;
      report.overall.fillRate = report.overall.totalPlaceholders > 0
        ? report.overall.filled / report.overall.totalPlaceholders
        : 0;
      report.computeGrade();

      return report;
    }

    _phase1BasicFill(schema, mappings) {
      let count = 0;
      for (const m of mappings) {
        if (m.source === 'knowledge' && m.value) {
          count++;
          const ph = schema.placeholderIndex[m.placeholderId];
          if (ph) {
            ph.mappedValue = m.value;
            ph.resolvedBy = m.source;
            ph.confidence = m.confidence;
          }
        }
      }
      return count;
    }

    _phase2AIFill(schema, mappings, context) {
      let count = 0;
      for (const m of mappings) {
        if (m.source === 'ai' && m.value && m.value !== m.placeholderRaw) {
          count++;
          const ph = schema.placeholderIndex[m.placeholderId];
          if (ph) {
            ph.mappedValue = m.value;
            ph.resolvedBy = 'ai';
            ph.confidence = 0.4;
          }
        }
      }
      return count;
    }

    _phase3PostProcess(schema) {
      // 标题对齐修复 (JUSTIFY → LEFT)
      // 字体统一
      // 行距设置
      // 实际 docx 操作由后端 python-docx 执行
    }

    _phase4QualityCheck(schema, report) {
      const allPhs = Object.values(schema.placeholderIndex);

      // 检查残留占位符
      for (const ph of allPhs) {
        if (!ph.mappedValue || ph.mappedValue === ph.raw) {
          report.addIssue(
            'high',
            this._findChapterFor(schema, ph.id),
            'unfilled_placeholder',
            ph.raw,
            `从方案 PDF 对应章节提取`
          );
        }
      }

      // 检查 AI 生成项
      const aiItems = allPhs.filter(p => p.resolvedBy === 'ai');
      if (aiItems.length > 0) {
        report.formatChecks.spacingOK = false;
        report.formatChecks.details.push(
          `AI 生成 ${aiItems.length} 项，需人工确认`
        );
      }
    }

    _findChapterFor(schema, placeholderId) {
      for (const ch of schema.chapters) {
        if (ch.placeholders?.some(p => p.id === placeholderId)) return ch.number;
        for (const sec of (ch.sections || [])) {
          if (sec.placeholders?.some(p => p.id === placeholderId)) return sec.number;
          for (const sub of (sec.subsections || [])) {
            if (sub.placeholders?.some(p => p.id === placeholderId)) return sub.number;
          }
        }
      }
      return 'unknown';
    }
  }

  /* ──── 4. 模板解析器（前端模拟） ──── */

  class TemplateParser {
    /** 模拟解析 .docx → TemplateSchema */
    parse(templateName, templateType, docxContent) {
      const schema = new TemplateSchema({
        name: templateName,
        type: templateType,
        version: '1.0',
      });

      // 模拟典型医药模板的章节结构
      const templateStructure = this._getTemplateStructure(templateType);
      let phCounter = 0;

      for (const chRaw of templateStructure) {
        const chapter = new Chapter({
          id: `ch-${chRaw.number}`,
          number: chRaw.number,
          title: chRaw.title,
          level: 1,
        });

        for (const secRaw of (chRaw.sections || [])) {
          const section = new Section({
            id: `sec-${chRaw.number}.${secRaw.number}`,
            number: `${chRaw.number}.${secRaw.number}`,
            title: secRaw.title,
            level: 2,
            content: secRaw.content || '',
          });

          for (const phRaw of (secRaw.placeholders || [])) {
            phCounter++;
            const ph = new PlaceholderDef({
              id: `ph-${String(phCounter).padStart(3, '0')}`,
              raw: phRaw.raw,
              type: phRaw.type || 'exact',
              category: phRaw.category || 'general',
              context: phRaw.context || section.content.slice(0, 60),
            });
            section.placeholders.push(ph);
            chapter.placeholders.push(ph);
            schema.placeholderIndex[ph.id] = ph;
          }

          chapter.sections.push(section);
        }

        schema.chapters.push(chapter);
      }

      schema.metadata = {
        totalSections: schema.chapters.reduce((a, c) => a + c.sections.length, 0),
        totalPlaceholders: Object.keys(schema.placeholderIndex).length,
        totalTables: 0,
      };

      return schema;
    }

    /** 各模板类型的标准章节结构 */
    _getTemplateStructure(type) {
      const structures = {
        DMC: [
          { number: '1', title: '引言', sections: [
            { number: '1', title: '目的', placeholders: [{raw: '<项目名称>', category: 'protocol'}] },
            { number: '2', title: '背景', content: '本研究为...', placeholders: [{raw: '<研究类型>', category: 'design'}] }
          ]},
          { number: '2', title: 'DMC 职责', sections: [
            { number: '1', title: '职责范围' },
            { number: '2', title: '权限' }
          ]},
          { number: '3', title: 'DMC 组成', sections: [
            { number: '1', title: '成员资格', placeholders: [{raw: '<申办方>', category: 'sponsor'}] },
            { number: '2', title: '任命程序' }
          ]},
          { number: '4', title: '会议流程', sections: [
            { number: '1', title: '首次会议' },
            { number: '2', title: '常规会议', content: '会议频率为每XX个月一次', placeholders: [{raw: '<期中分析时间点>', category: 'timeline'}] },
            { number: '3', title: '紧急会议' }
          ]},
          { number: '5', title: '数据审查', sections: [
            { number: '1', title: '安全性数据', content: '包括不良事件、严重不良事件、实验室检查等',
              placeholders: [{raw: '<主要终点>', category: 'endpoint'}, {raw: '<安全性指标>', category: 'endpoint'}] },
            { number: '2', title: '有效性数据' }
          ]},
          { number: '6', title: '保密协议' },
        ],
        DMP: [
          { number: '1', title: '引言', sections: [
            { number: '1', title: '研究概述', placeholders: [{raw: '<项目名称>', category: 'protocol'}] },
            { number: '2', title: '数据管理时间表' }
          ]},
          { number: '2', title: '数据采集与录入', sections: [
            { number: '1', title: 'CRF 设计' },
            { number: '2', title: '数据录入', content: '采用双份录入...', placeholders: [{raw: '<样本量>', category: 'design'}] }
          ]},
          { number: '3', title: '数据编码', sections: [
            { number: '1', title: 'MedDRA 编码' },
            { number: '2', title: 'WHO Drug 编码' }
          ]},
          { number: '4', title: '数据核查', sections: [
            { number: '1', title: '逻辑核查' },
            { number: '2', title: '质疑管理' }
          ]},
        ],
        SAP: [
          { number: '1', title: '引言', sections: [
            { number: '1', title: '研究概述', placeholders: [{raw: '<项目名称>', category: 'protocol'}] },
            { number: '2', title: '研究设计', placeholders: [{raw: '<研究类型>', category: 'design'}] }
          ]},
          { number: '2', title: '样本量估计', sections: [
            { number: '1', title: '假设', content: '基于XX文献...', placeholders: [{raw: '<样本量>', category: 'design'}] },
            { number: '2', title: '计算方法', content: '使用 PASS 软件...' }
          ]},
          { number: '3', title: '统计分析', sections: [
            { number: '1', title: '主要分析', content: '主要终点为...', placeholders: [{raw: '<主要终点>', category: 'endpoint'}] },
            { number: '2', title: '次要分析', placeholders: [{raw: '<次要终点>', category: 'endpoint'}] },
            { number: '3', title: '安全性分析', placeholders: [{raw: '<安全性指标>', category: 'endpoint'}] }
          ]},
        ],
      };

      return structures[type] || structures.DMC;
    }
  }

  /* ──── 公开 API ──── */

  return {
    // 数据模型
    TemplateSchema,
    Chapter,
    Section,
    PlaceholderDef,
    TableDef,
    KnowledgeEntry,
    MappingRule,
    ResolvedMapping,
    QualityReport,

    // 引擎
    TemplateParser,
    MappingEngine,
    GenerationEngine,

    // 工厂方法
    createEngine() {
      return {
        parser: new TemplateParser(),
        mapper: new MappingEngine(),
        generator: new GenerationEngine(),
      };
    },

    /** 完整管线：解析 → 映射 → 生成 */
    async runPipeline(templateName, templateType, knowledgeContext, existingRules) {
      const engine = this.createEngine();

      // Step 1: 解析模板
      const schema = engine.parser.parse(templateName, templateType);

      // Step 2: 加载已有规则
      if (existingRules) engine.mapper.loadRules(existingRules);

      // Step 3: 映射解析
      const mappings = await engine.mapper.resolve(schema, knowledgeContext);

      // Step 4: 生成 + 质检
      const report = await engine.generator.generate(schema, mappings, knowledgeContext);

      return { schema, mappings, report };
    }
  };
})();

// 导出到全局
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CrogoEngine;
}
