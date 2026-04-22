// ===== result.js - 結果渲染 =====
import { getFileUrl } from './api.js';

const ALL_TEETH_UPPER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const ALL_TEETH_LOWER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

export function showResultSection(toothData, plaqueStats, state, plaqueRegions) {
  const section = document.getElementById('result');
  section.classList.remove('hidden');
  window._toothData     = toothData;
  window._plaqueRegions = plaqueRegions || null;

  const toggle = document.getElementById('model-toggle');
  if (state.hasBase && state.hasPlaque) {
    toggle.classList.remove('hidden');
  } else {
    toggle.classList.add('hidden');
  }

  if (!state.hasBase && !state.hasPlaque) return;
  if (state.hasPlaque && !state.hasBase) state.currentModel = 'plaque';
  if (state.hasBase && !state.hasPlaque) state.currentModel = 'base';

  renderLeftPanel(toothData, plaqueStats, state, plaqueRegions);
  render3DViewer(state.currentModel);
}

export function switchModel(mode, state) {
  state.currentModel = mode;
  document.getElementById('toggle-base').classList.toggle('active', mode === 'base');
  document.getElementById('toggle-plaque').classList.toggle('active', mode === 'plaque');
  if (mode === 'base') {
    document.getElementById('block-init').classList.remove('hidden');
    document.getElementById('block-plaque').classList.add('hidden');
  } else {
    document.getElementById('block-init').classList.add('hidden');
    document.getElementById('block-plaque').classList.remove('hidden');
  }
  render3DViewer(mode);
}

function renderLeftPanel(toothData, plaqueStats, state, plaqueRegions) {
  document.getElementById('block-init').classList.add('hidden');
  document.getElementById('block-plaque').classList.add('hidden');

  if (toothData) {
    document.getElementById('stat-total').textContent    = toothData.total_detected ?? '—';
    document.getElementById('stat-missing').textContent  = (toothData.never_detected || []).length;
    document.getElementById('stat-reliable').textContent = toothData.reliable_count ?? '—';
    renderToothChart(toothData);

    const missing = toothData.never_detected || [];
    if (missing.length > 0) {
      document.getElementById('missing-wrap').classList.remove('hidden');
      document.getElementById('missing-list').innerHTML =
        missing.map(t => `<span class="missing-badge">${t}</span>`).join('');
    }
    const suspects = [
      ...(toothData.suspicious?.low_confidence || []),
      ...(toothData.suspicious?.insufficient_views || []),
    ];
    if (suspects.length > 0) {
      document.getElementById('suspicious-wrap').classList.remove('hidden');
      document.getElementById('suspicious-list').innerHTML =
        suspects.map(t => `<span class="suspect-badge">${t}</span>`).join('');
    }

    renderToothAccuracy(toothData);
  }

  if (plaqueStats) {
    const summary = plaqueStats.fdi_plaque_summary || {};
    document.getElementById('stat-ratio').textContent =
      plaqueStats.plaque_ratio != null ? `${(plaqueStats.plaque_ratio * 100).toFixed(1)}%` : '—';
    document.getElementById('stat-plaque-teeth').textContent = Object.keys(summary).length;
    renderPlaqueToothChart(summary, toothData);

    renderPlaqueAccuracy(plaqueStats, plaqueRegions);
  }

  if (state.currentModel === 'base') {
    document.getElementById('block-init').classList.remove('hidden');
  } else {
    document.getElementById('block-plaque').classList.remove('hidden');
  }
}

