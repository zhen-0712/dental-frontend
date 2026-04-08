// ===== main.js - 入口，組合所有模組 =====
import { fetchModelStatus, fetchToothData, fetchPlaqueStats, fetchPlaqueRegions, submitInit, submitPlaque, fetchTaskStatus } from './api.js';
import { setupUploads, VIEWS } from './upload.js';
import { showProgress, updateProgress, fadeOutProgress } from './progress.js';
import { showResultSection, switchModel, render3DViewer } from './result.js';
import { setupAuthUI, setupAuthForm, showAuthModal, isLoggedIn } from './auth.js';
import { renderHistorySection, fetchAnalyses, toggleHistoryCard, setHistoryFilter, onWeekSelect, onMonthSelect, toggleHfDropdown, selectHfItem, scrollToHistory } from './history.js';
import { renderTrendSection } from './trend.js';
import { generateReport } from './report.js';
import { setupAllPhotoChecks } from './photo_check.js';

const state = { hasBase: false, hasPlaque: false, currentModel: 'base' };
const initFiles = {}, plaqueFiles = {};

window.toggleHistoryCard = toggleHistoryCard;
window.setHistoryFilter  = setHistoryFilter;
window.onWeekSelect      = onWeekSelect;
window.onMonthSelect     = onMonthSelect;
window.toggleHfDropdown  = toggleHfDropdown;
window.selectHfItem      = selectHfItem;

async function init() {
  setupAuthUI();
  setupAuthForm(() => {
    renderHistorySection();
    fetchAnalyses().then(all => renderTrendSection(all));
    loadExistingData();
  });

  setupUploads('init',   initFiles,   'btn-init');
  setupUploads('plaque', plaqueFiles, 'btn-plaque');
  setupAllPhotoChecks('init');
  setupAllPhotoChecks('plaque');

  document.getElementById('nav-history')?.addEventListener('click', scrollToHistory);
  document.getElementById('toggle-base')?.addEventListener('click', () => switchModel('base', state));
  document.getElementById('toggle-plaque')?.addEventListener('click', () => switchModel('plaque', state));
  document.getElementById('btn-init')?.addEventListener('click', handleInit);
  document.getElementById('btn-plaque')?.addEventListener('click', handlePlaque);
  document.getElementById('btn-login-hero')?.addEventListener('click', () => showAuthModal('login'));

  renderHistorySection();
  fetchAnalyses().then(all => renderTrendSection(all));
  await loadExistingData();
}

async function loadExistingData() {
  const [modelStatus, toothData, plaqueStats, plaqueRegions] = await Promise.all([
    fetchModelStatus(),
    fetchToothData(),
    fetchPlaqueStats(),
    fetchPlaqueRegions(),
  ]);

  if (modelStatus?.model_ready) state.hasBase   = true;
  if (plaqueStats)               state.hasPlaque = true;

  if (toothData || plaqueStats) {
    showResultSection(toothData, plaqueStats, state, plaqueRegions);
  }

  const reportBtn = document.getElementById('btn-report');
  if (reportBtn && plaqueStats) {
    reportBtn.classList.remove('hidden');
    reportBtn.onclick = () => generateReport(toothData, plaqueStats);
  }
}

async function handleInit() {
  if (!VIEWS.every(v => initFiles[v])) return;
  document.getElementById('btn-init').disabled = true;
  showProgress('init');
  try {
    const data = await submitInit(initFiles);
    if (data.error) throw new Error(data.error);
    await pollTask(data.task_id, 'init');
  } catch(e) {
    console.error(e);
    document.getElementById('btn-init').disabled = false;
  }
}

async function handlePlaque() {
  if (!VIEWS.every(v => plaqueFiles[v])) return;
  document.getElementById('btn-plaque').disabled = true;
  showProgress('plaque');
  try {
    const data = await submitPlaque(plaqueFiles);
    if (data.error) throw new Error(data.error);
    await pollTask(data.task_id, 'plaque');
  } catch(e) {
    console.error(e);
    document.getElementById('btn-plaque').disabled = false;
  }
}

async function pollTask(taskId, mode) {
  const maxAttempts = 180;
  let attempts = 0;
  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 3000));
    attempts++;
    try {
      const status = await fetchTaskStatus(taskId);
      updateProgress(status, mode);
      if (status.status === 'done') {
        fadeOutProgress();
        await loadExistingData();
        state.hasBase   = mode === 'init'   ? true : state.hasBase;
        state.hasPlaque = mode === 'plaque' ? true : state.hasPlaque;
        document.getElementById(mode === 'init' ? 'btn-init' : 'btn-plaque').disabled = false;
        renderHistorySection();
        fetchAnalyses().then(all => renderTrendSection(all));
        return;
      }
      if (status.status === 'failed') {
        fadeOutProgress();
        alert('分析失敗，請重試');
        document.getElementById(mode === 'init' ? 'btn-init' : 'btn-plaque').disabled = false;
        return;
      }
    } catch(e) { console.error('poll error:', e); }
  }
}

document.addEventListener('DOMContentLoaded', init);
