/* ── Crogo API Client ── */

const API = {
  // 与页面同源时留空即可；仅前后端分离开发时设置 localStorage.crogo_api_base
  base: localStorage.getItem('crogo_api_base') || window.location.origin || 'http://127.0.0.1:8000',

  async request(path, options = {}) {
    const url = `${this.base}${path}`;
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        let msg = res.statusText;
        try {
          const err = await res.json();
          msg = err.detail || err.message || msg;
        } catch (_) {
          const text = await res.text();
          if (text) msg = text;
        }
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) return res.json();
      return res;
    } catch (e) {
      if (e.message === 'Failed to fetch' || e.name === 'TypeError') {
        throw new Error('无法连接后端，请先启动: cd backend && uvicorn main:app --reload --port 8000');
      }
      throw e;
    }
  },

  health() {
    return this.request('/api/health');
  },

  kbStats() {
    return this.request('/api/kb/stats');
  },

  kbIngest(files) {
    const fd = new FormData();
    Array.from(files).forEach(f => fd.append('files', f));
    return this.request('/api/kb/ingest', { method: 'POST', body: fd });
  },

  kbJob(jobId) {
    return this.request(`/api/kb/jobs/${jobId}`);
  },

  kbSearch(q) {
    return this.request(`/api/kb/search?q=${encodeURIComponent(q)}`);
  },

  listTemplates() {
    return this.request('/api/templates');
  },

  getTemplate(id) {
    return this.request(`/api/templates/${id}`);
  },

  uploadTemplate(type, name, file) {
    const fd = new FormData();
    fd.append('type', type);
    fd.append('name', name);
    fd.append('file', file);
    return this.request('/api/templates', { method: 'POST', body: fd });
  },

  saveMappings(tplId, mappings) {
    return this.request(`/api/templates/${tplId}/mappings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings }),
    });
  },

  listProjects() {
    return this.request('/api/projects');
  },

  getProject(id) {
    return this.request(`/api/projects/${id}`);
  },

  createProject(name, sponsor, templateId, file) {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('sponsor', sponsor);
    if (templateId) fd.append('template_id', String(templateId));
    fd.append('file', file);
    return this.request('/api/projects', { method: 'POST', body: fd });
  },

  extractProject(id) {
    return this.request(`/api/projects/${id}/extract`, { method: 'POST' });
  },

  saveFields(id, fields) {
    return this.request(`/api/projects/${id}/fields`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
  },

  generateProject(id) {
    return this.request(`/api/projects/${id}/generate`, { method: 'POST' });
  },

  downloadUrl(id) {
    return `${this.base}/api/projects/${id}/download`;
  },

  fieldSchema() {
    return this.request('/api/fields/schema');
  },
};
