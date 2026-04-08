// ===== progress.js - 進度條邏輯 =====
const INIT_STEPS = [
  { key: 'preprocessing', label: '照片預處理' },
  { key: 'analyzing',     label: '牙齒辨識分析' },
  { key: 'creating_3d',   label: '建立 3D 模型' },
];
const PLAQUE_STEPS = [
  { key: 'detecting_plaque',   label: '菌斑偵測' },
  { key: 'extracting_regions', label: '提取菌斑區域' },
  { key: 'projecting_plaque',  label: '投射至 3D 模型' },
];
const STEP_PROGRESS = {
  preprocessing: 20, analyzing: 50, creating_3d: 80,
  detecting_plaque: 25, extracting_regions: 60, projecting_plaque: 88,
};

export function showProgress(mode) {
  const section = document.getElementById('progress-section');
  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const steps = mode === 'init' ? INIT_STEPS : PLAQUE_STEPS;
  document.getElementById('progress-title').textContent =
    mode === 'init' ? '建立 3D 模型中' : '菌斑分析中';

  document.getElementById('progress-steps').innerHTML = steps.map(s => `
    <div class="progress-step" id="step-${s.key}">
      <div class="step-dot"></div>
      <div class="step-info">
        <span class="step-name">${s.label}</span>
        <span class="step-status">等待中</span>
      </div>
    </div>
  `).join('');
}

export function updateProgress(data, mode) {
  const step  = data.step;
  const steps = mode === 'init' ? INIT_STEPS : PLAQUE_STEPS;
  const bar   = document.getElementById('progress-bar');

  steps.forEach((s, i) => {
    const el = document.getElementById(`step-${s.key}`);
    if (!el) return;
    const statusEl = el.querySelector('.step-status');
    const stepIdx  = steps.findIndex(x => x.key === step);
    if (s.key === step) {
      el.className = 'progress-step active';
      statusEl.textContent = '進行中...';
    } else if (i < stepIdx || step === 'done') {
      el.className = 'progress-step done';
      statusEl.textContent = '完成';
    } else {
      el.className = 'progress-step';
      statusEl.textContent = '等待中';
    }
  });

  bar.style.width = `${STEP_PROGRESS[step] ?? (step === 'done' ? 100 : 5)}%`;
}

export function fadeOutProgress() {
  const section = document.getElementById('progress-section');
  section.style.transition = 'opacity 0.6s ease';
  setTimeout(() => {
    section.style.opacity = '0';
    setTimeout(() => {
      section.classList.add('hidden');
      section.style.opacity = '';
      section.style.transition = '';
    }, 700);
  }, 1500);
}