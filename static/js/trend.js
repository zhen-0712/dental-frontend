// ===== trend.js - 菌斑趨勢分析 =====
import { API_BASE } from './api.js';
import { getToken, isLoggedIn } from './auth.js';

const ALL_UPPER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const ALL_LOWER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
const ALL_FDI   = [...ALL_UPPER, ...ALL_LOWER];
const AQUA      = '#239dca';

const PALETTE = [
  '#03695e','#6daf5f','#239dca','#e8a020','#c0392b',
  '#8e44ad','#2980b9','#27ae60','#d35400','#7f8c8d',
];

let trendAnalyses = [];
let selectedFdis  = [];
let chartCanvas   = null;
let trendMode     = 'overall';   // 'overall' | 'detail'
let overallFilter = 'all';       // 'all' | 'upper' | 'lower'

// ===== 資料整理 =====
function buildTrendData(analyses) {
  return analyses
    .filter(a => a.type === 'plaque' && a.status === 'done' &&
                 a.result?.stats?.fdi_plaque_summary &&
                 Object.keys(a.result.stats.fdi_plaque_summary).length > 0)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

function getAllFdiInData(records) {
  const set = new Set();
  records.forEach(r =>
    Object.keys(r.result.stats.fdi_plaque_summary).forEach(fdi => set.add(Number(fdi)))
  );
  return [...set].sort((a, b) => a - b);
}

function getMaxPxAcrossAll(records) {
  let max = 1;
  records.forEach(r =>
    Object.values(r.result.stats.fdi_plaque_summary).forEach(v => {
      if (v.total_plaque_px > max) max = v.total_plaque_px;
    })
  );
  return max;
}

// ===== Overall 模式資料 =====
function getOverallValue(record, filter) {
  if (filter === 'all') {
    return (record.result.stats.plaque_ratio ?? 0) * 100;
  }
  const summary = record.result.stats.fdi_plaque_summary || {};
  const jawFdiSet = new Set(filter === 'upper' ? ALL_UPPER : ALL_LOWER);
  return Object.entries(summary)
    .filter(([fdi]) => jawFdiSet.has(Number(fdi)))
    .reduce((sum, [, info]) => sum + (info.total_plaque_px ?? 0), 0);
}

function getOverallMax(records, filter) {
  if (filter === 'all') return 100;
  return Math.max(1, ...records.map(r => getOverallValue(r, filter)));
}

// ===== Canvas 共用設定 =====
function initCanvas() {
  if (!chartCanvas) return null;
  const ctx = chartCanvas.getContext('2d');
  // offsetWidth is 0 for off-screen canvases, fall back to .width (pre-set by caller)
  const W = chartCanvas.width  = chartCanvas.offsetWidth  || chartCanvas.width  || 600;
  const H = chartCanvas.height = chartCanvas.offsetHeight || chartCanvas.height || 260;
  ctx.clearRect(0, 0, W, H);
  return { ctx, W, H, PAD: { top: 20, right: 20, bottom: 48, left: 52 } };
}

function drawGridAndAxes(ctx, W, H, PAD, n, records, maxY, yFmt) {
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top  - PAD.bottom;

  // 格線 + Y 軸
  ctx.strokeStyle = 'rgba(3,105,94,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + cH * (1 - i / 4);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
    ctx.fillStyle = '#5a7068';
    ctx.font = '11px DM Sans, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(yFmt(maxY * i / 4), PAD.left - 6, y + 4);
  }

  // X 軸日期
  ctx.fillStyle = '#5a7068';
  ctx.font = '11px DM Sans, sans-serif';
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.ceil(n / 8));
  records.forEach((r, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    const x = PAD.left + (n === 1 ? cW / 2 : cW * i / (n - 1));
    const d = new Date(r.created_at);
    ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`, x, PAD.top + cH + 18);
  });

  return { cW, cH };
}

// ===== Overall 折線圖 =====
function drawOverallChart(records, filter) {
  const init = initCanvas();
  if (!init) return;
  const { ctx, W, H, PAD } = init;
  const n = records.length;
  const isRatio = filter === 'all';
  const maxY = getOverallMax(records, filter);
  const yFmt = v => isRatio ? `${Math.round(v)}%` : (v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${Math.round(v)}`);
  const { cW, cH } = drawGridAndAxes(ctx, W, H, PAD, n, records, maxY, yFmt);

  // Y 軸標籤
  ctx.save();
  ctx.translate(14, PAD.top + cH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5a7068';
  ctx.font = '11px DM Sans, sans-serif';
  ctx.fillText(isRatio ? '菌斑覆蓋率' : '菌斑像素量', 0, 0);
  ctx.restore();

  const points = records.map((r, i) => {
    const val = getOverallValue(r, filter);
    const x = PAD.left + (n === 1 ? cW / 2 : cW * i / (n - 1));
    const y = PAD.top + cH * (1 - val / maxY);
    return { x, y, val };
  });

  // 填色區域
  ctx.beginPath();
  ctx.moveTo(points[0].x, PAD.top + cH);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, PAD.top + cH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(35,157,202,0.1)';
  ctx.fill();

  // 折線
  ctx.strokeStyle = AQUA;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // 點 + 數值標籤
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = AQUA;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = AQUA;
    ctx.font = '10px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(yFmt(p.val), p.x, p.y - 9);
  });

  // 更新說明文字
  const note = document.getElementById('trend-note');
  if (note) note.textContent = isRatio ? '縱軸為菌斑覆蓋率（數值越低代表改善越多）' : '縱軸為菌斑像素量（數值越低代表改善越多）';
}

