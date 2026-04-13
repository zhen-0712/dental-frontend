// ===== auth.js - 帳號管理、登入/註冊 =====
import { API_BASE } from './api.js';
import { fetchAnalyses } from './history.js';

const TOKEN_KEY = 'dentalvis_token';
const USER_KEY  = 'dentalvis_user';

// ===== Token 管理 =====
export function getToken()  { return localStorage.getItem(TOKEN_KEY); }
export function getUser()   { const u = localStorage.getItem(USER_KEY); return u ? JSON.parse(u) : null; }
export function isLoggedIn(){ return !!getToken(); }

export function saveAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ===== API 呼叫 =====
export async function apiRegister(email, name, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || '註冊失敗');
  return data;
}

export async function apiLogin(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || '登入失敗');
  return data;
}

// ===== Header UI =====
export function renderHeaderUser() {
  const user = getUser();
  const area = document.getElementById('nav-user-area');
  if (!area) return;

  if (user) {
    area.innerHTML = `
      <div class="nav-user">
        <span class="nav-user-name">👋 ${user.name}</span>
        <button class="btn-logout" onclick="window.authLogout()">登出</button>
      </div>
    `;
  } else {
    area.innerHTML = `<button class="btn-login" onclick="window.showAuthModal()">登入 / 註冊</button>`;
  }
}

