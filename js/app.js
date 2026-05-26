/* ── Crogo Application ── */

const App = {
  state: {
    user: { name: '测试用户', role: '管理员' },
    page: 'dashboard',
    templates: [],
    projects: [],
    kbStats: { chunk_count: 0, document_count: 0, project_count: 0 },
    currentProjectId: null,
    currentTemplateId: null,
    fieldSchema: [],
    queries: [],
  },

  async init() {
    this.setupAuth();
    this.bindNavigation();
    this.bindUpload();
    this.bindToggle();
    this.bindSearch();
    this.bindActions();
    await this.refreshAll();
    this.handleDeepLink();
  },

  setupAuth() {
    const showLogin = new URLSearchParams(location.search).get('login') === '1';
    const loginEl = document.getElementById('login-screen');
    const appEl = document.getElementById('app');

    if (showLogin) {
      loginEl.classList.add('show-login');
      appEl.classList.add('hidden');
      this.bindLogin();
    } else {
      loginEl.classList.remove('show-login');
      appEl.classList.remove('hidden');
      const avatar = document.querySelector('.user-avatar');
      const nameEl = document.querySelector('.user-name');
      if (avatar) avatar.textContent = this.state.user.name[0].toUpperCase();
      if (nameEl) nameEl.textContent = this.state.user.name;
    }
  },

  bindLogin() {
    const form = document.getElementById('loginForm');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim() || '测试用户';
      this.state.user = {
        name: email.includes('@') ? email.split('@')[0] : email,
        role: '管理员',
      };
      document.getElementById('login-screen').classList.remove('show-login');
      document.getElementById('app').classList.remove('hidden');
      this.showToast('登录成功');
    });
  },

  handleDeepLink() {
    const params = new URLSearchParams(location.search);
    const projectId = params.get('project');
    const templateId = params.get('template');
    if (projectId) this.openProjectDetail(parseInt(projectId, 10));
    else if (templateId) this.openTemplateDetail(parseInt(templateId, 10));
  },

  async refreshAll() {
    try {
      await API.health();
      const [stats, templates, projects, schema] = await Promise.all([
        API.kbStats(),
        API.listTemplates(),
        API.listProjects(),
        API.fieldSchema(),
      ]);
      this.state.kbStats = stats;
      this.state.templates = templates;
      this.state.projects = projects;
      this.state.fieldSchema = schema;
      this.updateStatsUI();
      this.renderTemplates();
      this.renderProjects();
    } catch (e) {
      this.showToast(e.message, true);
      this.state.templates = this.state.templates.length ? this.state.templates : [];
      this.renderTemplates();
      this.renderProjects();
    }
  },

  updateStatsUI() {
    const s = this.state.kbStats;
    const chunks = s.chunk_count || 0;
    const docs = s.document_count || 0;
    const projs = s.project_count || 0;
    const done = this.state.projects.filter(p => p.status === 'done').length;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = typeof val === 'number' ? val.toLocaleString() : val;
    };

    set('dashStatChunks', chunks);
    set('kbStatChunks', chunks);
    set('dashStatChunksSub', `已入库 ${docs} 份文档`);
    set('kbStatChunksSub', chunks > 0 ? '向量索引已完成' : '等待导入 PDF');
    set('kbStatDocs', docs);
    set('kbStatDocsSub', docs > 0 ? '历史方案 PDF' : '拖入 PDF 开始构建');
    set('kbStatProjects', projs);
    set('kbStatProjectsSub', '工作区项目数');
    set('dashStatTemplates', this.state.templates.length);
    set('dashStatProjects', this.state.projects.length);
    set('dashStatProjectsSub', `${this.state.projects.filter(p => p.status !== 'done').length} 进行中`);
    set('dashStatGenerated', done);

    document.querySelectorAll('.nav-item .nav-badge').forEach(badge => {
      const page = badge.closest('.nav-item')?.dataset.page;
      if (page === 'templates') badge.textContent = String(this.state.templates.length);
      if (page === 'knowledge') badge.textContent = String(docs || 0);
      if (page === 'projects') badge.textContent = String(this.state.projects.length);
    });
  },

  bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        if (page === 'logout') {
          location.reload();
          return;
        }
        if (page) this.navigate(page);
      });
    });

    document.getElementById('projectDetailBack')?.addEventListener('click', () => {
      history.replaceState({}, '', location.pathname);
      this.navigate('projects');
    });
    document.getElementById('templateDetailBack')?.addEventListener('click', () => {
      history.replaceState({}, '', location.pathname);
      this.navigate('templates');
    });
  },

  navigate(page) {
    if (page === 'project-detail' || page === 'template-detail') {
      this.state.page = page;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${page}`)?.classList.add('active');
      return;
    }

    this.state.page = page;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (nav) nav.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`)?.classList.add('active');

    const crumbs = {
      dashboard: { title: '工作台', crumb: '总览' },
      templates: { title: '模板库', crumb: `${this.state.templates.length} 个模板` },
      knowledge: { title: '知识库', crumb: `${(this.state.kbStats.chunk_count || 0).toLocaleString()} 条目` },
      projects: { title: '项目', crumb: `${this.state.projects.length} 个项目` },
      settings: { title: '设置', crumb: '系统配置' },
    };
    const info = crumbs[page] || { title: page, crumb: '' };
    document.getElementById('pageTitle').textContent = info.title;
    document.getElementById('breadcrumb').textContent = info.crumb;

    if (page === 'knowledge' || page === 'dashboard') this.refreshAll();
  },

  bindUpload() {
    const ingest = async (files, zoneId) => {
      if (!files?.length) return;
      const pdfs = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
      if (!pdfs.length) {
        this.showToast('请上传 PDF 文件', true);
        return;
      }
      const zone = document.getElementById(zoneId);
      zone?.classList.add('uploading');
      this.showToast(`正在入库 ${pdfs.length} 个 PDF...`);
      try {
        const job = await API.kbIngest(pdfs);
        if (job.status === 'error') {
          this.showToast(job.message || '入库失败', true);
        } else {
          this.showToast(job.message || '知识库索引完成 ✓');
        }
        await this.refreshAll();
      } catch (e) {
        this.showToast(e.message, true);
      } finally {
        zone?.classList.remove('uploading');
      }
    };

    const zone = document.getElementById('kbUpload');
    if (!zone) return;
    const input = zone.querySelector('input[type="file"]');
    ['dragenter', 'dragover'].forEach(evt => {
      zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(evt => {
      zone.addEventListener(evt, e => {
        e.preventDefault();
        zone.classList.remove('dragover');
        if (evt === 'drop' && e.dataTransfer?.files?.length) {
          ingest(e.dataTransfer.files, 'kbUpload');
        }
      });
    });
    zone.addEventListener('click', () => input?.click());
    input?.addEventListener('change', function () {
      if (this.files.length) ingest(this.files, 'kbUpload');
      this.value = '';
    });
  },

  bindToggle() {
    document.querySelectorAll('.toggle').forEach(t => {
      t.addEventListener('click', () => t.classList.toggle('on'));
    });
  },

  bindSearch() {
    document.getElementById('globalSearch')?.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || !e.target.value.trim()) return;
      const q = e.target.value.trim();
      try {
        const results = await API.kbSearch(q);
        this.state.queries = results.slice(0, 5).map((r, i) => ({
          text: q,
          project: r.source || '知识库',
          results: results.length,
          confidence: Math.round((r.score || 0) * 100),
          status: i === 0 ? 'adopted' : 'pending',
          snippet: r.text?.slice(0, 80),
        }));
        this.renderQueries();
        this.navigate('knowledge');
        this.showToast(`找到 ${results.length} 条相关知识`);
      } catch (err) {
        this.showToast(err.message, true);
      }
      e.target.value = '';
    });
  },

  bindActions() {
    document.getElementById('uploadTemplateBtn')?.addEventListener('click', () => this.openModal('uploadTemplate'));
    document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeModal();
    });

    document.addEventListener('click', (e) => {
      const navTarget = e.target.closest('[data-page-nav]');
      if (navTarget) {
        e.preventDefault();
        this.navigate(navTarget.dataset.pageNav);
        return;
      }
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      if (action === 'new-project') {
        e.preventDefault();
        this.openModal('newProject');
      } else if (action === 'upload-template') {
        e.preventDefault();
        this.openModal('uploadTemplate');
      }
    });
  },

  openModal(type) {
    const overlay = document.getElementById('modalOverlay');
    const title = document.getElementById('modalTitle');
    const desc = document.getElementById('modalDesc');
    const form = document.getElementById('modalForm');
    const actions = document.getElementById('modalActions');

    if (type === 'newProject') {
      title.textContent = '新建项目';
      desc.textContent = '选择一个或多个模板，上传方案 PDF，一次性生成全部文档';
      let tplListHtml = '';
      if (!this.state.templates.length) {
        tplListHtml = `<div class="tpl-checkbox-empty">尚未上传模板，请先到<a href="#" data-page-nav="templates">模板库</a>上传并完成映射。</div>`;
      } else {
        tplListHtml = '<ul class="tpl-checkbox-list">' + this.state.templates.map(t => {
          const ready = !!t.mappings_complete;
          const tag = ready
            ? '<span class="tpl-pill tpl-pill-ok">已映射</span>'
            : '<span class="tpl-pill tpl-pill-warn">待映射</span>';
          const dis = ready ? '' : 'disabled';
          const hint = ready ? '' : '<small class="tpl-hint">需在模板库完成占位符映射后才可勾选</small>';
          return `
            <li class="tpl-checkbox-item${ready ? '' : ' disabled'}">
              <label>
                <input type="checkbox" class="tpl-check" value="${t.id}" ${dis}>
                <span class="tpl-type-pill">${this.escapeHtml(t.type)}</span>
                <span class="tpl-name">${this.escapeHtml(t.name)}</span>
                ${tag}
              </label>
              ${hint}
            </li>`;
        }).join('') + '</ul>';
      }
      form.innerHTML = `
        <div class="form-group"><label>项目名称</label>
          <input type="text" id="projName" placeholder="例：RWS-2024-012" style="width:100%"></div>
        <div class="form-group"><label>申办方</label>
          <input type="text" id="projSponsor" placeholder="例：恒瑞医药" style="width:100%"></div>
        <div class="form-group"><label>选择模板（可多选）</label>
          ${tplListHtml}
          <small class="form-hint">已勾选模板将按顺序为同一份 PDF 各生成一份文档</small>
        </div>
        <div class="form-group"><label>方案 PDF</label>
          <input type="file" id="projPdf" accept=".pdf" style="font-size:12px"></div>`;
      actions.innerHTML = `
        <button class="btn btn-outline btn-sm modal-close-btn" type="button">取消</button>
        <button class="btn btn-primary btn-sm" id="modalSubmit" type="button" style="background:var(--teal)">创建并提取</button>`;
    } else if (type === 'uploadTemplate') {
      title.textContent = '上传模板';
      desc.textContent = '上传 .docx，系统将解析章节与占位符（支持 {{key}}、<key>、【key】）';
      form.innerHTML = `
        <div class="form-group"><label>模板类型</label>
          <select id="tplType" style="width:100%;padding:9px 12px;border-radius:6px;border:1px solid var(--border);font-size:13px">
            <option value="DMC">DMC</option><option value="DMP">DMP</option><option value="SAP">SAP</option>
            <option value="CSR">CSR</option><option value="ICF">ICF</option></select></div>
        <div class="form-group"><label>模板名称</label>
          <input type="text" id="tplName" placeholder="例：DMC Charter v2.1" style="width:100%"></div>
        <div class="form-group"><label>模板文件 (.docx)</label>
          <input type="file" id="tplFile" accept=".docx" style="font-size:12px"></div>`;
      actions.innerHTML = `
        <button class="btn btn-outline btn-sm modal-close-btn" type="button">取消</button>
        <button class="btn btn-primary btn-sm" id="modalSubmit" type="button" style="background:var(--teal)">上传并解析</button>`;
    }

    overlay.classList.add('show');
    document.getElementById('modalSubmit')?.addEventListener('click', () => this.handleModalSubmit(type));
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => this.closeModal());
    });
  },

  async handleModalSubmit(type) {
    try {
      if (type === 'newProject') {
        const name = document.getElementById('projName')?.value.trim();
        const sponsor = document.getElementById('projSponsor')?.value.trim();
        const templateIds = Array.from(document.querySelectorAll('.tpl-check:checked'))
          .map(el => parseInt(el.value, 10))
          .filter(Boolean);
        const file = document.getElementById('projPdf')?.files?.[0];
        if (!name) {
          this.showToast('请填写项目名称', true);
          return;
        }
        if (!file) {
          this.showToast('请上传方案 PDF', true);
          return;
        }
        if (!templateIds.length) {
          this.showToast('请至少勾选一个已映射的模板', true);
          return;
        }
        this.closeModal();
        this.showToast('正在创建项目...');
        const proj = await API.createProject(name, sponsor, templateIds, file);
        this.showToast('正在提取字段...');
        await API.extractProject(proj.id);
        await this.refreshAll();
        history.replaceState({}, '', `${location.pathname}?project=${proj.id}`);
        this.openProjectDetail(proj.id);
      } else if (type === 'uploadTemplate') {
        const typeVal = document.getElementById('tplType')?.value;
        const file = document.getElementById('tplFile')?.files?.[0];
        let name = document.getElementById('tplName')?.value.trim();
        if (!file) {
          this.showToast('请选择 .docx 文件', true);
          return;
        }
        if (!name) name = file.name.replace(/\.docx$/i, '');
        this.closeModal();
        this.showToast('正在解析模板...');
        const tpl = await API.uploadTemplate(typeVal, name, file);
        await this.refreshAll();
        history.replaceState({}, '', `${location.pathname}?template=${tpl.id}`);
        this.openTemplateDetail(tpl.id);
        this.showToast('模板已上传，请确认占位符映射');
      }
    } catch (e) {
      this.showToast(e.message, true);
    }
  },

  closeModal() {
    document.getElementById('modalOverlay')?.classList.remove('show');
  },

  async openProjectDetail(id) {
    this.state.currentProjectId = id;
    this.navigate('project-detail');
    const body = document.getElementById('projectDetailBody');
    const title = document.getElementById('projectDetailTitle');
    body.innerHTML = '<p class="loading-text">加载中...</p>';

    try {
      const proj = await API.getProject(id);
      title.textContent = proj.name;
      body.innerHTML = this.renderProjectDetail(proj);
      this.bindProjectDetailActions(proj);
    } catch (e) {
      body.innerHTML = `<p class="error-text">${e.message}</p>`;
    }
  },

  renderProjectDetail(proj) {
    const statusMap = {
      draft: '草稿',
      extracting: '提取中',
      validating: '待校验',
      generating: '生成中',
      partial: '部分完成',
      done: '已完成',
    };
    const fields = proj.fields || [];
    const fieldsHtml = fields.length
      ? fields.map(f => `
        <div class="field-row" data-key="${this.escapeHtml(f.key)}">
          <div class="field-label">
            ${this.escapeHtml(f.label || f.key)}${f.required ? '<span class="req">*</span>' : ''}
            <small>置信度 ${Math.round((f.confidence || 0) * 100)}%</small>
          </div>
          <textarea class="field-input" rows="2"></textarea>
          ${f.source_snippet ? `<div class="field-source">依据: ${this.escapeHtml(f.source_snippet)}</div>` : ''}
        </div>`).join('')
      : '<p class="empty-text">暂无字段，点击「重新提取」从 PDF 中识别。</p>';

    const generations = proj.generations || [];
    const genCount = generations.length;
    const generateLabel = genCount > 1
      ? `生成全部文档（${genCount} 份）`
      : (genCount === 1 ? `生成 ${this.escapeHtml(generations[0].template_type || 'DMC')}` : '生成文档');
    const generateDisabled = genCount === 0 ? 'disabled' : '';

    const genStatusLabel = {
      pending: '待生成',
      done: '已生成',
      error: '失败',
    };
    const genStatusClass = {
      pending: 'gen-pending',
      done: 'gen-done',
      error: 'gen-error',
    };

    const generationsHtml = genCount
      ? `<div class="generations-grid">${generations.map(g => {
          const cls = genStatusClass[g.status] || 'gen-pending';
          const label = genStatusLabel[g.status] || g.status;
          const action = g.status === 'done'
            ? `<a class="btn btn-primary btn-xs" href="${API.downloadUrl(proj.id, g.template_id)}" download>下载 .docx</a>`
            : (g.status === 'error'
                ? `<span class="gen-msg">${this.escapeHtml(g.message || '生成失败')}</span>`
                : '<span class="gen-msg">等待生成</span>');
          return `
            <div class="generation-card ${cls}">
              <div class="gc-head">
                <span class="tpl-type-pill">${this.escapeHtml(g.template_type || '')}</span>
                <span class="gc-name">${this.escapeHtml(g.template_name || '')}</span>
                <span class="gc-status">${label}</span>
              </div>
              <div class="gc-action">${action}</div>
            </div>`;
        }).join('')}</div>`
      : '<p class="empty-text">未选择模板，请重建项目并勾选模板。</p>';

    return `
      <div class="detail-meta">
        <span>状态：${statusMap[proj.status] || proj.status}</span>
        <span>方案：${this.escapeHtml(proj.pdf_filename || '')}</span>
        <span>模板数：${genCount}</span>
      </div>
      <div class="detail-actions">
        <button class="btn btn-outline btn-sm" id="btnExtract">重新提取字段</button>
        <button class="btn btn-outline btn-sm" id="btnSaveFields">保存校验</button>
        <button class="btn btn-primary btn-sm" id="btnGenerate" style="background:var(--teal)" ${generateDisabled}>${generateLabel}</button>
      </div>
      <div class="generations-panel">
        <h4>生成进度</h4>
        ${generationsHtml}
      </div>
      <div class="fields-panel"><h4>字段校验</h4>${fieldsHtml}</div>`;
  },

  bindProjectDetailActions(proj) {
    (proj.fields || []).forEach(f => {
      const ta = document.querySelector(`.field-row[data-key="${f.key}"] .field-input`);
      if (ta) ta.value = f.value || '';
    });

    document.getElementById('btnExtract')?.addEventListener('click', async () => {
      try {
        this.showToast('正在提取...');
        await API.extractProject(proj.id);
        await this.openProjectDetail(proj.id);
        this.showToast('提取完成，请校验字段');
      } catch (e) {
        this.showToast(e.message, true);
      }
    });

    document.getElementById('btnSaveFields')?.addEventListener('click', async () => {
      const fields = this.collectFieldsFromDOM();
      try {
        await API.saveFields(proj.id, fields);
        this.showToast('字段已保存');
        await this.refreshAll();
      } catch (e) {
        this.showToast(e.message, true);
      }
    });

    document.getElementById('btnGenerate')?.addEventListener('click', async () => {
      const fields = this.collectFieldsFromDOM();
      try {
        await API.saveFields(proj.id, fields);
        this.showToast('正在生成文档...');
        const res = await API.generateProject(proj.id);
        this.showToast(res.message || '生成成功');
        await this.openProjectDetail(proj.id);
        await this.refreshAll();
      } catch (e) {
        this.showToast(e.message, true);
      }
    });
  },

  collectFieldsFromDOM() {
    const schemaByKey = {};
    (this.state.fieldSchema || []).forEach(d => { schemaByKey[d.key] = d; });
    return Array.from(document.querySelectorAll('.field-row')).map(row => {
      const key = row.dataset.key;
      const defn = schemaByKey[key] || { label: key, required: false };
      return {
        key,
        label: defn.label || key,
        value: row.querySelector('.field-input')?.value || '',
        confidence: 1,
        source_snippet: row.querySelector('.field-source')?.textContent?.replace('依据: ', '') || '',
        required: defn.required !== false,
      };
    });
  },

  async openTemplateDetail(id) {
    this.state.currentTemplateId = id;
    this.navigate('template-detail');
    const body = document.getElementById('templateDetailBody');
    const title = document.getElementById('templateDetailTitle');
    body.innerHTML = '<p class="loading-text">加载中...</p>';

    try {
      const tpl = await API.getTemplate(id);
      title.textContent = `${tpl.type} — ${tpl.name}`;
      const schema = this.state.fieldSchema || [];
      const phRows = (tpl.placeholders_list || []).map(ph => {
        const selected = tpl.mappings?.[ph.name] || '';
        const opts = schema.map(f =>
          `<option value="${f.key}"${f.key === selected ? ' selected' : ''}>${this.escapeHtml(f.label)} (${f.key})</option>`
        ).join('');
        return `
          <tr>
            <td><code>${this.escapeHtml(ph.name)}</code></td>
            <td class="ph-context">${this.escapeHtml(ph.context || '')}</td>
            <td>
              <select class="mapping-select" data-ph="${this.escapeHtml(ph.name)}">
                <option value="">— 未映射 —</option>
                ${opts}
              </select>
            </td>
          </tr>`;
      }).join('');

      const sectionsHtml = (tpl.sections_list || []).slice(0, 12).map(s =>
        `<li>${this.escapeHtml(s.number || '')} ${this.escapeHtml(s.title || '')}</li>`
      ).join('');

      const phCount = (tpl.placeholders_list || []).length;
      const mappedCount = Object.keys(tpl.mappings || {}).length;
      const ready = tpl.mappings_complete;
      const bannerClass = ready ? 'banner-ok' : 'banner-warn';
      const bannerTitle = ready ? '模板已可用于项目生成' : '模板已上传，请确认占位符映射';
      const bannerDesc = `已识别 ${tpl.sections} 章节 / ${phCount} 占位符 · 已映射 ${mappedCount} / ${phCount}`;

      body.innerHTML = `
        <div class="confirm-banner ${bannerClass}">
          <div class="cb-text">
            <h4>${bannerTitle}</h4>
            <p>${bannerDesc}</p>
          </div>
        </div>
        <p class="detail-meta">${this.escapeHtml(tpl.desc || '')}</p>
        <div class="detail-actions">
          <button class="btn btn-primary btn-sm" id="btnSaveMappings" style="background:var(--teal)">保存映射并启用</button>
          <button class="btn btn-outline btn-sm" id="btnReupload">重新上传</button>
          <button class="btn btn-danger btn-sm" id="btnDeleteTpl">删除模板</button>
        </div>
        <div class="mapping-grid">
          <div class="sections-preview"><h4>章节预览</h4><ul>${sectionsHtml || '<li>无章节</li>'}</ul></div>
          <div class="mapping-table-wrap">
            <h4>占位符映射</h4>
            <table class="mapping-table">
              <thead><tr><th>占位符</th><th>上下文</th><th>字段</th></tr></thead>
              <tbody>${phRows || '<tr><td colspan="3">未发现占位符，请在 docx 中使用 {{field_key}} 格式</td></tr>'}</tbody>
            </table>
          </div>
        </div>`;

      document.querySelectorAll('.mapping-select').forEach(sel => {
        const ph = sel.dataset.ph;
        if (tpl.mappings?.[ph]) sel.value = tpl.mappings[ph];
      });

      document.getElementById('btnSaveMappings')?.addEventListener('click', async () => {
        const mappings = {};
        document.querySelectorAll('.mapping-select').forEach(sel => {
          if (sel.value) mappings[sel.dataset.ph] = sel.value;
        });
        try {
          await API.saveMappings(id, mappings);
          this.showToast('模板已保存，可在新建项目时勾选');
          await this.refreshAll();
          await this.openTemplateDetail(id);
        } catch (e) {
          this.showToast(e.message, true);
        }
      });

      document.getElementById('btnReupload')?.addEventListener('click', () => {
        this.openModal('uploadTemplate');
      });

      document.getElementById('btnDeleteTpl')?.addEventListener('click', async () => {
        if (!confirm(`确认删除模板「${tpl.name}」？此操作不可恢复。`)) return;
        try {
          await API.deleteTemplate(id);
          this.showToast('模板已删除');
          history.replaceState({}, '', location.pathname);
          await this.refreshAll();
          this.navigate('templates');
        } catch (e) {
          this.showToast(e.message, true);
        }
      });
    } catch (e) {
      body.innerHTML = `<p class="error-text">${this.escapeHtml(e.message)}</p>`;
    }
  },

  renderTemplates() {
    const grid = document.getElementById('templateGrid');
    if (!grid) return;
    const cards = this.state.templates.map(t => {
      const pillClass = t.mappings_complete ? 'tpl-pill tpl-pill-ok' : 'tpl-pill tpl-pill-warn';
      const pillText = t.mappings_complete ? '已映射' : '待映射';
      return `
        <div class="template-card clickable" data-tpl-id="${t.id}">
          <div class="tc-type">${this.escapeHtml(t.type)}</div>
          <h4>${this.escapeHtml(t.name)}</h4>
          <p>${this.escapeHtml(t.desc || '')}</p>
          <div class="tc-meta">
            <span>${t.sections} 章节</span><span class="dot"></span>
            <span>${t.placeholders} 占位符</span><span class="dot"></span>
            <span class="${pillClass}">${pillText}</span>
          </div>
        </div>`;
    }).join('');
    grid.innerHTML = cards + `
      <div class="template-card add-card" id="uploadTemplateBtn2">
        <div class="add-icon">+</div>
        <p style="color:var(--text-ter);margin-bottom:0;">上传新模板</p>
      </div>`;
    grid.querySelectorAll('.template-card.clickable').forEach(card => {
      card.addEventListener('click', () => {
        history.replaceState({}, '', `${location.pathname}?template=${card.dataset.tplId}`);
        this.openTemplateDetail(parseInt(card.dataset.tplId, 10));
      });
    });
    document.getElementById('uploadTemplateBtn2')?.addEventListener('click', () => this.openModal('uploadTemplate'));
  },

  renderProjects() {
    const statusMap = {
      done: '已完成',
      partial: '部分完成',
      generating: '生成中',
      validating: '待校验',
      extracting: '提取中',
      draft: '草稿',
      progress: '进行中',
    };
    const statusClass = {
      done: 'status-done',
      partial: 'status-progress',
      generating: 'status-progress',
      validating: 'status-draft',
      extracting: 'status-progress',
      draft: 'status-draft',
      progress: 'status-progress',
    };
    const colors = ['#0891b2', '#7c3aed', '#d97706', '#2563eb', '#dc2626'];

    const hasProjects = this.state.projects.length > 0;

    const projectItem = (p, i) => {
      const initials = (p.name || 'P')[0].toUpperCase();
      const color = colors[i % colors.length];
      return `
        <div class="project-item clickable" data-proj-id="${p.id}">
          <div class="pi-icon" style="background:${color}">${initials}</div>
          <div class="pi-info">
            <div class="pi-name">${this.escapeHtml(p.name)}</div>
            <div class="pi-meta">
              <span>申办方：${this.escapeHtml(p.sponsor || '—')}</span>
              <span>${statusMap[p.status] || p.status}</span>
              <span>${p.updated_at || ''}</span>
            </div>
          </div>
          <span class="pi-status ${statusClass[p.status] || 'status-draft'}">${statusMap[p.status] || p.status}</span>
        </div>`;
    };

    const itemsHtml = this.state.projects.map(projectItem).join('');

    const dashboardListHtml = hasProjects
      ? itemsHtml
      : '<p class="empty-text">暂无项目，点击左侧「新建项目」或下方按钮开始</p>';

    const projectsPageHtml = hasProjects
      ? itemsHtml
      : `<div class="empty-state-card">
           <h4>还没有项目</h4>
           <p>新建一个项目，上传方案 PDF，一次性生成多份文档。</p>
           <button class="btn btn-primary btn-sm" data-action="new-project">＋ 新建项目</button>
         </div>`;

    document.querySelectorAll('.project-list').forEach(list => {
      const isProjectsPage = list.id === 'projectsFullList';
      list.innerHTML = isProjectsPage ? projectsPageHtml : dashboardListHtml;
      list.querySelectorAll('.project-item.clickable').forEach(item => {
        item.addEventListener('click', () => {
          const id = parseInt(item.dataset.projId, 10);
          history.replaceState({}, '', `${location.pathname}?project=${id}`);
          this.openProjectDetail(id);
        });
      });
    });

    const emptyBanner = document.getElementById('dashboardEmptyState');
    if (emptyBanner) emptyBanner.hidden = hasProjects;
  },

  renderQueries() {
    const list = document.getElementById('queryList');
    if (!list) return;
    const qs = this.state.queries;
    if (!qs.length) {
      list.innerHTML = '<p class="empty-text">使用顶部搜索或完成项目提取后，相关知识将显示在此</p>';
      return;
    }
    list.innerHTML = qs.map(q => `
      <div class="query-item">
        <div class="qi-icon">◈</div>
        <div class="qi-body">
          <div class="qi-text">${this.escapeHtml(q.text)}</div>
          <div class="qi-meta">${this.escapeHtml(q.project)} · ${q.results}条 · 置信度 ${q.confidence}%</div>
        </div>
        <span class="qi-status" style="background:${q.status === 'adopted' ? 'var(--green-bg)' : 'var(--yellow-bg)'};color:${q.status === 'adopted' ? 'var(--green)' : 'var(--yellow)'}">${q.status === 'adopted' ? '已采纳' : '待确认'}</span>
      </div>`).join('');
  },

  escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  },

  showToast(msg, isError = false) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast' + (isError ? ' toast-error' : '');
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; }, 2800);
    setTimeout(() => toast.remove(), 3200);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
