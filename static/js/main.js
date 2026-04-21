// ===== main.js - 入口，組合所有模組 =====
import { renderTrendSection } from './trend.js';
import { setupAllPhotoChecks } from './photo_check.js';
import { generateReport } from './report.js';
import { fetchModelStatus, fetchToothData, fetchPlaqueStats, fetchPlaqueRegions, submitInit, submitPlaque, fetchTaskStatus } from './api.js';
import { setupUploads, VIEWS } from './upload.js';
import { showProgress, updateProgress, fadeOutProgress } from './progress.js';
import { showResultSection, switchModel, render3DViewer } from './result.js';
import {
  renderHeaderUser, showAuthModal, switchAuthTab,
  doLogin, doRegister, authLogout,
  isLoggedIn, getToken,
} from './auth.js';
import {
  renderHistorySection, toggleHistoryCard, fetchAnalyses,
  setHistoryFilter, onWeekSelect, onMonthSelect, scrollToHistory,
  toggleHfDropdown, selectHfItem,
} from './history.js';

// ===== State =====
const initFiles   = {};
const plaqueFiles = {};
const state = {
  taskId:       null,
  pollTimer:    null,
  currentMode:  null,
  currentModel: 'base',
  hasBase:      false,
  hasPlaque:    false,
};

// ===== 暴露全域供 HTML onclick =====
window.switchModel      = (mode) => switchModel(mode, state);
window.showAuthModal    = showAuthModal;
window.switchAuthTab    = switchAuthTab;
window.doLogin          = doLogin;
window.doRegister       = doRegister;
window.authLogout       = authLogout;
window.toggleHistoryCard  = toggleHistoryCard;
window.setHistoryFilter   = setHistoryFilter;
window.onWeekSelect       = onWeekSelect;
window.onMonthSelect      = onMonthSelect;
window.scrollToHistory    = scrollToHistory;
window.toggleHfDropdown   = toggleHfDropdown;
window.selectHfItem       = selectHfItem;

// ===== 初始化 =====
renderHeaderUser();
renderHistorySection();
  setupAllPhotoChecks('init');
  setupAllPhotoChecks('plaque');
  fetchAnalyses().then(all => renderTrendSection(all));
checkModelStatus();
setupUploads('init',   initFiles,   'btn-init');
setupUploads('plaque', plaqueFiles, 'btn-plaque');
document.getElementById('btn-init').addEventListener('click',   startInit);
document.getElementById('btn-plaque').addEventListener('click', startPlaque);

// ===== Model Status =====
async function checkModelStatus() {
  try {
    const data = await fetchModelStatus();
    const dot  = document.getElementById('model-status-dot');
    const txt  = document.getElementById('model-status-text');
    if (data.model_ready) {
      dot.className = 'model-status-dot ready';
      txt.textContent = '3D 模型已建立，可直接進行菌斑分析';
      state.hasBase = true;
      loadExistingData();
    } else {
      dot.className = 'model-status-dot not-ready';
      txt.textContent = '尚未建立 3D 模型，請先完成初始化';
    }
  } catch {
    document.getElementById('model-status-text').textContent = '無法連接伺服器';
  }
}

async function loadExistingData() {
  let toothData     = null;
  let plaqueStats   = null;
  let plaqueRegions = null;

  try { toothData = await fetchToothData(); } catch {}
  try {
    plaqueStats = await fetchPlaqueStats();
    if (plaqueStats) state.hasPlaque = true;
  } catch {}
  try { plaqueRegions = await fetchPlaqueRegions(); } catch {}

  window._toothData     = toothData;
  window._plaqueRegions = plaqueRegions;
  showResultSection(toothData, plaqueStats, state, plaqueRegions);
  // 有菌斑結果才顯示報告按鈕
  const reportBtn = document.getElementById('btn-report');
  if (reportBtn && plaqueStats) {
    reportBtn.classList.remove('hidden');
    reportBtn.onclick = () => generateReport(toothData, plaqueStats);
  }
}

// ===== Start Init =====
async function startInit() {
  state.currentMode = 'init';
  document.getElementById('btn-init').disabled = true;
  showProgress('init');
  try {
    const data = await submitInit(initFiles);
    state.taskId = data.task_id;
    poll();
  } catch { showError('無法連接伺服器'); }
}

// ===== Start Plaque =====
async function startPlaque() {
  state.currentMode = 'plaque';
  document.getElementById('btn-plaque').disabled = true;
  showProgress('plaque');
  try {
    const data = await submitPlaque(plaqueFiles);
    state.taskId = data.task_id;
    poll();
  } catch { showError('無法連接伺服器'); }
}

// ===== Poll =====
function poll() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    try {
      const data = await fetchTaskStatus(state.taskId);
      updateProgress(data, state.currentMode);
      if (data.status === 'done') {
        clearInterval(state.pollTimer);
        fadeOutProgress();
        if (state.currentMode === 'init')   state.hasBase   = true;
        if (state.currentMode === 'plaque') {
          state.hasPlaque    = true;
          state.currentModel = 'plaque';
        }
        await loadExistingData();
        renderHistorySection();
        fetchAnalyses().then(all => renderTrendSection(all));
        document.getElementById('result').scrollIntoView({ behavior: 'smooth' });
      } else if (data.status === 'failed') {
        clearInterval(state.pollTimer);
        showError(data.error || '處理失敗，請重試');
      }
    } catch {}
  }, 3000);
}

// ===== Error =====
function showError(msg) {
  document.getElementById('progress-section').innerHTML = `
    <div class="container container-narrow">
      <div class="progress-card" style="border-color:rgba(192,57,43,0.3);">
        <p style="color:#c0392b;font-weight:500;font-size:1.1rem;">處理失敗</p>
        <p style="color:var(--muted);margin-top:0.5rem;">${msg}</p>
        <button class="btn-primary" style="margin-top:1.5rem;" onclick="location.reload()">重新開始</button>
      </div>
    </div>
  `;
}