// ===== 牙齒模型準確度計算 =====
function calcToothAccuracy(toothData) {
  if (!toothData) return null;
  const teeth = toothData.teeth || {};
  const total = Object.keys(teeth).length;
  if (total === 0) return null;

  const neverDetected = (toothData.never_detected || []).length;
  const detectedCount = (toothData.detected_teeth || []).length;
  const detectionCoverage = detectedCount / (detectedCount + neverDetected);

  const confidences = Object.values(teeth).map(t => t.confidence || 0);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

  const multiViewCount = Object.values(teeth).filter(t => t.num_views >= 2).length;
  const multiViewRate = multiViewCount / total;

  // 各視角偵測數（僅供參考，不列入計算）
  const byView = toothData.by_view || {};
  const viewCoverage = {};
  const viewLabels = {
    'front.jpg': '正面', 'left_side.jpg': '左側', 'right_side.jpg': '右側',
    'upper_occlusal.jpg': '上顎咬合', 'lower_occlusal.jpg': '下顎咬合'
  };
  Object.entries(byView).forEach(([view, list]) => {
    const label = viewLabels[view] || view;
    viewCoverage[label] = list.length;
  });

  const overallScore = detectionCoverage * 0.35 + avgConfidence * 0.40 + multiViewRate * 0.25;
  const grade = overallScore >= 0.85 ? { label: 'A', color: '#03695e' }
              : overallScore >= 0.70 ? { label: 'B', color: '#6daf5f' }
              : overallScore >= 0.55 ? { label: 'C', color: '#e8a020' }
              : { label: 'D', color: '#c0392b' };

  return { detectionCoverage, avgConfidence, multiViewRate, viewCoverage, overallScore, grade };
}

function renderToothAccuracy(toothData) {
  const el = document.getElementById('tooth-accuracy-wrap');
  if (!el) return;
  const acc = calcToothAccuracy(toothData);
  if (!acc) { el.innerHTML = ''; return; }

  const { detectionCoverage, avgConfidence, multiViewRate, viewCoverage, overallScore, grade } = acc;

  const viewRows = Object.entries(viewCoverage).map(([label, count]) => `
    <div class="acc-item acc-item-sub">
      <span class="acc-label">${label}</span>
      <div class="acc-bar-wrap">
        <span class="acc-bar" style="width:${Math.min(count/16*100,100).toFixed(0)}%;background:rgba(3,105,94,0.45);"></span>
      </div>
      <span class="acc-pct">${count} 顆</span>
    </div>
  `).join('');

  el.innerHTML = `
    <div class="accuracy-badge">
      <div class="acc-header">
        <span class="acc-title">模型還原準確度</span>
        <span class="acc-grade" style="background:${grade.color};">${grade.label}</span>
        <span class="acc-score">${(overallScore * 100).toFixed(0)}%</span>
      </div>
      <div class="acc-details">
        <div class="acc-item">
          <span class="acc-label">偵測覆蓋</span>
          <div class="acc-bar-wrap">
            <span class="acc-bar" style="width:${(detectionCoverage*100).toFixed(0)}%;background:${grade.color};"></span>
          </div>
          <span class="acc-pct">${(detectionCoverage*100).toFixed(0)}%</span>
        </div>
        <div class="acc-item">
          <span class="acc-label">平均可信度</span>
          <div class="acc-bar-wrap">
            <span class="acc-bar" style="width:${(avgConfidence*100).toFixed(0)}%;background:${grade.color};"></span>
          </div>
          <span class="acc-pct">${(avgConfidence*100).toFixed(0)}%</span>
        </div>
        <div class="acc-item">
          <span class="acc-label">多視角驗證</span>
          <div class="acc-bar-wrap">
            <span class="acc-bar" style="width:${(multiViewRate*100).toFixed(0)}%;background:${grade.color};"></span>
          </div>
          <span class="acc-pct">${(multiViewRate*100).toFixed(0)}%</span>
        </div>
        <div class="acc-subsection-label">各視角偵測數（僅供參考）</div>
        ${viewRows}
      </div>
      <p class="acc-note">偵測覆蓋 × 35% ＋ 平均可信度 × 40% ＋ 多視角驗證 × 25%</p>
    </div>
  `;
}