// ===== Detail 折線圖 =====
function drawDetailChart(records, fdis) {
  const init = initCanvas();
  if (!init) return;
  const { ctx, W, H, PAD } = init;
  const n = records.length;

  if (n < 2) {
    ctx.fillStyle = '#5a7068';
    ctx.font = '14px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('需要至少 2 次菌斑分析才能顯示趨勢', W / 2, H / 2);
    return;
  }

  const maxPx = getMaxPxAcrossAll(records);
  const yFmt = v => `${Math.round(v)}`;
  const { cW, cH } = drawGridAndAxes(ctx, W, H, PAD, n, records, maxPx, yFmt);

  // Y 軸標籤
  ctx.save();
  ctx.translate(14, PAD.top + cH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5a7068';
  ctx.font = '11px DM Sans, sans-serif';
  ctx.fillText('菌斑像素量', 0, 0);
  ctx.restore();

  fdis.forEach((fdi, fi) => {
    const color = PALETTE[fi % PALETTE.length];
    const points = records.map((r, i) => {
      const px = r.result.stats.fdi_plaque_summary[String(fdi)]?.total_plaque_px ?? 0;
      const x = PAD.left + (n === 1 ? cW / 2 : cW * i / (n - 1));
      const y = PAD.top + cH * (1 - px / maxPx);
      return { x, y };
    });

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  });

  const note = document.getElementById('trend-note');
  if (note) note.textContent = '縱軸為菌斑像素量（數值越低代表改善越多）';
}

// ===== 模式 Tabs =====
function renderModeTabs() {
  const wrap = document.getElementById('trend-mode-tabs');
  if (!wrap) return;
  wrap.innerHTML = `
    <button class="trend-mode-btn ${trendMode === 'overall' ? 'active' : ''}"
      onclick="window.setTrendMode('overall')">整體趨勢</button>
    <button class="trend-mode-btn ${trendMode === 'detail' ? 'active' : ''}"
      onclick="window.setTrendMode('detail')">牙齒明細</button>
  `;
}

// ===== Overall 控制 =====
function renderOverallControls() {
  const wrap = document.getElementById('trend-overall-controls');
  if (!wrap) return;
  const filters = [['all','全部'],['upper','上顎'],['lower','下顎']];
  wrap.innerHTML = `
    <div class="trend-jaw-filter">
      ${filters.map(([k, lbl]) =>
        `<button class="trend-jaw-btn ${overallFilter === k ? 'active' : ''}"
          onclick="window.setOverallFilter('${k}')">${lbl}</button>`
      ).join('')}
    </div>
  `;
}

// ===== FDI 選擇器（Detail 模式）=====
function getMissingFdis() {
  return new Set((window._toothData?.never_detected || []).map(Number));
}

function renderFdiSelector(availableFdis, missingFdis) {
  const wrap = document.getElementById('trend-fdi-selector');
  if (!wrap) return;

  const makeRow = (allTeeth, label, jawKey) => {
    const chips = allTeeth.map(fdi => {
      const isMissing  = missingFdis.has(fdi);
      const hasPlaque  = availableFdis.includes(fdi);
      const isSelected = selectedFdis.includes(fdi);
      const colorIdx   = selectedFdis.indexOf(fdi);
      const chipColor  = isSelected ? PALETTE[colorIdx % PALETTE.length] : null;

      let chipClass = 'trend-tooth-chip';
      if (isMissing)       chipClass += ' missing';
      else if (isSelected) chipClass += ' selected';
      else if (!hasPlaque) chipClass += ' no-plaque';

      const style = chipColor ? `style="background:${chipColor};border-color:${chipColor};"` : '';
      const click = !isMissing ? `onclick="window.toggleTrendFdi(${fdi})"` : '';
      return `<div class="${chipClass}" title="FDI ${fdi}" ${style} ${click}>${fdi}</div>`;
    }).join('');

    return `
      <div class="trend-tooth-row">
        <div class="trend-tooth-chips">${chips}</div>
        <div class="trend-jaw-actions">
          <button class="trend-action-btn" onclick="window.selectJawTrendFdi('${jawKey}')">全選${label}</button>
          <button class="trend-action-btn" onclick="window.clearJawTrendFdi('${jawKey}')">清除${label}</button>
        </div>
      </div>`;
  };

  wrap.innerHTML = `
    ${makeRow(ALL_UPPER, '上', 'upper')}
    ${makeRow(ALL_LOWER, '下', 'lower')}
    <div class="trend-fdi-actions">
      <button class="trend-action-btn" onclick="window.selectAllTrendFdi()">全選</button>
      <button class="trend-action-btn" onclick="window.clearTrendFdi()">清除</button>
      <button class="trend-action-btn" onclick="window.selectTopTrendFdi()">菌斑前5</button>
    </div>
    <div class="trend-chip-legend">
      <span class="trend-chip-legend-item"><span class="tcl-dot selected"></span>已選</span>
      <span class="trend-chip-legend-item"><span class="tcl-dot no-plaque"></span>無菌斑</span>
      <span class="trend-chip-legend-item"><span class="tcl-dot missing"></span>缺牙</span>
    </div>
  `;
}

function renderLegend(fdis) {
  const el = document.getElementById('trend-legend');
  if (!el) return;
  el.innerHTML = fdis.map((fdi, i) => `
    <div class="trend-legend-item">
      <span class="trend-legend-dot" style="background:${PALETTE[i % PALETTE.length]};"></span>
      <span>FDI ${fdi}</span>
    </div>
  `).join('');
}

// ===== 刷新圖表 =====
function refreshChart() {
  const records = buildTrendData(trendAnalyses);
  window._trendSelectedFdis    = [...selectedFdis];
  window._trendMode            = trendMode;
  window._trendOverallFilter   = overallFilter;

  if (trendMode === 'overall') {
    drawOverallChart(records, overallFilter);
  } else {
    drawDetailChart(records, selectedFdis);
    renderLegend(selectedFdis);
  }
}

function refreshSelector() {
  const records = buildTrendData(trendAnalyses);
  renderFdiSelector(getAllFdiInData(records), getMissingFdis());
}

function showModeControls() {
  const overallCtrl = document.getElementById('trend-overall-controls');
  const detailCtrl  = document.getElementById('trend-detail-controls');
  if (!overallCtrl || !detailCtrl) return;
  if (trendMode === 'overall') {
    overallCtrl.classList.remove('hidden');
    detailCtrl.classList.add('hidden');
  } else {
    overallCtrl.classList.add('hidden');
    detailCtrl.classList.remove('hidden');
  }
}

// ===== 全局操作 =====
window.setTrendMode = function(mode) {
  trendMode = mode;
  renderModeTabs();
  showModeControls();
  refreshChart();
};

window.setOverallFilter = function(filter) {
  overallFilter = filter;
  renderOverallControls();
  refreshChart();
};

window.toggleTrendFdi = function(fdi) {
  const idx = selectedFdis.indexOf(fdi);
  if (idx >= 0) selectedFdis.splice(idx, 1);
  else selectedFdis.push(fdi);
  refreshSelector();
  refreshChart();
};

window.selectAllTrendFdi = function() {
  const records = buildTrendData(trendAnalyses);
  selectedFdis = getAllFdiInData(records);
  refreshSelector();
  refreshChart();
};

window.clearTrendFdi = function() {
  selectedFdis = [];
  refreshSelector();
  refreshChart();
};

window.selectJawTrendFdi = function(jaw) {
  const records   = buildTrendData(trendAnalyses);
  const available = getAllFdiInData(records);
  const missing   = getMissingFdis();
  const jawTeeth  = jaw === 'upper' ? ALL_UPPER : ALL_LOWER;
  const toAdd = jawTeeth.filter(f => available.includes(f) && !missing.has(f) && !selectedFdis.includes(f));
  selectedFdis = [...selectedFdis, ...toAdd];
  refreshSelector();
  refreshChart();
};

window.clearJawTrendFdi = function(jaw) {
  const jawSet = new Set(jaw === 'upper' ? ALL_UPPER : ALL_LOWER);
  selectedFdis = selectedFdis.filter(f => !jawSet.has(f));
  refreshSelector();
  refreshChart();
};

window.selectTopTrendFdi = function() {
  const records = buildTrendData(trendAnalyses);
  const fdiTotals = {};
  records.forEach(r =>
    Object.entries(r.result.stats.fdi_plaque_summary).forEach(([fdi, info]) => {
      fdiTotals[fdi] = Math.max(fdiTotals[fdi] || 0, info.total_plaque_px);
    })
  );
  selectedFdis = Object.entries(fdiTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([fdi]) => Number(fdi));
  refreshSelector();
  refreshChart();
};

// ===== 主入口 =====
export async function renderTrendSection(analyses) {
  const section = document.getElementById('trend-section');
  if (!section) return;

  if (!isLoggedIn()) { section.classList.add('hidden'); return; }

  trendAnalyses = analyses;
  const records = buildTrendData(analyses);

  if (records.length < 2) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');

  // 預設選菌斑前5顆（detail 模式）
  const fdiTotals = {};
  records.forEach(r =>
    Object.entries(r.result.stats.fdi_plaque_summary).forEach(([fdi, info]) => {
      fdiTotals[fdi] = Math.max(fdiTotals[fdi] || 0, info.total_plaque_px);
    })
  );
  selectedFdis = Object.entries(fdiTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([fdi]) => Number(fdi));

  chartCanvas = document.getElementById('trend-canvas');

  renderModeTabs();
  renderOverallControls();
  renderFdiSelector(getAllFdiInData(records), getMissingFdis());
  showModeControls();
  refreshChart();
}

// ===== PDF 用：離屏渲染整體趨勢（全部）=====
export function captureOverallChart() {
  const records = buildTrendData(trendAnalyses);
  if (records.length < 2) return null;
  const offCanvas  = document.createElement('canvas');
  offCanvas.width  = 900;
  offCanvas.height = 260;
  const saved = chartCanvas;
  chartCanvas = offCanvas;
  drawOverallChart(records, 'all');
  chartCanvas = saved;
  return offCanvas.toDataURL('image/png');
}

// ===== PDF 用：離屏渲染上下顎各自的詳細圖 =====
export function captureJawCharts() {
  const records = buildTrendData(trendAnalyses);
  if (records.length < 2) return { upper: null, lower: null, upperFdis: [], lowerFdis: [] };

  const available = getAllFdiInData(records);
  const missing   = getMissingFdis();
  const upperFdis = ALL_UPPER.filter(f => available.includes(f) && !missing.has(f));
  const lowerFdis = ALL_LOWER.filter(f => available.includes(f) && !missing.has(f));

  const captureToDataURL = (fdis) => {
    if (fdis.length === 0) return null;
    const offCanvas  = document.createElement('canvas');
    offCanvas.width  = 900;
    offCanvas.height = 260;
    const saved  = chartCanvas;
    chartCanvas  = offCanvas;
    drawDetailChart(records, fdis);
    chartCanvas  = saved;
    return offCanvas.toDataURL('image/png');
  };

  return {
    upper:     captureToDataURL(upperFdis),
    lower:     captureToDataURL(lowerFdis),
    upperFdis,
    lowerFdis,
  };
}
