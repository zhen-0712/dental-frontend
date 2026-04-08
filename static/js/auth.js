// ===== auth.js - 帳號管理、登入/註冊 =====
import { API_BASE } from './api.js';

const TOKEN_KEY = 'dentalvis_token';
const USER_KEY  = 'dentalvis_user';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function getUser()  {
  const u = localStorage.getItem(USER_KEY);
  try { return u ? JSON.parse(u) : null; } catch { return null; }
}
export function isLoggedIn() { return !!getToken(); }

export function saveAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function apiLogin(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return res.json();
}

export async function apiRegister(email, name, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password })
  });
  return res.json();
}

export function setupAuthUI() {
  const user = getUser();
  const authBtn   = document.getElementById('auth-btn');
  const userLabel = document.getElementById('user-label');
  const userMenu  = document.getElementById('user-menu');

  if (isLoggedIn() && user) {
    if (authBtn)   { authBtn.textContent = '登出'; authBtn.onclick = () => { clearAuth(); location.reload(); }; }
    if (userLabel) { userLabel.textContent = user.name; userLabel.classList.remove('hidden'); }
    if (userMenu)  userMenu.classList.remove('hidden');
  } else {
    if (authBtn)   { authBtn.textContent = '登入'; authBtn.onclick = () => showAuthModal('login'); }
    if (userLabel) userLabel.classList.add('hidden');
    if (userMenu)  userMenu.classList.add('hidden');
  }
}

export function showAuthModal(mode = 'login') {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    switchAuthMode(mode);
  }
}

export function hideAuthModal() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.classList.add('hidden');
}

export function switchAuthMode(mode) {
  const loginForm    = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginTab     = document.getElementById('tab-login');
  const registerTab  = document.getElementById('tab-register');
  if (!loginForm) return;
  if (mode === 'login') {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    loginTab?.classList.add('active');
    registerTab?.classList.remove('active');
  } else {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    loginTab?.classList.remove('active');
    registerTab?.classList.add('active');
  }
}

export function setupAuthForm(onSuccess) {
  const loginBtn    = document.getElementById('login-submit');
  const registerBtn = document.getElementById('register-submit');
  const closeBtn    = document.getElementById('auth-close');
  const overlay     = document.getElementById('auth-overlay');

  closeBtn?.addEventListener('click', hideAuthModal);
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) hideAuthModal(); });

  document.getElementById('tab-login')?.addEventListener('click', () => switchAuthMode('login'));
  document.getElementById('tab-register')?.addEventListener('click', () => switchAuthMode('register'));

  loginBtn?.addEventListener('click', async () => {
    const email    = document.getElementById('login-email')?.value?.trim();
    const password = document.getElementById('login-password')?.value;
    const errEl    = document.getElementById('login-error');
    if (!email || !password) { if (errEl) errEl.textContent = '請填寫所有欄位'; return; }
    loginBtn.disabled = true; loginBtn.textContent = '登入中…';
    const data = await apiLogin(email, password);
    loginBtn.disabled = false; loginBtn.textContent = '登入';
    if (data.token) {
      saveAuth(data.token, data.user);
      hideAuthModal();
      setupAuthUI();
      onSuccess?.();
    } else {
      if (errEl) errEl.textContent = data.detail || '登入失敗';
    }
  });

  registerBtn?.addEventListener('click', async () => {
    const email    = document.getElementById('register-email')?.value?.trim();
    const name     = document.getElementById('register-name')?.value?.trim();
    const password = document.getElementById('register-password')?.value;
    const errEl    = document.getElementById('register-error');
    if (!email || !name || !password) { if (errEl) errEl.textContent = '請填寫所有欄位'; return; }
    registerBtn.disabled = true; registerBtn.textContent = '註冊中…';
    const data = await apiRegister(email, name, password);
    registerBtn.disabled = false; registerBtn.textContent = '註冊';
    if (data.token) {
      saveAuth(data.token, data.user);
      hideAuthModal();
      setupAuthUI();
      onSuccess?.();
    } else {
      if (errEl) errEl.textContent = data.detail || '註冊失敗';
    }
  });
}