// ===== Auth Modal =====
export function showAuthModal(defaultTab = 'login') {
  const existing = document.getElementById('auth-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.className = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-modal" id="auth-modal">
      <button class="auth-close" onclick="document.getElementById('auth-overlay').remove()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <h2 class="auth-modal-title">DentalVis</h2>
      <p class="auth-modal-sub">牙齒健康分析系統</p>

      <div class="auth-tabs">
        <div class="auth-tab ${defaultTab==='login'?'active':''}" id="tab-login" onclick="window.switchAuthTab('login')">登入</div>
        <div class="auth-tab ${defaultTab==='register'?'active':''}" id="tab-register" onclick="window.switchAuthTab('register')">註冊</div>
      </div>

      <!-- 登入 -->
      <div id="form-login" style="display:${defaultTab==='login'?'block':'none'}">
        <div class="auth-field">
          <label>Email</label>
          <input class="auth-input" type="email" id="login-email" placeholder="your@email.com">
        </div>
        <div class="auth-field">
          <label>密碼</label>
          <input class="auth-input" type="password" id="login-password" placeholder="••••••••">
        </div>
        <p class="auth-error" id="login-error"></p>
        <button class="btn-primary auth-submit" onclick="window.doLogin()">登入</button>
      </div>

      <!-- 註冊 -->
      <div id="form-register" style="display:${defaultTab==='register'?'block':'none'}">
        <div class="auth-field">
          <label>姓名</label>
          <input class="auth-input" type="text" id="reg-name" placeholder="你的名字">
        </div>
        <div class="auth-field">
          <label>Email</label>
          <input class="auth-input" type="email" id="reg-email" placeholder="your@email.com">
        </div>
        <div class="auth-field">
          <label>密碼</label>
          <input class="auth-input" type="password" id="reg-password" placeholder="至少 8 個字元">
        </div>
        <p class="auth-error" id="reg-error"></p>
        <button class="btn-primary auth-submit" onclick="window.doRegister()">建立帳號</button>
      </div>
    </div>
  `;

  // 點遮罩關閉
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

export function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('form-login').style.display    = tab === 'login' ? 'block' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
}

export async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.classList.remove('visible');

  try {
    const data = await apiLogin(email, password);
    saveAuth(data.token, data.user);
    document.getElementById('auth-overlay').remove();
    renderHeaderUser();
    renderHistorySection();
  } catch(e) {
    errEl.textContent = e.message;
    errEl.classList.add('visible');
  }
}

export async function doRegister() {
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('reg-error');
  errEl.classList.remove('visible');

  if (password.length < 8) {
    errEl.textContent = '密碼至少需要 8 個字元';
    errEl.classList.add('visible');
    return;
  }

  try {
    const data = await apiRegister(email, name, password);
    saveAuth(data.token, data.user);
    document.getElementById('auth-overlay').remove();
    renderHeaderUser();
    renderHistorySection();
  } catch(e) {
    errEl.textContent = e.message;
    errEl.classList.add('visible');
  }
}

export function authLogout() {
  clearAuth();
  renderHeaderUser();
  // 隱藏歷史區塊
  const hist = document.getElementById('history-section');
  if (hist) hist.classList.add('hidden');
}

// ===== 歷史分析區塊 =====
export async function renderHistorySection() {
  const section = document.getElementById('history-section');
  if (!section) return;

  if (!isLoggedIn()) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  const grid = document.getElementById('history-grid');
  grid.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;">載入中...</p>';

  const analyses = await fetchAnalyses();

  if (analyses.length === 0) {
    grid.innerHTML = '<p class="history-empty">尚無分析記錄</p>';
    return;
  }

  window._analyses = analyses;
  grid.innerHTML = analyses.map(a => {
    const typeLabel = a.type === 'init' ? '初始化' : '菌斑分析';
    const typeClass = a.type === 'init' ? 'init' : 'plaque';
    const statusDot = a.status === 'done' ? 'done' : a.status === 'failed' ? 'failed' : 'running';
    const statusText = { done: '完成', failed: '失敗', running: '進行中', queued: '等待中' }[a.status] || a.status;
    const date = new Date(a.created_at).toLocaleString('zh-TW', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });

    let statsHtml = '';
    if (a.type === 'plaque' && a.result?.stats) {
      const s = a.result.stats;
      const ratio = s.plaque_ratio != null ? `${(s.plaque_ratio*100).toFixed(1)}%` : '—';
      const teeth = Object.keys(s.fdi_plaque_summary || {}).length;
      statsHtml = `
        <div class="history-stats">
          <div class="history-stat-item">
            <span class="history-stat-val red">${ratio}</span>
            <span class="history-stat-label">菌斑覆蓋率</span>
          </div>
          <div class="history-stat-item">
            <span class="history-stat-val">${teeth}</span>
            <span class="history-stat-label">有菌斑牙齒</span>
          </div>
        </div>`;
    }

    return `
      <div class="history-card" onclick="window.loadHistoryResult(${a.id}, window._analyses)">
        <div class="history-card-header">
          <span class="history-type-badge ${typeClass}">${typeLabel}</span>
          <div class="history-status">
            <div class="history-status-dot ${statusDot}"></div>
            ${statusText}
          </div>
        </div>
        <p class="history-date">${date}</p>
        ${statsHtml}
      </div>
    `;
  }).join('');
}

export async function loadHistoryResult(analysisId, analyses) {
  // 找到對應的分析記錄
  const analysis = analyses.find(a => a.id === analysisId);
  if (!analysis || analysis.status !== 'done') return;

  const result = analysis.result;
  if (!result) return;

  // 顯示結果區
  const section = document.getElementById('result');
  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth' });

  if (analysis.type === 'plaque' && result.glb_url) {
    // 切換到菌斑模式
    if (typeof window.switchModel === 'function') {
      // 先確保 block-plaque 存在
      const blockPlaque = document.getElementById('block-plaque');
      const blockInit   = document.getElementById('block-init');
      if (blockPlaque) blockPlaque.classList.remove('hidden');
      if (blockInit)   blockInit.classList.add('hidden');

      // 填入菌斑數據
      if (result.stats) {
        const summary = result.stats.fdi_plaque_summary || {};
        const ratioEl = document.getElementById('stat-ratio');
        const teethEl = document.getElementById('stat-plaque-teeth');
        if (ratioEl) ratioEl.textContent = result.stats.plaque_ratio != null
          ? `${(result.stats.plaque_ratio * 100).toFixed(1)}%` : '—';
        if (teethEl) teethEl.textContent = Object.keys(summary).length;
      }
    }

    // 載入 3D 模型
    const frame = document.getElementById('viewer-frame');
    if (frame && result.glb_url) {
      const API = 'http://140.115.51.163:40111';
      const glbUrl = result.glb_url.startsWith('http') ? result.glb_url : `${API}${result.glb_url}`;
      const objUrl = result.obj_url ? (result.obj_url.startsWith('http') ? result.obj_url : `${API}${result.obj_url}`) : '';

      frame.innerHTML = '';
      const mv = document.createElement('model-viewer');
      mv.setAttribute('src', glbUrl);
      mv.setAttribute('camera-controls', '');
      mv.setAttribute('auto-rotate', '');
      mv.setAttribute('shadow-intensity', '0.8');
      mv.setAttribute('crossorigin', 'anonymous');
      mv.style.cssText = 'width:100%;height:100%;background:transparent;';
      frame.appendChild(mv);

      const glbBtn = document.getElementById('btn-download-glb');
      const objBtn = document.getElementById('btn-download-obj');
      if (glbBtn) glbBtn.href = glbUrl;
      if (objBtn && objUrl) objBtn.href = objUrl;
    }
  }
}