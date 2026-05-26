/* ── Crogo Application ── */

const App = {
  state: {
    user: null,
    page: 'dashboard',
    templates: [
      { id: 1, type: 'DMC', name: 'DMC Charter v2.1', desc: '数据监查委员会章程，含职责定义、会议流程、保密协议等标准章节', sections: 36, placeholders: 78, updated: '2024-12' },
      { id: 2, type: 'DMP', name: '数据管理计划 v2.0', desc: '数据管理计划，涵盖数据录入、编码、核对及数据库锁定流程', sections: 28, placeholders: 54, updated: '2024-11' },
      { id: 3, type: 'SAP', name: '统计分析计划 v1.0', desc: '统计分析计划，含统计方法、样本量计算、亚组分析和敏感性分析', sections: 31, placeholders: 63, updated: '2024-11' },
      { id: 4, type: 'CSR', name: '临床研究报告 v1.0', desc: '临床研究报告，按 ICH E3 标准结构组织', sections: 42, placeholders: 95, updated: '2024-10' },
      { id: 5, type: 'ICF', name: '知情同意书 v3.0', desc: '知情同意书，符合 GCP 要求，含风险说明、数据隐私、自愿退出条款', sections: 18, placeholders: 42, updated: '2024-09' },
    ],
    projects: [
      { id: 1, initials: 'R', color: '#0891b2', name: 'RWS-2024-012 · 胰腺癌真实世界研究', sponsor: '恒瑞医药', version: 'v3.2', status: 'progress', updated: '2h 前' },
      { id: 2, initials: 'D', color: '#7c3aed', name: 'DMC Charter · 肝癌双盲 III 期', sponsor: '信达生物', version: 'v2.0', status: 'done', updated: '1d 前' },
      { id: 3, initials: 'S', color: '#d97706', name: 'SAP · 非小细胞肺癌二线治疗', sponsor: '百济神州', version: 'v1.5', status: 'draft', updated: '3d 前' },
    ],
    queries: [
      { text: '胰腺癌 RWS 中伊立替康脂质体的安全监测模式', project: 'RWS-2024-012', results: 2, confidence: 94, status: 'adopted' },
      { text: '肝癌 III 期双盲试验的期中分析停止边界', project: 'DMC-2024-008', results: 3, confidence: 88, status: 'adopted' },
      { text: '非小细胞肺癌二线治疗 OS 终点定义（RECIST 1.1）', project: 'SAP-2024-005', results: 1, confidence: 96, status: 'pending' },
    ]
  },

  init() {
    this.bindLogin();
    this.bindNavigation();
    this.bindUpload();
    this.bindToggle();
    this.bindSearch();
    this.bindActions();
    this.renderTemplates();
    this.renderProjects();
    this.renderQueries();
  },

  /* ── Login ── */
  bindLogin() {
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim() || '测试用户';
      const password = document.getElementById('loginPassword').value.trim();

      this.state.user = { name: email.includes('@') ? email.split('@')[0] : email, role: '管理员' };
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      this.showToast('登录成功，欢迎回来');
    });
  },

  /* ── Navigation ── */
  bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        if (page === 'logout') {
          this.state.user = null;
          document.getElementById('app').style.display = 'none';
          document.getElementById('login-screen').style.display = 'flex';
          document.getElementById('loginEmail').value = '';
          document.getElementById('loginPassword').value = '';
          return;
        }
        this.navigate(page);
      });
    });
  },

  navigate(page) {
    this.state.page = page;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');

    const titles = {
      dashboard: { title: '工作台', crumb: '总览' },
      templates: { title: '模板库', crumb: `${this.state.templates.length} 个模板` },
      knowledge: { title: '知识库', crumb: '1,284 条目' },
      projects:  { title: '项目', crumb: `${this.state.projects.length} 个活跃项目` },
      settings:  { title: '设置', crumb: '系统配置' }
    };
    const info = titles[page];
    document.getElementById('pageTitle').textContent = info.title;
    document.getElementById('breadcrumb').textContent = info.crumb;
  },

  /* ── Upload Zone ── */
  bindUpload() {
    ['dashboardUpload', 'kbUpload'].forEach(id => {
      const zone = document.getElementById(id);
      if (!zone) return;
      const input = zone.querySelector('input[type="file"]');
      ['dragenter', 'dragover'].forEach(evt => {
        zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.add('dragover'); });
      });
      ['dragleave', 'drop'].forEach(evt => {
        zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.remove('dragover'); });
      });
      input.addEventListener('change', function() {
        if (this.files.length > 0) {
          const names = Array.from(this.files).map(f => f.name).join(', ');
          App.showToast(`已接收 ${this.files.length} 个文件`);
          if (id === 'kbUpload') {
            App.showToast('知识库构建已启动...');
            setTimeout(() => App.showToast('知识索引完成 ✓'), 2000);
          }
          this.value = '';
        }
      });
    });
  },

  /* ── Toggle switches ── */
  bindToggle() {
    document.querySelectorAll('.toggle').forEach(t => {
      t.addEventListener('click', () => t.classList.toggle('on'));
    });
  },

  /* ── Search ── */
  bindSearch() {
    document.getElementById('globalSearch').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        this.showToast(`搜索: "${e.target.value.trim()}"`);
        e.target.value = '';
      }
    });
  },

  /* ── Action buttons ── */
  bindActions() {
    // New project
    document.getElementById('newProjectBtn').addEventListener('click', () => {
      this.openModal('newProject');
    });

    // Upload template
    document.getElementById('uploadTemplateBtn').addEventListener('click', () => {
      this.openModal('uploadTemplate');
    });

    // Modal close
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => this.closeModal());
    });

    // Modal overlay click to close
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeModal();
    });
  },

  /* ── Modal System ── */
  openModal(type) {
    const overlay = document.getElementById('modalOverlay');
    const title = document.getElementById('modalTitle');
    const desc = document.getElementById('modalDesc');
    const form = document.getElementById('modalForm');
    const actions = document.getElementById('modalActions');

    if (type === 'newProject') {
      title.textContent = '新建项目';
      desc.textContent = '选择一个模板并上传方案 PDF 开始生成';
      form.innerHTML = `
        <div class="form-group">
          <label>项目名称</label>
          <input type="text" id="projName" placeholder="例：RWS-2024-012" style="width:100%">
        </div>
        <div class="form-group">
          <label>选择模板</label>
          <select id="projTemplate" style="width:100%;padding:9px 12px;border-radius:6px;border:1px solid var(--border);font-size:13px">
            ${this.state.templates.map(t => `<option value="${t.id}">${t.type} — ${t.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>方案 PDF</label>
          <input type="file" accept=".pdf" style="font-size:12px">
        </div>
      `;
      actions.innerHTML = `
        <button class="btn btn-outline btn-sm modal-close-btn" type="button">取消</button>
        <button class="btn btn-primary btn-sm" type="submit" style="background:var(--teal)">创建项目</button>
      `;
    } else if (type === 'uploadTemplate') {
      title.textContent = '上传模板';
      desc.textContent = '上传 .docx 模板文件，系统将自动解析章节结构和占位符';
      form.innerHTML = `
        <div class="form-group">
          <label>模板类型</label>
          <select id="tplType" style="width:100%;padding:9px 12px;border-radius:6px;border:1px solid var(--border);font-size:13px">
            <option value="DMC">DMC — 数据监查委员会章程</option>
            <option value="DMP">DMP — 数据管理计划</option>
            <option value="SAP">SAP — 统计分析计划</option>
            <option value="CSR">CSR — 临床研究报告</option>
            <option value="ICF">ICF — 知情同意书</option>
          </select>
        </div>
        <div class="form-group">
          <label>模板文件 (.docx)</label>
          <input type="file" accept=".docx" style="font-size:12px">
        </div>
      `;
      actions.innerHTML = `
        <button class="btn btn-outline btn-sm modal-close-btn" type="button">取消</button>
        <button class="btn btn-primary btn-sm" type="submit" style="background:var(--teal)">上传并解析</button>
      `;
    }

    overlay.classList.add('show');
    const submitBtn = actions.querySelector('[type="submit"]');
    if (submitBtn) {
      submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeModal();
        this.showToast(type === 'newProject' ? '项目创建成功' : '模板上传成功，正在解析...');
        setTimeout(() => this.showToast('解析完成 ✓'), 1500);
      });
    }
    // Re-bind close buttons since they were recreated
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => this.closeModal());
    });
  },

  closeModal() {
    document.getElementById('modalOverlay').classList.remove('show');
  },

  /* ── Rendering ── */
  renderTemplates() {
    const grid = document.getElementById('templateGrid');
    if (!grid) return;
    grid.innerHTML = this.state.templates.map(t => `
      <div class="template-card">
        <div class="tc-type">${t.type}</div>
        <h4>${t.name}</h4>
        <p>${t.desc}</p>
        <div class="tc-meta">
          <span>${t.sections} 章节</span>
          <span class="dot"></span>
          <span>${t.placeholders} 占位符</span>
          <span class="dot"></span>
          <span>${t.updated}</span>
        </div>
      </div>
    `).join('') + `
      <div class="template-card add-card" id="uploadTemplateBtn2">
        <div class="add-icon">+</div>
        <p style="color:var(--text-ter);margin-bottom:0;">上传新模板</p>
      </div>
    `;
    document.getElementById('uploadTemplateBtn2')?.addEventListener('click', () => this.openModal('uploadTemplate'));
  },

  renderProjects() {
    const statusMap = { done: '已完成', progress: '生成中', draft: '待校验' };
    const statusClass = { done: 'status-done', progress: 'status-progress', draft: 'status-draft' };

    document.querySelectorAll('.project-list').forEach((list, idx) => {
      if (idx === 1) return; // skip projects page
      list.innerHTML = this.state.projects.map(p => `
        <div class="project-item">
          <div class="pi-icon" style="background:${p.color}">${p.initials}</div>
          <div class="pi-info">
            <div class="pi-name">${p.name}</div>
            <div class="pi-meta">
              <span>申办方：${p.sponsor}</span>
              <span>${p.version}</span>
              <span>更新于 ${p.updated}</span>
            </div>
          </div>
          <span class="pi-status ${statusClass[p.status]}">${statusMap[p.status]}</span>
        </div>
      `).join('');
    });

    // Projects page full list
    const fullList = document.getElementById('projectsFullList');
    if (fullList) {
      fullList.innerHTML = this.state.projects.map(p => `
        <div class="project-item">
          <div class="pi-icon" style="background:${p.color}">${p.initials}</div>
          <div class="pi-info">
            <div class="pi-name">${p.name}</div>
            <div class="pi-meta">
              <span>模板：DMC v2.1</span>
              <span>${p.version}</span>
              <span>创建于 ${p.updated}</span>
            </div>
          </div>
          <span class="pi-status ${statusClass[p.status]}">${statusMap[p.status]}</span>
        </div>
      `).join('');
    }
  },

  renderQueries() {
    const list = document.getElementById('queryList');
    if (!list) return;
    list.innerHTML = this.state.queries.map(q => `
      <div class="query-item">
        <div class="qi-icon">◈</div>
        <div class="qi-body">
          <div class="qi-text">${q.text}</div>
          <div class="qi-meta">${q.project} · ${q.results}条结果 · 置信度 ${q.confidence}%</div>
        </div>
        <span class="qi-status" style="background:${q.status === 'adopted' ? 'var(--green-bg)' : 'var(--yellow-bg)'};color:${q.status === 'adopted' ? 'var(--green)' : 'var(--yellow)'}">${q.status === 'adopted' ? '已采纳' : '待确认'}</span>
      </div>
    `).join('');
  },

  /* ── Toast ── */
  showToast(msg) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; }, 2500);
    setTimeout(() => toast.remove(), 3000);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