// ===== 菌斑分析準確度計算 =====
function calcPlaqueAccuracy(plaqueStats, toothData) {
  if (!plaqueStats) return null;

  const summary = plaqueStats.fdi_plaque_summary || {};
  const totalFdiWithPlaque = Object.keys(summary).length;
  if (totalFdiWithPlaque === 0) return null;

  // 1. 投射命中率：分母用後端記錄的「SAT 偵測到 + roi_mask 有菌斑」的真實牙數
  //    舊資料沒有 sat_plaque_fdi_count 時 fallback 到 summary 長度
  const satPlaqueTotal = plaqueStats.sat_plaque_fdi_count || totalFdiWithPlaque;
  const fdiWithHits = Object.values(summary).filter(v => v.hit_verts > 0).length;
  const projectionHitRate = fdiWithHits / satPlaqueTotal;

  // 2. 多視角交叉驗證率：有菌斑且 SAT 在 2+ 個視角偵測到的牙齒
  //    用 real_teeth_analysis 的 detected_in_views（不受 roi_mask 噪訊影響）
  const teethMap = (toothData && toothData.teeth) ? toothData.teeth : {};
  const multiViewFdi = Object.keys(summary).filter(fdi => {
    const toothInfo = teethMap[fdi];
    const satViews = toothInfo ? (toothInfo.detected_in_views || []).length : 0;
    return satViews >= 2 && (summary[fdi].hit_verts || 0) > 0;
  }).length;
  const crossViewRate = multiViewFdi / totalFdiWithPlaque;

  // 3. 各視角覆蓋率（用 SAT by_view，不受 roi_mask 噪訊影響）
  //    計算：有菌斑的牙齒中，有幾顆在該視角被 SAT 偵測到
  const viewKeyMap = {
    'front.jpg': '正面', 'left_side.jpg': '左側', 'right_side.jpg': '右側',
    'upper_occlusal.jpg': '上顎咬合', 'lower_occlusal.jpg': '下顎咬合'
  };
  const byView = (toothData && toothData.by_view) ? toothData.by_view : {};
  const plaqueSet = new Set(Object.keys(summary).map(Number));
  const viewHitCoverage = {};
  Object.entries(viewKeyMap).forEach(([viewFile, label]) => {
    const teethInThisView = new Set((byView[viewFile] || []).map(Number));
    const overlap = [...plaqueSet].filter(fdi => teethInThisView.has(fdi)).length;
    viewHitCoverage[label] = totalFdiWithPlaque > 0 ? overlap / totalFdiWithPlaque : 0;
  });

  // 4. 綜合分數：投射命中 × 60% + 多視角驗證 × 40%
  const overallScore = projectionHitRate * 0.60 + crossViewRate * 0.40;

  const grade = overallScore >= 0.80 ? { label: 'A', color: '#03695e' }
              : overallScore >= 0.60 ? { label: 'B', color: '#6daf5f' }
              : overallScore >= 0.40 ? { label: 'C', color: '#e8a020' }
              : { label: 'D', color: '#c0392b' };

  return { projectionHitRate, crossViewRate, viewHitCoverage, overallScore, grade, totalFdiWithPlaque };
}

function renderPlaqueAccuracy(plaqueStats, plaqueRegions) {
  const el = document.getElementById('plaque-accuracy-wrap');
  if (!el) return;
  const acc = calcPlaqueAccuracy(plaqueStats, window._toothData);
  if (!acc) { el.innerHTML = ''; return; }

  const { projectionHitRate, crossViewRate, viewHitCoverage, overallScore, grade, totalFdiWithPlaque } = acc;

  const viewRows = Object.entries(viewHitCoverage).map(([label, rate]) => `
    <div class="acc-item acc-item-sub">
      <span class="acc-label">${label}</span>
      <div class="acc-bar-wrap">
        <span class="acc-bar" style="width:${(rate*100).toFixed(0)}%;background:rgba(3,105,94,0.45);"></span>
      </div>
      <span class="acc-pct">${(rate*100).toFixed(0)}%</span>
    </div>
  `).join('');

  el.innerHTML = `
    <div class="accuracy-badge">
      <div class="acc-header">
        <span class="acc-title">菌斑分析準確度</span>
        <span class="acc-grade" style="background:${grade.color};">${grade.label}</span>
        <span class="acc-score">${(overallScore * 100).toFixed(0)}%</span>
      </div>
      <div class="acc-details">
        <div class="acc-item">
          <span class="acc-label">投射命中率</span>
          <div class="acc-bar-wrap">
            <span class="acc-bar" style="width:${(projectionHitRate*100).toFixed(0)}%;background:${grade.color};"></span>
          </div>
          <span class="acc-pct">${(projectionHitRate*100).toFixed(0)}%</span>
        </div>
        <div class="acc-item">
          <span class="acc-label">多視角驗證</span>
          <div class="acc-bar-wrap">
            <span class="acc-bar" style="width:${(crossViewRate*100).toFixed(0)}%;background:${grade.color};"></span>
          </div>
          <span class="acc-pct">${(crossViewRate*100).toFixed(0)}%</span>
        </div>
        <div class="acc-subsection-label">各視角命中覆蓋（僅供參考）</div>
        ${viewRows}
      </div>
      <p class="acc-note">投射命中 × 60% ＋ 多視角驗證 × 40%　·　偵測到有菌斑的牙齒：${totalFdiWithPlaque} 顆</p>
    </div>
  `;
}

