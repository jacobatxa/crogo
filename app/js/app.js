/* ── Crogo Application ── */

const sleep = ms => new Promise(r => setTimeout(r, ms));

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
    this.initEngine();
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
      this.renderDashboardTodos();
    } catch (e) {
      this.showToast(e.message, true);
      this.state.templates = this.state.templates.length ? this.state.templates : [];
      this.renderTemplates();
      this.renderProjects();
      this.renderDashboardTodos();
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
    document.getElementById('btnDeleteProject')?.addEventListener('click', async () => {
      const id = this.state.currentProjectId;
      if (!id) return;
      const proj = this.state.projects.find(p => p.id === id);
      await this.deleteProject(id, proj?.name || '该项目');
    });
    document.getElementById('templateDetailBack')?.addEventListener('click', () => {
      history.replaceState({}, '', location.pathname);
      this.navigate('templates');
    });
  },

  navigate(page) {
    if (page !== 'project-detail') this.stopWizardPoll();
    if (page === 'project-detail' || page === 'template-detail') {
      this.state.page = page;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${page}`)?.classList.add('active');
      const titleEl = document.getElementById('pageTitle');
      const crumbEl = document.getElementById('breadcrumb');
      if (page === 'project-detail') {
        const proj = this.state.projects.find(p => p.id === this.state.currentProjectId);
        if (titleEl) titleEl.textContent = proj?.name || '项目详情';
        if (crumbEl) crumbEl.textContent = '字段审核 → 生成文档';
      } else if (page === 'template-detail') {
        const tpl = this.state.templates.find(t => t.id === this.state.currentTemplateId);
        if (titleEl) titleEl.textContent = tpl ? `${tpl.type} · ${tpl.name}` : '模板映射';
        if (crumbEl) crumbEl.textContent = '占位符映射';
      }
      window.scrollTo(0, 0);
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
      engine: { title: '引擎', crumb: '文档生成管线' },
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
          this.renderOutcomeBanner('kbOutcomeHost', {
            variant: 'teal',
            title: `已入库 ${pdfs.length} 份 PDF`,
            body: '用于知识检索与后续提取参考，不会自动生成文档。',
            actions: [
              { label: '新建项目', primary: true, action: 'new-project' },
              { label: '继续导入', action: 'dismiss' },
            ],
          });
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

  bindModalFooter() {
    if (this._modalFooterBound) return;
    this._modalFooterBound = true;

    document.getElementById('modalCancel')?.addEventListener('click', () => {
      if (this._modalType === 'newProject' && this._newProjectModal?.step === 2) {
        const st = this._newProjectModal;
        st.step = 1;
        st.metaConfirmed = false;
        const desc = document.getElementById('modalDesc');
        if (desc) desc.textContent = '上传方案 PDF，核对识别结果后确认';
        this.renderNewProjectStep1();
        this.syncNewProjectModalFooter();
        return;
      }
      this.closeModal();
    });

    document.getElementById('modalSubmit')?.addEventListener('click', () => {
      if (this._modalType) this.handleModalSubmit(this._modalType);
    });
  },

  bindActions() {
    this.bindModalFooter();
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

  formatFileSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  },

  filePickerHtml({ id, accept, title, hint, icon = '↑' }) {
    return `
      <div class="file-picker-wrap" data-fp-id="${id}">
        <div class="file-picker" id="${id}-empty">
          <input type="file" id="${id}-input" accept="${accept}">
          <div class="fp-icon">${icon}</div>
          <div class="fp-title">${this.escapeHtml(title)}</div>
          <div class="fp-hint">${this.escapeHtml(hint)}</div>
        </div>
        <div class="file-picker-card" id="${id}-card" hidden>
          <div class="fpc-icon">📄</div>
          <div class="fpc-body">
            <div class="fpc-name" id="${id}-name"></div>
            <div class="fpc-meta" id="${id}-meta"></div>
            <div class="fpc-status" id="${id}-status"></div>
            <div class="fpc-actions">
              <button type="button" class="btn btn-outline btn-sm" data-fp-replace="${id}">更换文件</button>
              <button type="button" class="btn btn-outline btn-sm" data-fp-remove="${id}">移除</button>
            </div>
          </div>
        </div>
      </div>`;
  },

  setFilePickerState(id, { file, status = 'idle', statusText = '' }) {
    const empty = document.getElementById(`${id}-empty`);
    const card = document.getElementById(`${id}-card`);
    const nameEl = document.getElementById(`${id}-name`);
    const metaEl = document.getElementById(`${id}-meta`);
    const statusEl = document.getElementById(`${id}-status`);
    if (!empty || !card) return;

    if (!file) {
      empty.hidden = false;
      card.hidden = true;
      empty.classList.remove('loading');
      if (statusEl) {
        statusEl.textContent = '';
        statusEl.className = 'fpc-status';
      }
      return;
    }

    empty.hidden = true;
    card.hidden = false;
    empty.classList.toggle('loading', status === 'loading');
    if (nameEl) nameEl.textContent = file.name;
    if (metaEl) metaEl.textContent = this.formatFileSize(file.size);
    if (statusEl) {
      statusEl.textContent = statusText;
      statusEl.className = 'fpc-status'
        + (status === 'error' ? ' is-error' : '')
        + (status === 'ready' ? ' is-ok' : '');
    }
  },

  bindFilePicker(id, handlers = {}) {
    const input = document.getElementById(`${id}-input`);
    const empty = document.getElementById(`${id}-empty`);
    if (!input) return;

    const pick = (file) => {
      if (handlers.onFile) handlers.onFile(file || null);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0] || null;
      if (file) pick(file);
      input.value = '';
    });

    document.querySelector(`[data-fp-remove="${id}"]`)?.addEventListener('click', (e) => {
      e.preventDefault();
      input.value = '';
      this.setFilePickerState(id, { file: null });
      pick(null);
    });

    document.querySelector(`[data-fp-replace="${id}"]`)?.addEventListener('click', (e) => {
      e.preventDefault();
      input.click();
    });

    empty?.addEventListener('dragover', (e) => {
      e.preventDefault();
      empty.classList.add('dragover');
    });
    empty?.addEventListener('dragleave', () => empty.classList.remove('dragover'));
    empty?.addEventListener('drop', (e) => {
      e.preventDefault();
      empty.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) pick(file);
    });
  },

  buildTemplateCheckboxListHtml() {
    if (!this.state.templates.length) {
      return `<div class="tpl-checkbox-empty">尚未上传模板，请先到<a href="#" data-page-nav="templates">模板库</a>上传并完成映射。</div>`;
    }
    return '<ul class="tpl-checkbox-list">' + this.state.templates.map(t => {
      const ready = !!t.mappings_complete;
      const tag = ready
        ? '<span class="tpl-pill tpl-pill-ok">已映射</span>'
        : '<span class="tpl-pill tpl-pill-warn">待映射</span>';
      const dis = ready ? '' : 'disabled';
      const hint = ready ? '' : '<small class="tpl-hint">需在模板库完成占位符映射后才可勾选</small>';
      const lastId = sessionStorage.getItem('crogo_lastMappedTemplateId');
      const checked = ready && lastId && String(t.id) === lastId ? ' checked' : '';
      return `
        <li class="tpl-checkbox-item${ready ? '' : ' disabled'}">
          <label>
            <input type="checkbox" class="tpl-check" value="${t.id}" ${dis}${checked}>
            <span class="tpl-type-pill">${this.escapeHtml(t.type)}</span>
            <span class="tpl-name">${this.escapeHtml(t.name)}</span>
            ${tag}
          </label>
          ${hint}
        </li>`;
    }).join('') + '</ul>';
  },

  renderNewProjectModalSteps() {
    const step = this._newProjectModal?.step || 1;
    const s1 = step === 1 ? 'active' : 'done';
    const s2 = step === 2 ? 'active' : '';
    return `
      <div class="modal-steps">
        <div class="modal-step ${s1}">1. 上传方案并核对</div>
        <div class="modal-step ${s2}">2. 选择要生成的文档</div>
      </div>`;
  },

  renderNewProjectStep1() {
    const form = document.getElementById('modalForm');
    const st = this._newProjectModal;
    const preview = st.preview || {};
    const showFields = !!st.file;
    form.innerHTML = `
      ${this.renderNewProjectModalSteps()}
      <div class="form-group">
        <label>方案 PDF</label>
        ${this.filePickerHtml({
          id: 'projPdf',
          accept: '.pdf',
          title: '点击或拖入方案 PDF',
          hint: '支持 .pdf，上传后自动识别项目名称与申办方',
          icon: 'PDF',
        })}
      </div>
      <div class="modal-preview-fields" id="projPreviewFields" ${showFields ? '' : 'hidden'}>
        <div class="form-group">
          <label>项目名称</label>
          <input type="text" id="projName" placeholder="上传 PDF 后自动填充，可修改" style="width:100%"
            value="${this.escapeHtml(st.projectName || '')}">
        </div>
        <div class="form-group">
          <label>申办方</label>
          <input type="text" id="projSponsor" placeholder="上传 PDF 后自动填充，可修改" style="width:100%"
            value="${this.escapeHtml(st.sponsor || '')}">
        </div>
        ${preview.protocol_id ? `<small class="form-hint">方案编号：${this.escapeHtml(preview.protocol_id)}</small>` : ''}
        ${st.hintText ? `<small class="form-hint" id="projPdfHint">${this.escapeHtml(st.hintText)}</small>` : ''}
      </div>`;

    this.bindFilePicker('projPdf', {
      onFile: (file) => this.onNewProjectPdfSelected(file),
    });
    if (st.file) {
      this.setFilePickerState('projPdf', {
        file: st.file,
        status: st.previewLoading ? 'loading' : (st.previewError ? 'error' : 'ready'),
        statusText: st.previewLoading
          ? '正在识别方案信息…'
          : (st.previewError || st.hintText || '已识别，请核对后确认'),
      });
    } else {
      this.setFilePickerState('projPdf', { file: null });
    }

    document.getElementById('projName')?.addEventListener('input', () => {
      this._newProjectModal.projectName = document.getElementById('projName')?.value || '';
      this.syncNewProjectModalFooter();
    });
    document.getElementById('projSponsor')?.addEventListener('input', () => {
      this._newProjectModal.sponsor = document.getElementById('projSponsor')?.value || '';
    });
  },

  renderNewProjectStep2() {
    const form = document.getElementById('modalForm');
    const st = this._newProjectModal;
    const fileName = st.file?.name || '';
    form.innerHTML = `
      ${this.renderNewProjectModalSteps()}
      <div class="modal-summary-bar">
        <span class="msb-file">${this.escapeHtml(fileName)}</span>
        <a href="#" id="projBackToStep1">返回修改</a>
      </div>
      <div class="form-group">
        <label>选择模板（可多选）</label>
        ${this.buildTemplateCheckboxListHtml()}
        <small class="form-hint">已勾选模板将按顺序为同一份 PDF 各生成一份文档</small>
      </div>`;

    document.getElementById('projBackToStep1')?.addEventListener('click', (e) => {
      e.preventDefault();
      this._newProjectModal.step = 1;
      this._newProjectModal.metaConfirmed = false;
      const title = document.getElementById('modalTitle');
      const desc = document.getElementById('modalDesc');
      if (title) title.textContent = '新建项目';
      if (desc) desc.textContent = '上传方案 PDF，核对识别结果后确认';
      this.renderNewProjectStep1();
      this.syncNewProjectModalFooter();
    });
  },

  getNewProjectActionHint(st) {
    if (!st.file) return '请先上传方案 PDF';
    if (st.previewLoading) return '正在识别方案信息，请稍候…';
    const name = (document.getElementById('projName')?.value || st.projectName || '').trim();
    if (!name) return '请填写项目名称';
    return '核对名称与申办方后点「下一步」';
  },

  syncNewProjectModalFooter() {
    if (this._modalType !== 'newProject' || !this._newProjectModal) return;
    const st = this._newProjectModal;
    const hintEl = document.getElementById('modalActionHint');
    const cancelBtn = document.getElementById('modalCancel');
    const submitBtn = document.getElementById('modalSubmit');
    if (!hintEl || !cancelBtn || !submitBtn) return;

    const step = st.step || 1;
    if (step === 1) {
      cancelBtn.textContent = '取消';
      cancelBtn.hidden = false;
      const canProceed = !!st.file && !st.previewLoading;
      submitBtn.textContent = st.previewLoading ? '识别中…' : '下一步';
      submitBtn.disabled = !canProceed;
      submitBtn.hidden = false;
      hintEl.textContent = this.getNewProjectActionHint(st);
    } else {
      cancelBtn.textContent = '上一步';
      cancelBtn.hidden = false;
      submitBtn.textContent = '创建并开始审核';
      submitBtn.disabled = false;
      submitBtn.hidden = false;
      hintEl.textContent = '将提取字段并进入审核页（约 1 分钟）';
    }
  },

  syncUploadTemplateModalFooter() {
    if (this._modalType !== 'uploadTemplate') return;
    const hintEl = document.getElementById('modalActionHint');
    const cancelBtn = document.getElementById('modalCancel');
    const submitBtn = document.getElementById('modalSubmit');
    if (!hintEl || !cancelBtn || !submitBtn) return;

    cancelBtn.textContent = '取消';
    cancelBtn.hidden = false;
    const hasFile = !!this._uploadTemplateModal?.file;
    submitBtn.textContent = '确认上传';
    submitBtn.disabled = !hasFile;
    submitBtn.hidden = false;
    hintEl.textContent = hasFile
      ? '确认后将解析模板章节与占位符'
      : '请先选择 .docx 模板文件';
  },

  openModal(type) {
    const overlay = document.getElementById('modalOverlay');
    const box = overlay?.querySelector('.modal-box');
    const title = document.getElementById('modalTitle');
    const desc = document.getElementById('modalDesc');
    const form = document.getElementById('modalForm');
    const actions = document.getElementById('modalActions');

    this._modalType = type;
    box?.classList.toggle('modal-wide', type === 'newProject');

    if (type === 'newProject') {
      this._newProjectModal = {
        step: 1,
        file: null,
        metaConfirmed: false,
        preview: null,
        projectName: '',
        sponsor: '',
        previewLoading: false,
        previewError: '',
        hintText: '',
      };
      title.textContent = '新建项目';
      desc.textContent = '上传方案 PDF，核对名称与申办方';
      this.renderNewProjectStep1();
      this.syncNewProjectModalFooter();
    } else if (type === 'uploadTemplate') {
      this._uploadTemplateModal = { file: null };
      title.textContent = '上传模板';
      desc.textContent = '选择 .docx 文件，确认后解析章节与占位符';
      form.innerHTML = `
        <div class="form-group"><label>模板类型</label>
          <select id="tplType" style="width:100%;padding:9px 12px;border-radius:6px;border:1px solid var(--border);font-size:13px">
            <option value="DMC">DMC</option><option value="DMP">DMP</option><option value="SAP">SAP</option>
            <option value="CSR">CSR</option><option value="ICF">ICF</option></select></div>
        <div class="form-group"><label>模板名称</label>
          <input type="text" id="tplName" placeholder="选择文件后自动填充，可修改" style="width:100%"></div>
        <div class="form-group"><label>模板文件 (.docx)</label>
          ${this.filePickerHtml({
            id: 'tplFile',
            accept: '.docx',
            title: '点击或拖入 .docx 模板',
            hint: '支持 {{key}}、&lt;key&gt;、【key】占位符',
            icon: 'DOC',
          })}
        </div>`;
      this.bindFilePicker('tplFile', {
        onFile: (file) => this.onTemplateFileSelected(file),
      });
      this.setFilePickerState('tplFile', { file: null });
      this.syncUploadTemplateModalFooter();
    }

    overlay.classList.add('show');
  },

  async onNewProjectPdfSelected(file) {
    const st = this._newProjectModal;
    if (!st) return;

    if (!file) {
      st.file = null;
      st.preview = null;
      st.metaConfirmed = false;
      st.projectName = '';
      st.sponsor = '';
      st.previewLoading = false;
      st.previewError = '';
      st.hintText = '';
      this.renderNewProjectStep1();
      this.syncNewProjectModalFooter();
      return;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.showToast('请上传 PDF 文件', true);
      return;
    }

    st.file = file;
    st.metaConfirmed = false;
    st.previewLoading = true;
    st.previewError = '';
    st.hintText = '';
    this.renderNewProjectStep1();
    this.syncNewProjectModalFooter();

    try {
      const meta = await API.previewProject(file);
      st.preview = meta;
      st.projectName = meta.name || '';
      st.sponsor = meta.sponsor || '';
      st.previewLoading = false;
      st.hintText = meta.name || meta.sponsor
        ? ''
        : '未识别到项目名称，请手动填写';

      const nameEl = document.getElementById('projName');
      const sponsorEl = document.getElementById('projSponsor');
      const hintEl = document.getElementById('projPdfHint');
      if (nameEl) nameEl.value = st.projectName;
      if (sponsorEl) sponsorEl.value = st.sponsor;
      if (hintEl) hintEl.textContent = st.hintText;
      let protoEl = document.getElementById('projProtocolHint');
      if (meta.protocol_id) {
        if (!protoEl) {
          protoEl = document.createElement('small');
          protoEl.id = 'projProtocolHint';
          protoEl.className = 'form-hint';
          document.getElementById('projPreviewFields')?.appendChild(protoEl);
        }
        if (protoEl) protoEl.textContent = `方案编号：${meta.protocol_id}`;
      } else if (protoEl) {
        protoEl.remove();
      }

      this.setFilePickerState('projPdf', {
        file,
        status: 'ready',
        statusText: '已识别，请核对项目名称与申办方',
      });

      if (meta.name || meta.sponsor) {
        this.showToast('已从 PDF 填充项目名称与申办方');
      } else {
        this.showToast('未能自动识别，请手动填写项目名称', true);
      }
    } catch (err) {
      st.previewLoading = false;
      st.previewError = err.message;
      st.hintText = '识别失败，请手动填写或更换文件';
      const hintEl = document.getElementById('projPdfHint');
      if (hintEl) hintEl.textContent = st.hintText;
      this.setFilePickerState('projPdf', {
        file,
        status: 'error',
        statusText: st.hintText,
      });
      this.showToast(err.message, true);
    }
    this.syncNewProjectModalFooter();
  },

  onTemplateFileSelected(file) {
    const st = this._uploadTemplateModal;
    if (!st) return;
    if (!file) {
      st.file = null;
      this.setFilePickerState('tplFile', { file: null });
      this.syncUploadTemplateModalFooter();
      return;
    }
    if (!file.name.toLowerCase().endsWith('.docx')) {
      this.showToast('请上传 .docx 文件', true);
      return;
    }
    st.file = file;
    this.setFilePickerState('tplFile', {
      file,
      status: 'ready',
      statusText: '已选择，点击「确认上传」开始解析',
    });
    const nameEl = document.getElementById('tplName');
    if (nameEl && !nameEl.value.trim()) {
      nameEl.value = file.name.replace(/\.docx$/i, '');
    }
    this.syncUploadTemplateModalFooter();
  },

  async handleModalSubmit(type) {
    try {
      if (type === 'newProject') {
        const st = this._newProjectModal;
        if (!st) return;

        if (st.step === 1) {
          const name = (document.getElementById('projName')?.value || st.projectName || '').trim();
          const sponsor = (document.getElementById('projSponsor')?.value || st.sponsor || '').trim();
          if (!st.file) {
            this.showToast('请先上传方案 PDF', true);
            this.syncNewProjectModalFooter();
            return;
          }
          if (st.previewLoading) {
            this.showToast('正在识别，请稍候', true);
            return;
          }
          if (!name) {
            this.showToast('请填写项目名称', true);
            this.syncNewProjectModalFooter();
            return;
          }
          st.projectName = name;
          st.sponsor = sponsor;
          st.metaConfirmed = true;
          st.step = 2;
          document.getElementById('modalDesc').textContent = '选择要生成的文档模板';
          this.renderNewProjectStep2();
          this.syncNewProjectModalFooter();
          return;
        }

        const templateIds = Array.from(document.querySelectorAll('.tpl-check:checked'))
          .map(el => parseInt(el.value, 10))
          .filter(Boolean);
        if (!st.file) {
          this.showToast('请先上传方案 PDF', true);
          return;
        }
        let projectName = (st.projectName || '').trim();
        if (!projectName) {
          projectName = st.file.name.replace(/\.pdf$/i, '').trim();
        }
        if (!projectName) {
          this.showToast('请填写项目名称', true);
          return;
        }
        if (!templateIds.length) {
          this.showToast('请至少勾选一个已映射的模板', true);
          return;
        }
        this.closeModal();
        this.showToast('正在创建项目...');
        const proj = await API.createProject(
          projectName,
          st.sponsor || '',
          templateIds,
          st.file
        );
        history.replaceState({}, '', `${location.pathname}?project=${proj.id}`);
        this.state.projects = [
          { id: proj.id, name: projectName, sponsor: st.sponsor || '', status: 'extracting', updated_at: '' },
          ...this.state.projects.filter(p => p.id !== proj.id),
        ];
        this._projectGuideBanner = null;
        this._projectExtracting = true;
        await this.openProjectDetail(proj.id, { step: 2, keepStep: true });
        this.showToast('正在从 PDF 提取字段…');
        let fieldCount = 0;
        try {
          const extractRes = await API.extractProject(proj.id);
          fieldCount = (extractRes?.fields || []).length;
        } catch (extractErr) {
          this.showToast(extractErr.message || '字段提取失败', true);
        } finally {
          this._projectExtracting = false;
        }
        await this.refreshAll();
        this._projectGuideBanner = { fieldCount };
        await this.openProjectDetail(proj.id, { step: 2, keepStep: true });
        this.showToast('请审核字段后点击「确认并生成」');
      } else if (type === 'uploadTemplate') {
        const st = this._uploadTemplateModal;
        const typeVal = document.getElementById('tplType')?.value;
        const file = st?.file;
        let name = document.getElementById('tplName')?.value.trim();
        if (!file) {
          this.showToast('请选择 .docx 文件', true);
          this.syncUploadTemplateModalFooter();
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
      if (type === 'newProject') this.syncNewProjectModalFooter();
      else if (type === 'uploadTemplate') this.syncUploadTemplateModalFooter();
    }
  },

  closeModal() {
    document.getElementById('modalOverlay')?.classList.remove('show');
    document.querySelector('.modal-box')?.classList.remove('modal-wide');
    this._modalType = null;
    this._newProjectModal = null;
    this._uploadTemplateModal = null;
  },

  _wizardPhaseLabel(phase) {
    const map = {
      preparing: '准备模板与字段',
      filling: '填充占位符',
      quality_check: '质检文档',
      done: '已完成',
      error: '失败',
      pending: '等待中',
      running: '生成中',
    };
    return map[phase] || phase || '处理中';
  },

  inferWizardStep(proj) {
    const s = proj.status;
    if (s === 'done' || s === 'partial') return 4;
    if (s === 'generating') return 3;
    if (s === 'extracting') return 2;
    if (s === 'validating') return 2;
    if (this._wizardStepOverride) return this._wizardStepOverride;
    return 1;
  },

  stopWizardPoll() {
    if (this._wizardPoll) {
      clearInterval(this._wizardPoll);
      this._wizardPoll = null;
    }
  },

  async deleteProject(id, name) {
    if (!confirm(`确认删除项目「${name}」？将同时删除方案 PDF 与已生成文档，且不可恢复。`)) return;
    try {
      await API.deleteProject(id);
      this.stopWizardPoll();
      if (this.state.currentProjectId === id) {
        this.state.currentProjectId = null;
        history.replaceState({}, '', location.pathname);
        this.navigate('projects');
      }
      this.showToast('项目已删除');
      await this.refreshAll();
    } catch (e) {
      this.showToast(e.message, true);
    }
  },

  async openProjectDetail(id, opts = {}) {
    this.state.currentProjectId = id;
    if (opts.step != null) this._wizardStepOverride = opts.step;
    else if (!opts.keepStep) this._wizardStepOverride = null;
    this.navigate('project-detail');
    const body = document.getElementById('projectDetailBody');
    const title = document.getElementById('projectDetailTitle');
    body.innerHTML = '<p class="loading-text">加载中...</p>';

    try {
      const [proj, review] = await Promise.all([
        API.getProject(id),
        API.getProjectReview(id).catch(() => null),
      ]);
      title.textContent = proj.name;
      this._projectReview = review;
      body.innerHTML = this.renderProjectWizard(proj, review);
      this.bindProjectWizardActions(proj, review);
      const step = this.inferWizardStep(proj);
      if (step === 3) this.startWizardPoll(id);
      else this.stopWizardPoll();
    } catch (e) {
      body.innerHTML = `<p class="error-text">${this.escapeHtml(e.message)}</p>`;
    }
  },

  startWizardPoll(projId) {
    this.stopWizardPoll();
    this._wizardPoll = setInterval(async () => {
      try {
        const proj = await API.getProject(projId);
        const step = this.inferWizardStep(proj);
        if (step !== 3) {
          this.stopWizardPoll();
          this._wizardStepOverride = null;
          await this.openProjectDetail(projId);
          return;
        }
        const list = document.getElementById('genProgressList');
        if (list) list.innerHTML = this.renderGenProgressList(proj.generations || []);
      } catch (_) {
        /* ignore poll errors */
      }
    }, 1500);
  },

  renderProjectWizard(proj, review) {
    const step = this.inferWizardStep(proj);
    let guideHtml = '';
    if (this._projectGuideBanner && step === 2) {
      const n = this._projectGuideBanner.fieldCount || 0;
      guideHtml = `
        <div class="project-guide-banner">
          项目已创建，已从 PDF 提取 <strong>${n}</strong> 个字段。
          请优先处理标黄项，核对后点击底部 <strong>确认并生成</strong>。
        </div>`;
      this._projectGuideBanner = null;
    }
    const stepper = `
      <div class="project-wizard-stepper">
        <div class="pw-step ${step >= 1 ? (step > 1 ? 'done' : 'active') : ''}">1. 方案</div>
        <div class="pw-step ${step >= 2 ? (step > 2 ? 'done' : 'active') : ''}">2. 字段审核</div>
        <div class="pw-step ${step >= 3 ? (step > 3 ? 'done' : 'active') : ''}">3. 生成</div>
        <div class="pw-step ${step >= 4 ? 'active' : ''}">4. 完成</div>
      </div>`;

    let panel = '';
    if (step === 1) panel = this.renderWizardStep1(proj);
    else if (step === 2) panel = this.renderWizardStep2(proj, review);
    else if (step === 3) panel = this.renderWizardStep3(proj);
    else panel = this.renderWizardStep4(proj);

    const footer = this.renderWizardFooter(proj, review, step);
    return guideHtml + stepper + panel + footer;
  },

  renderWizardStep1(proj) {
    return `
      <div class="wizard-panel">
        <h4>方案已关联</h4>
        <p class="wp-desc">PDF：<strong>${this.escapeHtml(proj.pdf_filename || '')}</strong><br>
        申办方：${this.escapeHtml(proj.sponsor || '—')}</p>
        <p class="wp-desc">下一步：审核从方案中提取的字段，确认无误后再生成文档。</p>
      </div>`;
  },

  renderWizardStep2(proj, review) {
    if (proj.status === 'extracting' || this._projectExtracting) {
      return `
        <div class="wizard-panel">
          <h4>正在从 PDF 提取字段</h4>
          <p class="wp-desc">请稍候，提取完成后将显示审核表…</p>
        </div>`;
    }
    const summary = review?.summary || { missing: 0, needs_review: 0, auto_ok: 0, total: 0, can_confirm: false };
    const fields = review?.fields || proj.fields || [];
    const active = fields.filter(f => f.review_status !== 'auto_ok');
    const collapsed = fields.filter(f => f.review_status === 'auto_ok');

    const statusLabel = { missing: '缺失', needs_review: '待确认', auto_ok: '已通过' };
    const activeRows = active.map(f => this.renderReviewTableRow(f, statusLabel)).join('');
    const collapsedRows = collapsed.map(f => this.renderReviewTableRow(f, statusLabel)).join('');

    return `
      <div class="review-summary-bar">
        <div class="rsb-counts">
          <strong>字段审核</strong> · 共 ${summary.total || fields.length} 项
          · <span class="review-badge review-badge-missing" data-rsb="missing">${summary.missing || 0} 缺失</span>
          · <span class="review-badge review-badge-needs_review" data-rsb="needs_review">${summary.needs_review || 0} 待确认</span>
          · <span class="review-badge review-badge-auto_ok" data-rsb="auto_ok">${summary.auto_ok || 0} 已通过</span>
          <div class="rsb-hint">请优先处理缺失与待确认项；高置信度字段已折叠在下方。</div>
          <div class="review-batch-actions">
            <button type="button" class="btn btn-outline btn-xs" id="btnAdoptAllReviewSugs">采纳全部有建议的字段</button>
          </div>
        </div>
      </div>
      <div class="review-table-wrap">
        <table class="review-table">
          <thead><tr>
            <th>状态</th><th>字段</th><th>当前值</th><th>置信度</th>
            <th>AI 建议</th><th>依据</th><th></th>
          </tr></thead>
          <tbody>${activeRows || '<tr><td colspan="7" class="empty-text">暂无待处理字段</td></tr>'}</tbody>
        </table>
      </div>
      ${collapsed.length ? `
        <details class="wizard-collapsed">
          <summary>已通过 ${collapsed.length} 项（点击展开）</summary>
          <div class="review-table-wrap" style="margin-top:8px">
            <table class="review-table"><tbody>${collapsedRows}</tbody></table>
          </div>
        </details>` : ''}`;
  },

  renderReviewTableRow(f, statusLabel) {
    const cls = f.review_status === 'missing' ? 'row-missing'
      : (f.review_status === 'needs_review' ? 'row-needs_review' : '');
    const sug = f.suggestion_note
      ? `${this.escapeHtml(f.suggestion_note)}${f.suggested_value ? `<br><strong>建议值：</strong>${this.escapeHtml(f.suggested_value)}` : ''}`
      : '—';
    const canAdopt = Boolean((f.suggestion_note || '').trim() || (f.suggested_value || '').trim());
    const adopt = canAdopt
      ? `<button type="button" class="btn btn-outline btn-xs rt-adopt" data-key="${this.escapeHtml(f.key)}">采纳建议</button>`
      : '';
    return `
      <tr class="${cls}" data-review-key="${this.escapeHtml(f.key)}">
        <td><span class="review-badge review-badge-${f.review_status}">${statusLabel[f.review_status] || f.review_status}</span></td>
        <td>${this.escapeHtml(f.label || f.key)}${f.required ? '<span class="req">*</span>' : ''}</td>
        <td><textarea class="rt-value" rows="2" data-key="${this.escapeHtml(f.key)}">${this.escapeHtml(f.value || '')}</textarea></td>
        <td>${Math.round((f.confidence || 0) * 100)}%</td>
        <td class="rt-suggestion">${sug}</td>
        <td class="rt-snippet">${this.escapeHtml(f.source_snippet || '—')}</td>
        <td>${adopt}</td>
      </tr>`;
  },

  renderGenProgressList(generations) {
    if (!generations?.length) {
      return '<p class="empty-text">未配置模板</p>';
    }
    return generations.map(g => {
      const st = g.status || 'pending';
      const cls = st === 'done' ? 'done' : (st === 'error' ? 'error' : 'running');
      const phase = g.phase || st;
      const bar = (st === 'running' || st === 'pending')
        ? '<div class="gen-progress-bar"><span></span></div>' : '';
      const action = st === 'done'
        ? `<a class="btn btn-primary btn-xs" href="${API.downloadUrl(this.state.currentProjectId, g.template_id)}" download>下载</a>`
        : (st === 'error' ? `<span class="gen-msg">${this.escapeHtml(g.message || '失败')}</span>` : '');
      return `
        <div class="gen-progress-item ${cls}">
          <div class="gen-progress-head">
            <span class="tpl-type-pill">${this.escapeHtml(g.template_type || '')}</span>
            <span>${this.escapeHtml(g.template_name || '')}</span>
          </div>
          ${bar}
          <div class="gen-progress-phase">${this.escapeHtml(this._wizardPhaseLabel(phase))} — ${this.escapeHtml(g.message || '')}</div>
          <div style="margin-top:8px">${action}</div>
        </div>`;
    }).join('');
  },

  renderWizardStep3(proj) {
    return `
      <div class="wizard-panel">
        <h4>正在生成文档</h4>
        <p class="wp-desc">请勿关闭页面；系统正在为每个所选模板填充占位符并质检，通常需数十秒。</p>
        <div class="gen-progress-list" id="genProgressList">
          ${this.renderGenProgressList(proj.generations || [])}
        </div>
      </div>`;
  },

  renderWizardStep4(proj) {
    const gens = proj.generations || [];
    const cards = gens.map(g => {
      const q = g.quality_grade
        ? `等级 ${g.quality_grade} · 填充率 ${Math.round((g.fill_rate || 0) * 100)}%`
        : (g.message || '');
      const dl = g.status === 'done'
        ? `<a class="btn btn-primary btn-sm" href="${API.downloadUrl(proj.id, g.template_id)}" download>下载 ${this.escapeHtml(g.template_type || '')}</a>`
        : `<span class="error-text">${this.escapeHtml(g.message || '生成失败')}</span>`;
      return `<div class="generation-card gen-done" style="margin-bottom:10px">
        <div class="gc-head"><span class="tpl-type-pill">${this.escapeHtml(g.template_type || '')}</span>
        <span class="gc-name">${this.escapeHtml(g.template_name || '')}</span></div>
        <div class="gc-quality">${this.escapeHtml(q)}</div>
        <div class="gc-action" style="margin-top:8px">${dl}</div>
      </div>`;
    }).join('');

    return `
      <div class="complete-banner">
        <h4>文档已生成</h4>
        <p>请下载 Word 文档并在申办方模板要求下做最终医学与合规核对。</p>
        <ul class="complete-next-steps">
          <li>下载下方各模板对应的 .docx 文件</li>
          <li>在 Word 中检查残留占位符与表格格式</li>
          <li>可将本方案 PDF 导入知识库以提升后续项目提取准确率</li>
          <li>返回工作台查看其他项目</li>
        </ul>
      </div>
      ${cards}`;
  },

  renderWizardFooter(proj, review, step) {
    const summary = review?.summary || {};
    let hint = '';
    let primaryLabel = '';
    let primaryId = 'wizardPrimary';
    let primaryDisabled = false;
    let showSecondary = false;

    if (step === 1) {
      hint = '确认方案后进入字段审核';
      primaryLabel = '进入字段审核';
    } else if (step === 2) {
      if (proj.status === 'extracting') {
        hint = '正在提取字段…';
        primaryLabel = '提取中…';
        primaryDisabled = true;
      } else {
        const missing = summary.missing || 0;
        hint = missing
          ? `还有 ${missing} 项必填缺失，请补全后再生成`
          : '核对字段后点击确认并生成文档';
        const tplLabel = (proj.generations || [])
          .map(g => g.template_type)
          .filter(Boolean)
          .join(' / ');
        primaryLabel = tplLabel
          ? `确认并生成 ${tplLabel}`
          : '确认并生成文档';
        primaryDisabled = (summary.missing || 0) > 0;
      }
      showSecondary = true;
    } else if (step === 3) {
      hint = '生成完成后将自动进入下载步骤';
      primaryLabel = '生成中…';
      primaryDisabled = true;
    } else {
      hint = '可下载文档或返回工作台';
      primaryLabel = '返回工作台';
    }

    return `
      <div class="wizard-footer">
        <div class="wizard-footer-hint">${this.escapeHtml(hint)}</div>
        <div class="wizard-footer-actions">
          ${showSecondary ? '<button type="button" class="btn btn-outline btn-sm" id="wizardReExtract">重新提取</button>' : ''}
          ${step < 4 && step > 1 ? '<button type="button" class="btn btn-outline btn-sm" id="wizardBackStep">上一步</button>' : ''}
          <button type="button" class="btn btn-primary btn-sm" id="${primaryId}"
            style="background:var(--brand)" ${primaryDisabled ? 'disabled' : ''}>${this.escapeHtml(primaryLabel)}</button>
        </div>
      </div>`;
  },

  collectReviewFieldsFromDOM() {
    const schemaByKey = {};
    (this.state.fieldSchema || []).forEach(d => { schemaByKey[d.key] = d; });
    return Array.from(document.querySelectorAll('.rt-value')).map(ta => {
      const key = ta.dataset.key;
      const defn = schemaByKey[key] || { label: key, required: false };
      const row = ta.closest('tr');
      const snippet = row?.querySelector('.rt-snippet')?.textContent?.replace(/^—$/, '') || '';
      const orig = (this._projectReview?.fields || []).find(f => f.key === key);
      return {
        key,
        label: defn.label || key,
        value: ta.value || '',
        confidence: orig?.confidence ?? 0.8,
        source_snippet: orig?.source_snippet || snippet,
        required: defn.required !== false,
      };
    });
  },

  classifyReviewFieldClient(field) {
    const value = (field.value || '').trim();
    if (field.required && !value) return 'missing';
    if (!value || (field.confidence || 0) < 0.75) return 'needs_review';
    return 'auto_ok';
  },

  computeReviewSummaryFromDOM() {
    const fields = this.collectReviewFieldsFromDOM();
    const summary = { missing: 0, needs_review: 0, auto_ok: 0, total: fields.length, can_confirm: true };
    fields.forEach(f => {
      const status = this.classifyReviewFieldClient(f);
      summary[status] = (summary[status] || 0) + 1;
    });
    summary.can_confirm = summary.missing === 0;
    return { fields, summary };
  },

  syncReviewSummaryBar(summary) {
    const labels = {
      missing: `${summary.missing || 0} 缺失`,
      needs_review: `${summary.needs_review || 0} 待确认`,
      auto_ok: `${summary.auto_ok || 0} 已通过`,
    };
    Object.entries(labels).forEach(([key, text]) => {
      const el = document.querySelector(`[data-rsb="${key}"]`);
      if (el) el.textContent = text;
    });
  },

  syncReviewRowStatus(key) {
    const fields = this.collectReviewFieldsFromDOM();
    const f = fields.find(x => x.key === key);
    if (!f) return;
    const status = this.classifyReviewFieldClient(f);
    const statusLabel = { missing: '缺失', needs_review: '待确认', auto_ok: '已通过' };
    const row = document.querySelector(`tr[data-review-key="${key}"]`);
    if (!row) return;
    row.classList.remove('row-missing', 'row-needs_review');
    if (status === 'missing') row.classList.add('row-missing');
    else if (status === 'needs_review') row.classList.add('row-needs_review');
    const badge = row.querySelector('.review-badge');
    if (badge) {
      badge.className = `review-badge review-badge-${status}`;
      badge.textContent = statusLabel[status] || status;
    }
  },

  syncWizardReviewFooter(proj) {
    const step = this.inferWizardStep(proj);
    if (step !== 2) return;

    const btn = document.getElementById('wizardPrimary');
    const hintEl = document.querySelector('.wizard-footer-hint');
    if (!btn || !hintEl) return;

    if (proj.status === 'extracting' || this._projectExtracting) {
      btn.disabled = true;
      hintEl.textContent = '正在提取字段…';
      hintEl.classList.add('is-blocked');
      return;
    }

    const { summary } = this.computeReviewSummaryFromDOM();
    this.syncReviewSummaryBar(summary);

    const missing = summary.missing || 0;
    btn.disabled = missing > 0;
    hintEl.textContent = missing
      ? `还有 ${missing} 项必填缺失，请补全后再生成`
      : '核对字段后点击确认并生成文档';
    hintEl.classList.toggle('is-blocked', missing > 0);
  },

  applyReviewFieldAdopt(field) {
    const ta = document.querySelector(`.rt-value[data-key="${field.key}"]`);
    if (!ta) return false;

    const suggested = (field.suggested_value || '').trim();
    const note = (field.suggestion_note || '').trim();
    const apiStatus = field.review_status;

    if (suggested) {
      ta.value = field.suggested_value;
      this.syncReviewRowStatus(field.key);
      return true;
    }
    if (note && apiStatus === 'missing') {
      this.showToast('请填写具体字段值，说明文字不能代替必填内容', true);
      this.syncReviewRowStatus(field.key);
      return false;
    }
    if (note) {
      ta.value = field.suggestion_note.trim();
      this.syncReviewRowStatus(field.key);
      return true;
    }
    return false;
  },

  bindProjectWizardActions(proj, review) {
    const step = this.inferWizardStep(proj);
    this._wizardReviewProj = proj;

    document.getElementById('btnAdoptAllReviewSugs')?.addEventListener('click', () => {
      let count = 0;
      (review?.fields || []).forEach(f => {
        const hasVal = (f.suggested_value || '').trim();
        const hasNote = (f.suggestion_note || '').trim();
        if (!hasVal && !hasNote) return;
        if (this.applyReviewFieldAdopt(f)) count += 1;
      });
      this.syncWizardReviewFooter(proj);
      this.showToast(count ? `已采纳 ${count} 项有效字段值` : '暂无可填入的有效建议值');
    });

    document.querySelectorAll('.rt-adopt').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const field = (review?.fields || []).find(f => f.key === key);
        if (!field) return;
        if (this.applyReviewFieldAdopt(field)) {
          this.showToast('已采纳 AI 建议值');
        }
        this.syncWizardReviewFooter(proj);
      });
    });

    document.querySelectorAll('.rt-value').forEach(ta => {
      ta.addEventListener('input', () => {
        this.syncReviewRowStatus(ta.dataset.key);
        this.syncWizardReviewFooter(proj);
      });
    });

    document.getElementById('wizardPrimary')?.addEventListener('click', async () => {
      if (step === 1) {
        this._wizardStepOverride = 2;
        await this.openProjectDetail(proj.id, { keepStep: true });
        return;
      }
      if (step === 2) {
        await this.confirmAndGenerate(proj.id);
        return;
      }
      if (step === 4) {
        this.navigate('dashboard');
      }
    });

    document.getElementById('wizardBackStep')?.addEventListener('click', async () => {
      this._wizardStepOverride = Math.max(1, step - 1);
      await this.openProjectDetail(proj.id, { keepStep: true });
    });

    document.getElementById('wizardReExtract')?.addEventListener('click', async () => {
      try {
        this.showToast('正在重新提取…');
        await API.extractProject(proj.id);
        this._wizardStepOverride = 2;
        await this.openProjectDetail(proj.id, { keepStep: true });
        this.showToast('提取完成，请审核字段');
      } catch (e) {
        this.showToast(e.message, true);
      }
    });

    if (step === 2 && proj.status !== 'extracting' && !this._projectExtracting) {
      this.syncWizardReviewFooter(proj);
    }
  },

  async confirmAndGenerate(projId) {
    const { fields, summary } = this.computeReviewSummaryFromDOM();
    if (!fields.length) {
      this.showToast('无字段可保存', true);
      return;
    }
    if ((summary.missing || 0) > 0) {
      const first = fields.find(f => this.classifyReviewFieldClient(f) === 'missing');
      this.showToast(
        `请先补全必填项：${first?.label || first?.key || '未知字段'}`,
        true
      );
      this.syncWizardReviewFooter(this._wizardReviewProj || { status: 'validating' });
      return;
    }
    try {
      await API.saveFields(projId, fields, { confirmed: true });
      this.showToast('字段已确认，开始生成…');
      await API.generateProject(projId);
      this._wizardStepOverride = 3;
      await this.openProjectDetail(projId, { keepStep: true });
    } catch (e) {
      this.showToast(e.message, true);
    }
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
      const suggestions = tpl.mapping_suggestions || {};
      this._currentMappingSuggestions = suggestions;
      const stats = this.computeMappingStats(tpl);
      const placeholders = tpl.placeholders_list || [];
      const suggestPhs = placeholders.filter(ph => (suggestions[ph.name] || {}).field_key);
      const manualPhs = placeholders.filter(ph => !(suggestions[ph.name] || {}).field_key);
      const suggestRows = suggestPhs.map(ph =>
        this.renderMappingTableRow(ph, suggestions, tpl.mappings, schema)
      ).join('');
      const manualRows = manualPhs.map(ph =>
        this.renderMappingTableRow(ph, suggestions, tpl.mappings, schema)
      ).join('');
      const phRows = suggestRows + manualRows;

      const sectionsHtml = (tpl.sections_list || []).slice(0, 12).map(s =>
        `<li>${this.escapeHtml(s.number || '')} ${this.escapeHtml(s.title || '')}</li>`
      ).join('');

      const phCount = (tpl.placeholders_list || []).length;
      const mappedCount = (tpl.placeholders_list || []).filter(
        ph => tpl.mappings?.[ph.name]
      ).length;
      const pendingReview = (tpl.placeholders_list || []).filter(ph => {
        const sug = suggestions[ph.name] || {};
        return sug.requires_review && !tpl.mappings?.[ph.name];
      }).length;
      const ready = tpl.mappings_complete;
      const bannerClass = ready ? 'banner-ok' : 'banner-warn';
      const bannerTitle = ready
        ? '模板已可用于项目生成'
        : '模板已上传，请确认占位符映射（黄色项需人工确认）';
      const bannerDesc = phCount
        ? `已识别 ${tpl.sections} 章节 / ${phCount} 占位符 · 已映射 ${mappedCount} / ${phCount}${pendingReview ? ` · ${pendingReview} 项待确认` : ''}`
        : `已识别 ${tpl.sections} 章节 · 未发现占位符，请在 docx 中使用 {{field_key}} 或 <项目名称> 格式`;

      const wizardPanel = !ready && phCount ? `
        <div class="mapping-wizard-panel" id="mappingWizardSummary">
          <div class="mapping-wizard-stats">
            占位符 <strong>${stats.total}</strong> 个 ·
            已映射 <strong>${stats.auto_mapped}</strong> ·
            可一键采纳 <strong>${stats.suggest_adoptable}</strong> ·
            需人工 <strong>${stats.manual_only}</strong>
          </div>
          <div class="mapping-wizard-actions">
            <button type="button" class="btn btn-primary btn-sm" id="btnAutoMapAndSave" style="background:var(--teal)">一键完成可自动项并保存</button>
            <button type="button" class="btn btn-outline btn-sm" id="btnScrollMappingTable">进入逐项核对</button>
          </div>
        </div>` : '';

      body.innerHTML = `
        <div class="confirm-banner ${bannerClass}">
          <div class="cb-text">
            <h4>${bannerTitle}</h4>
            <p>${bannerDesc}</p>
          </div>
        </div>
        ${wizardPanel}
        <p class="detail-meta">${this.escapeHtml(tpl.desc || '')}</p>
        <div class="detail-actions">
          <button class="btn btn-primary btn-sm" id="btnSaveMappings" style="background:var(--teal)">保存映射并启用</button>
          <button class="btn btn-outline btn-sm" id="btnAdoptAllMappingSugs">采纳全部可映射建议</button>
          <button class="btn btn-outline btn-sm" id="btnReupload">重新上传</button>
          <button class="btn btn-danger btn-sm" id="btnDeleteTpl">删除模板</button>
        </div>
        <div class="mapping-grid">
          <div class="sections-preview"><h4>章节预览</h4><ul>${sectionsHtml || '<li>无章节</li>'}</ul></div>
          <div class="mapping-table-wrap" id="mappingTableWrap">
            <h4>占位符映射</h4>
            ${suggestPhs.length ? `<div class="mapping-table-section-title">建议映射（有 AI 字段建议）</div>
            <table class="mapping-table"><thead><tr><th>占位符</th><th>上下文</th><th>状态</th><th>AI 建议</th><th>字段</th><th>操作</th></tr></thead><tbody>${suggestRows}</tbody></table>` : ''}
            ${manualPhs.length ? `<div class="mapping-table-section-title">说明性占位（需人工选择或保留模板说明）</div>
            <table class="mapping-table"><thead><tr><th>占位符</th><th>上下文</th><th>状态</th><th>AI 建议</th><th>字段</th><th>操作</th></tr></thead><tbody>${manualRows}</tbody></table>` : ''}
            ${!phCount ? '<p class="empty-text">未发现占位符，请在 docx 中使用 {{field_key}} 或 &lt;项目名称&gt; 格式</p>' : ''}
          </div>
        </div>`;

      document.querySelectorAll('.mapping-select').forEach(sel => {
        const ph = sel.dataset.ph;
        if (tpl.mappings?.[ph]) sel.value = tpl.mappings[ph];
        sel.addEventListener('change', () => {
          this.updateMappingRowStatus(sel.closest('tr'), sel.value);
        });
      });

      document.querySelectorAll('.mapping-adopt').forEach(btn => {
        btn.addEventListener('click', () => {
          const row = btn.closest('tr');
          const sel = row?.querySelector('.mapping-select');
          const fk = btn.dataset.fieldKey;
          if (!sel || !fk) return;
          sel.value = fk;
          row.classList.remove('mapping-row-warn');
          row.classList.add('mapping-row-adopted');
          this.updateMappingRowStatus(row, fk);
          this.showToast('已采纳映射建议');
        });
      });

      const adoptAllMappable = (minConf = 0.75) => {
        let count = 0;
        document.querySelectorAll('.mapping-select').forEach(sel => {
          const ph = sel.dataset.ph;
          const sug = suggestions[ph] || {};
          if (!sug.field_key || (sug.confidence || 0) < minConf) return;
          sel.value = sug.field_key;
          const row = sel.closest('tr');
          row?.classList.remove('mapping-row-warn');
          row?.classList.add('mapping-row-adopted');
          this.updateMappingRowStatus(row, sug.field_key);
          count += 1;
        });
        return count;
      };

      document.getElementById('btnAdoptAllMappingSugs')?.addEventListener('click', () => {
        const count = adoptAllMappable(0.75);
        this.showToast(count ? `已采纳 ${count} 项映射建议（请保存）` : '暂无可自动采纳的映射');
      });

      document.getElementById('btnAutoMapAndSave')?.addEventListener('click', async () => {
        const count = adoptAllMappable(0.75);
        if (!count && stats.auto_mapped === stats.total) {
          this.showToast('映射已完整，正在保存…');
        } else if (!count) {
          this.showToast('没有可自动采纳的项，请在下方表格手动选择', true);
          return;
        }
        await this.saveTemplateMappingsFromDOM(id, tpl.name);
      });

      document.getElementById('btnScrollMappingTable')?.addEventListener('click', () => {
        document.getElementById('mappingTableWrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      document.getElementById('btnSaveMappings')?.addEventListener('click', async () => {
        const mappings = {};
        const missing = [];
        document.querySelectorAll('.mapping-select').forEach(sel => {
          const ph = sel.dataset.ph;
          if (sel.value) mappings[ph] = sel.value;
          else if (ph) missing.push(ph);
        });
        if (missing.length) {
          this.showToast(`还有 ${missing.length} 个占位符未映射`, true);
          return;
        }
        await this.saveTemplateMappingsFromDOM(id, tpl.name);
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
          <button type="button" class="btn btn-outline btn-xs pi-delete" data-proj-delete="${p.id}" title="删除项目">删除</button>
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
      list.querySelectorAll('[data-proj-delete]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = parseInt(btn.dataset.projDelete, 10);
          const p = this.state.projects.find(x => x.id === id);
          await this.deleteProject(id, p?.name || '该项目');
        });
      });
    });

    this.renderDashboardTodos();
  },

  renderDashboardTodos() {
    const wrap = document.getElementById('dashboardNextActions');
    const list = document.getElementById('dashboardTodoList');
    const emptyBanner = document.getElementById('dashboardEmptyState');
    if (!wrap || !list) return;

    const todos = [];
    for (const p of this.state.projects) {
      if (p.status === 'validating') {
        todos.push({
          priority: 0,
          label: `${p.name}：待审核字段`,
          badge: '继续',
          action: () => {
            history.replaceState({}, '', `${location.pathname}?project=${p.id}`);
            this.openProjectDetail(p.id);
          },
        });
      } else if (p.status === 'generating') {
        todos.push({
          priority: 0,
          label: `${p.name}：正在生成文档…`,
          badge: '查看进度',
          action: () => {
            history.replaceState({}, '', `${location.pathname}?project=${p.id}`);
            this.openProjectDetail(p.id);
          },
        });
      } else if (p.status === 'extracting') {
        todos.push({
          priority: 0,
          label: `${p.name}：正在提取字段…`,
          badge: '查看',
          action: () => {
            history.replaceState({}, '', `${location.pathname}?project=${p.id}`);
            this.openProjectDetail(p.id);
          },
        });
      }
    }
    for (const t of this.state.templates) {
      if (!t.mappings_complete) {
        const n = t.placeholders || 0;
        todos.push({
          priority: 1,
          label: `${t.name}：${n} 个占位符待映射`,
          badge: '去映射',
          action: () => {
            history.replaceState({}, '', `${location.pathname}?template=${t.id}`);
            this.openTemplateDetail(t.id);
          },
        });
      }
    }
    todos.sort((a, b) => a.priority - b.priority);

    const hasProjects = this.state.projects.length > 0;
    const hasTodos = todos.length > 0;
    wrap.hidden = !hasProjects && !hasTodos;
    if (!hasProjects && !hasTodos) {
      if (emptyBanner) emptyBanner.hidden = false;
      list.innerHTML = '';
      return;
    }
    if (emptyBanner) emptyBanner.hidden = hasTodos || hasProjects;

    if (!hasTodos) {
      list.innerHTML = '<li class="empty-text" style="padding:8px 0">暂无待办，可新建项目或上传模板</li>';
      return;
    }

    list.innerHTML = todos.slice(0, 5).map((t, i) => `
      <li class="dashboard-todo-item" data-todo-idx="${i}">
        <span class="dashboard-todo-label">${this.escapeHtml(t.label)}</span>
        <span class="dashboard-todo-badge">${this.escapeHtml(t.badge)}</span>
      </li>`).join('');

    list.querySelectorAll('.dashboard-todo-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.todoIdx, 10);
        todos[idx]?.action?.();
      });
    });
  },

  renderOutcomeBanner(hostId, { variant = 'teal', title, body, actions = [] }) {
    const host = document.getElementById(hostId);
    if (!host) return;
    const vClass = variant === 'amber' ? 'outcome-banner-amber' : 'outcome-banner-teal';
    const actionHtml = actions.map((a, i) => {
      const cls = a.primary ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm';
      return `<button type="button" class="${cls}" data-outcome-action="${i}">${this.escapeHtml(a.label)}</button>`;
    }).join('');
    host.innerHTML = `
      <div class="outcome-banner ${vClass}">
        <div class="outcome-banner-body">
          <h4>${this.escapeHtml(title)}</h4>
          <p>${this.escapeHtml(body)}</p>
        </div>
        <div class="outcome-banner-actions">
          ${actionHtml}
          <button type="button" class="outcome-banner-close" data-outcome-action="close" aria-label="关闭">×</button>
        </div>
      </div>`;

    host.querySelectorAll('[data-outcome-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.outcomeAction;
        if (key === 'close' || key === 'dismiss') {
          host.innerHTML = '';
          return;
        }
        const idx = parseInt(key, 10);
        const act = actions[idx];
        if (act?.action === 'new-project') this.openModal('newProject');
        else if (act?.action === 'new-project-from-template') this.openModal('newProject');
        else if (typeof act?.onClick === 'function') act.onClick();
        if (act?.dismissOnClick !== false) host.innerHTML = '';
      });
    });
  },

  computeMappingStats(tpl) {
    if (tpl.mapping_stats) return tpl.mapping_stats;
    const placeholders = tpl.placeholders_list || [];
    const suggestions = tpl.mapping_suggestions || {};
    const mappings = tpl.mappings || {};
    let auto_mapped = 0;
    let suggest_adoptable = 0;
    let manual_only = 0;
    placeholders.forEach(ph => {
      const name = ph.name;
      if (mappings[name]) auto_mapped += 1;
      else if ((suggestions[name] || {}).field_key && ((suggestions[name].confidence || 0) >= 0.75)) {
        suggest_adoptable += 1;
      } else manual_only += 1;
    });
    return {
      total: placeholders.length,
      auto_mapped,
      suggest_adoptable,
      manual_only,
    };
  },

  renderMappingTableRow(ph, suggestions, mappings, schema) {
    const sug = suggestions[ph.name] || {};
    const selected = mappings?.[ph.name] || '';
    const needsReview = sug.requires_review && !selected;
    const rowCls = selected
      ? (needsReview ? 'mapping-row-warn' : 'mapping-row-adopted')
      : 'mapping-row-warn';
    const statusHtml = !selected
      ? '<span class="mapping-status mapping-status-warn">待映射</span>'
      : (needsReview
          ? '<span class="mapping-status mapping-status-warn">需确认</span>'
          : '<span class="mapping-status mapping-status-ok">已确认</span>');
    const opts = schema.map(f =>
      `<option value="${f.key}"${f.key === selected ? ' selected' : ''}>${this.escapeHtml(f.label)} (${f.key})</option>`
    ).join('');
    const confHint = sug.confidence
      ? `<small class="sug-conf">置信 ${Math.round((sug.confidence || 0) * 100)}%</small>`
      : '';
    return `
      <tr class="${rowCls}" data-ph="${this.escapeHtml(ph.name)}">
        <td><code>${this.escapeHtml(ph.name)}</code>${confHint}</td>
        <td class="ph-context">${this.escapeHtml(ph.context || '')}</td>
        <td>${statusHtml}</td>
        <td class="mapping-suggestion-cell">${this.mappingSuggestionCell(sug)}</td>
        <td>
          <select class="mapping-select" data-ph="${this.escapeHtml(ph.name)}">
            <option value="">— 未映射 —</option>
            ${opts}
          </select>
        </td>
        <td class="mapping-action-cell">${this.mappingAdoptCell(sug, ph.name)}</td>
      </tr>`;
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

  mappingSuggestionCell(sug) {
    const note = (sug?.suggestion_note || '').trim();
    if (!note) return '—';
    return `<span class="mapping-suggestion">${this.escapeHtml(note)}</span>`;
  },

  mappingAdoptCell(sug, phName) {
    const fk = (sug?.field_key || '').trim();
    if (fk) {
      return `<button type="button" class="btn btn-outline btn-xs mapping-adopt" data-ph="${this.escapeHtml(phName)}" data-field-key="${this.escapeHtml(fk)}">采纳</button>`;
    }
    if ((sug?.suggestion_note || '').trim()) {
      return '<span class="mapping-adopt-hint">需人工选择</span>';
    }
    return '—';
  },

  updateMappingRowStatus(row, selected) {
    if (!row) return;
    const statusEl = row.querySelector('.mapping-status');
    if (!statusEl) return;
    if (!selected) {
      statusEl.className = 'mapping-status mapping-status-warn';
      statusEl.textContent = '待映射';
      row.classList.add('mapping-row-warn');
      row.classList.remove('mapping-row-adopted');
    } else {
      statusEl.className = 'mapping-status mapping-status-ok';
      statusEl.textContent = '已确认';
      row.classList.remove('mapping-row-warn');
    }
  },

  async saveTemplateMappingsFromDOM(id, tplName) {
    const mappings = {};
    const missing = [];
    document.querySelectorAll('.mapping-select').forEach(sel => {
      const ph = sel.dataset.ph;
      if (sel.value) mappings[ph] = sel.value;
      else if (ph) missing.push(ph);
    });
    if (missing.length) {
      this.showToast(`还有 ${missing.length} 个占位符未映射`, true);
      return;
    }
    try {
      await API.saveMappings(id, mappings);
      sessionStorage.setItem('crogo_lastMappedTemplateId', String(id));
      this.showToast('模板已保存，可在新建项目时勾选');
      await this.refreshAll();
      await this.openTemplateDetail(id);
      const host = document.getElementById('templateDetailBody');
      if (host) {
        const bannerHost = document.createElement('div');
        bannerHost.id = 'tplSaveOutcome';
        host.insertBefore(bannerHost, host.firstChild);
        this.renderOutcomeBanner('tplSaveOutcome', {
          variant: 'teal',
          title: `「${tplName || '模板'}」映射已保存`,
          body: '模板已可用于新建项目，勾选后即可生成文档。',
          actions: [
            { label: '去新建项目', primary: true, action: 'new-project' },
            { label: '知道了', action: 'dismiss' },
          ],
        });
      }
    } catch (e) {
      this.showToast(e.message, true);
    }
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

  /* ── Engine Integration ── */
  initEngine() {
    if (typeof CrogoEngine === 'undefined') return;
    this.engine = CrogoEngine.createEngine();

    document.getElementById('runPipelineBtn')?.addEventListener('click', () => this.runPipeline());
  },

  async runPipeline() {
    if (!this.engine) return;

    const setStep = (n, status, text) => {
      const el = document.getElementById(`pipeStep${n}`);
      const statusEl = document.getElementById(`pipeStatus${n}`);
      el.className = 'pipe-step';
      statusEl.className = 'pipe-status';
      if (status === 'active') { el.classList.add('active'); statusEl.classList.add('running'); }
      else if (status === 'done') { el.classList.add('done'); statusEl.classList.add('ok'); }
      else statusEl.classList.add('idle');
      statusEl.textContent = text;
    };

    // Reset all
    for (let i = 1; i <= 4; i++) setStep(i, 'idle', '等待执行');

    const btn = document.getElementById('runPipelineBtn');
    btn.disabled = true;
    btn.textContent = '⏳ 运行中...';

    try {
      // Mock knowledge context
      const knowledgeContext = {
        fieldValues: {
          protocol_info: { project_name: '评估伊立替康脂质体治疗胰腺癌的有效性和安全性临床研究' },
          design: { study_type: 'RWS（真实世界研究）', sample_size: '240例' },
          endpoint: { primary: '总生存期（OS）', safety: 'TEAE/SAE' },
          sponsor: { name: '恒瑞医药' },
          timeline: { interim: '入组50%时' },
        },
        knowledgeEntries: []
      };

      // Existing mapping rules
      const existingRules = [
        { placeholderKey: '<项目名称>', knowledgeSource: 'protocol_info.project_name', templateType: 'DMC', confidence: 0.95, strategy: 'direct' },
        { placeholderKey: '<申办方>', knowledgeSource: 'sponsor.name', templateType: 'DMC', confidence: 0.92, strategy: 'direct' },
      ];

      setStep(1, 'active', '解析中...');
      await sleep(400);
      const schema = this.engine.parser.parse('DMC Charter v2.1', 'DMC');
      setStep(1, 'done', '✓ 解析完成');

      setStep(2, 'active', '检索中...');
      await sleep(400);
      setStep(2, 'done', '✓ 检索完成');

      setStep(3, 'active', '映射中...');
      await sleep(400);
      this.engine.mapper.loadRules(existingRules);
      const mappings = await this.engine.mapper.resolve(schema, knowledgeContext);
      setStep(3, 'done', `✓ ${mappings.length} 项映射`);

      setStep(4, 'active', '生成 + 质检...');
      await sleep(400);
      const report = await this.engine.generator.generate(schema, mappings, knowledgeContext);
      setStep(4, 'done', `✓ 等级 ${report.overall.grade}`);

      // Render results
      this._renderSchema(schema);
      this._renderRules(this.engine.mapper.rules);
      this._renderReport(report);
      this._renderMappings(mappings, schema);

      this.showToast(`管线执行完成 — 填充率 ${(report.overall.fillRate * 100).toFixed(0)}%，等级 ${report.overall.grade}`);

    } catch (err) {
      this.showToast('管线执行失败: ' + err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = '▶ 运行管线';
    }
  },

  _renderSchema(schema) {
    const el = document.getElementById('schemaViewer');
    document.getElementById('schemaName').textContent = `· ${schema.name} (${schema.type} v${schema.version})`;

    el.innerHTML = schema.chapters.map(ch => `
      <div style="margin-bottom:12px">
        <div style="font-weight:600;font-size:13px;color:var(--text-sec);margin-bottom:4px">
          第${ch.number}章 ${ch.title}
          <span style="font-weight:400;color:var(--text-ter);font-size:10px;margin-left:6px">${ch.sections.length} 节 · ${ch.placeholders.length} 占位符</span>
        </div>
        ${ch.sections.map(sec => `
          <div style="padding-left:16px;margin-bottom:3px;font-size:11px;color:var(--text-sec)">
            ${ch.number}.${sec.number} ${sec.title}
            ${sec.placeholders.length ? `<span style="color:var(--text-ter);font-size:10px"> · 占位符: ${sec.placeholders.map(p => `<code style="background:#f1f5f9;padding:0 4px;border-radius:3px;font-size:10px">${this.escapeHtml(p.raw)}</code>`).join(' ')}</span>` : ''}
          </div>
        `).join('')}
      </div>
    `).join('') + `
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9;font-size:11px;color:var(--text-ter)">
        总计: ${schema.metadata.totalSections} 节 · ${schema.metadata.totalPlaceholders} 个占位符
      </div>
    `;
  },

  _renderRules(rules) {
    const el = document.getElementById('rulesViewer');
    if (!rules.length) {
      el.innerHTML = '<div class="empty-state" style="padding:20px"><p>暂无规则</p></div>';
      return;
    }
    const strategies = { direct: '精确', semantic: '语义', ai_fallback: 'AI推理', rule: '规则推理' };
    el.innerHTML = rules.map(r => `
      <div class="mapping-row">
        <code style="background:#f1f5f9;padding:1px 5px;border-radius:3px;font-size:10px">${this.escapeHtml(r.placeholderKey)}</code>
        <span style="color:var(--text-ter)">→</span>
        <span style="color:var(--text-sec)">${r.knowledgeSource}</span>
        <span class="strategy-badge strategy-${r.strategy}">${strategies[r.strategy] || r.strategy}</span>
        <span style="margin-left:auto;font-size:10px;color:var(--text-ter)">${Math.round(r.confidence * 100)}% · ${r.confirmedCount}次修正</span>
      </div>
    `).join('');
  },

  _renderReport(report) {
    const el = document.getElementById('reportViewer');
    const grades = { S: { label: 'S', color: 'var(--green)' }, A: { label: 'A', color: 'var(--teal)' }, B: { label: 'B', color: 'var(--yellow)' }, C: { label: 'C', color: 'var(--red)' } };
    const g = grades[report.overall.grade] || grades.C;

    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px">
        <div style="font-size:36px;font-weight:800;color:${g.color}">${g.label}</div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;color:var(--text-sec);margin-bottom:2px">填充率 ${(report.overall.fillRate * 100).toFixed(0)}%</div>
          <div style="font-size:10px;color:var(--text-ter)">
            ${report.overall.filled}/${report.overall.totalPlaceholders} 已填充 · ${report.overall.aiGenerated} AI生成 · ${report.overall.requiresReview} 待确认
          </div>
        </div>
      </div>
      ${report.issues.length ? `
        <div style="font-size:11px;font-weight:600;color:var(--text-sec);margin-bottom:6px">问题列表</div>
        ${report.issues.map(iss => `
          <div style="font-size:10px;padding:4px 0;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:6px">
            <span style="color:${iss.severity === 'high' ? 'var(--red)' : 'var(--yellow)'};font-weight:600">●</span>
            <span style="color:var(--text-ter)">第${iss.chapter}章</span>
            <code style="background:#f1f5f9;padding:0 4px;border-radius:3px;font-size:9px">${this.escapeHtml(iss.type)}</code>
            <span>${iss.content}</span>
          </div>
        `).join('')}
      ` : '<div style="font-size:11px;color:var(--green)">✓ 未发现问题</div>'}
      <div style="margin-top:8px;font-size:10px;color:var(--text-ter)">
        格式检查: ${report.formatChecks.alignmentOK ? '✓ 对齐' : '✗ 对齐'} · ${report.formatChecks.fontOK ? '✓ 字体' : '✗ 字体'} · ${report.formatChecks.spacingOK ? '✓ 行距' : '✗ 行距'}
      </div>
    `;
  },

  _renderMappings(mappings, schema) {
    const el = document.getElementById('mappingDetail');
    const sources = { knowledge: '知识精确', ai: 'AI推理', rule: '规则推理', empty: '未填充' };
    const sourceClass = { knowledge: 'direct', ai: 'ai', rule: 'rule', empty: 'empty' };

    // Group by chapter
    const byChapter = {};
    for (const m of mappings) {
      const ch = m.chapter || '0';
      if (!byChapter[ch]) byChapter[ch] = [];
      byChapter[ch].push(m);
    }

    const chapterNames = {};
    for (const ch of schema.chapters) {
      chapterNames[ch.number] = ch.title;
    }

    el.innerHTML = Object.entries(byChapter).map(([chNum, items]) => `
      <div style="margin-bottom:10px">
        <div style="font-size:11px;font-weight:600;color:var(--text-sec);margin-bottom:4px">
          第${chNum}章 ${chapterNames[chNum] || ''}
        </div>
        ${items.map(m => `
          <div class="mapping-row">
            <code style="background:#f1f5f9;padding:1px 5px;border-radius:3px;font-size:10px">${this.escapeHtml(m.placeholderRaw)}</code>
            <span style="color:var(--text-ter)">→</span>
            <span style="${m.source === 'empty' ? 'color:var(--red)' : 'color:var(--text-sec)'}">${this.escapeHtml(m.value || '(未填充)')}</span>
            <span class="strategy-badge strategy-${sourceClass[m.source]}">${sources[m.source] || m.source}</span>
            <span style="margin-left:auto;font-size:10px;color:${m.confidence > 0.7 ? 'var(--green)' : 'var(--yellow)'}">${Math.round(m.confidence * 100)}%</span>
            ${m.requiresReview ? '<span style="font-size:9px;color:var(--yellow);font-weight:600">需确认</span>' : ''}
          </div>
        `).join('')}
      </div>
    `).join('');
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