function renderToothChart(toothData) {
  const detected = new Set((toothData.detected_teeth || []).map(Number));
  const missing  = new Set((toothData.never_detected || []).map(Number));
  const suspects = new Set([
    ...(toothData.suspicious?.low_confidence || []),
    ...(toothData.suspicious?.insufficient_views || []),
  ].map(Number));

  const chart = document.getElementById('tooth-chart');
  chart.innerHTML = [
    { teeth: ALL_TEETH_UPPER, label: '上' },
    { teeth: ALL_TEETH_LOWER, label: '下' },
  ].map(({ teeth, label }) => `
    <div class="tooth-chart-row">
      <span class="tooth-chart-label">${label}</span>
      ${teeth.map(t => {
        const cls = missing.has(t) ? 'missing' : suspects.has(t) ? 'suspect' : detected.has(t) ? 'present' : 'missing';
        return `<div class="tooth-chip ${cls}" title="FDI ${t}">${t}</div>`;
      }).join('')}
    </div>
  `).join('');
}

function renderPlaqueToothChart(summary, toothData) {
  const maxPx = Math.max(...Object.values(summary).map(v => v.total_plaque_px), 1);
  const plaqueMap = {};
  Object.entries(summary).forEach(([fdi, info]) => { plaqueMap[Number(fdi)] = info.total_plaque_px; });

  const _td = toothData || window._toothData;
  const missing = new Set((_td?.never_detected || []).map(Number));

  function makeRow(teeth, label) {
    return `<div class="plaque-tooth-row">
      <span class="tooth-chart-label">${label}</span>
      ${teeth.map(t => {
        const isMissing = missing.has(t);
        const px  = isMissing ? 0 : (plaqueMap[t] || 0);
        const pct = isMissing ? 0 : Math.round(px / maxPx * 100);
        const cls = isMissing ? 'missing-tooth' : px === 0 ? 'no-plaque' : '';
        return `<div class="plaque-tooth-chip ${cls}" title="FDI ${t}: ${isMissing ? '缺牙' : px+' px'}">
          <div class="plaque-tooth-fill" style="height:${pct}%"></div>
          <span class="plaque-tooth-label">${t}</span>
        </div>`;
      }).join('')}
    </div>`;
  }

  document.getElementById('plaque-tooth-chart').innerHTML =
    makeRow(ALL_TEETH_UPPER, '上') + makeRow(ALL_TEETH_LOWER, '下');
}

export function render3DViewer(mode) {
  const frame  = document.getElementById('viewer-frame');
  const _t = Date.now();
  const glbUrl = getFileUrl(mode === 'plaque' ? 'plaque_by_fdi.glb' : 'custom_real_teeth.glb') + '&t=' + _t;
  const objUrl = getFileUrl(mode === 'plaque' ? 'plaque_by_fdi.obj' : 'custom_real_teeth.obj') + '&t=' + _t;
  
  frame.innerHTML = '';
  const mv = document.createElement('model-viewer');
  mv.setAttribute('src', glbUrl);
  mv.setAttribute('camera-controls', '');
  mv.setAttribute('auto-rotate', '');
  mv.setAttribute('shadow-intensity', '0.8');
  mv.setAttribute('exposure', '1');
  mv.setAttribute('crossorigin', 'anonymous');
  mv.style.cssText = 'width:100%;height:100%;background:transparent;';
  mv.alt = '牙齒 3D 模型';
  mv.addEventListener('error', () => {
    frame.innerHTML = `<div class="viewer-placeholder">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="opacity:0.3"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
      <p>${mode === 'plaque' ? '尚未進行菌斑分析' : '模型載入失敗'}</p>
    </div>`;
  });
  frame.appendChild(mv);
  document.getElementById('btn-download-glb').href = glbUrl;
  document.getElementById('btn-download-obj').href = objUrl;
}