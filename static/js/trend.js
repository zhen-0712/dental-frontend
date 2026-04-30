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

// Piecewise Y scale — parameterised per chart type
// overall: 0-50% → 80% height; detail: 0-10% → 80% height
const Y_CFG_OVERALL = { split: 50, lowFrac: 0.80, ticks: [0, 10, 20, 30, 50, 100] };
const Y_CFG_DETAIL  = { split: 10, lowFrac: 0.80, ticks: [0, 2,  5,  10, 100] };

function piecewiseY(v, cH, cfg) {
  const { split, lowFrac } = cfg;
  if (v <= split)
    return cH * (1 - (v / split) * lowFrac);
  else
    return cH * (1 - lowFrac) * (1 - (v - split) / (100 - split));
}

let trendAnalyses = [];
let selectedFdis  = [];
let chartCanvas   = null;
let trendMode     = 'overall';   // 'overall' | 'detail'
let overallFilter = 'all';       // 'all' | 'upper' | 'lower'
let _animFrame    = null;
let _trendObserver = null;

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

function getFdiPlaqueRatio(record, fdi) {
  const info = record.result.stats.fdi_plaque_summary[String(fdi)];
  if (!info) return 0;
  const stats = record.result.stats;
  const totalVerts = info.jaw === 'upper'
    ? (stats.upper_vertices || stats.total_vertices / 2)
    : (stats.lower_vertices || stats.total_vertices / 2);
  return (info.hit_verts ?? 0) / totalVerts * 100;
}

// ===== Overall 模式資料 =====
function getOverallValue(record, filter) {
  const stats = record.result.stats;
  if (filter === 'all') return (stats.plaque_ratio ?? 0) * 100;
  if (filter === 'upper') return (stats.upper_plaque_ratio ?? 0) * 100;
  if (filter === 'lower') return (stats.lower_plaque_ratio ?? 0) * 100;
  return 0;
}

function getOverallMax(records, filter) {
  return 100;
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

function drawGridAndAxes(ctx, W, H, PAD, n, records, maxY, yFmt, yCfg) {
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top  - PAD.bottom;

  // 格線 + Y 軸（分段刻度）
  ctx.strokeStyle = 'rgba(3,105,94,0.08)';
  ctx.lineWidth = 1;
  yCfg.ticks.forEach(tick => {
    const y = PAD.top + piecewiseY(tick, cH, yCfg);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
    ctx.fillStyle = '#5a7068';
    ctx.font = '11px DM Sans, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${tick}%`, PAD.left - 6, y + 4);
  });
  // split 分界線（虛線）提示刻度切換
  const ySplit = PAD.top + piecewiseY(yCfg.split, cH, yCfg);
  ctx.save();
  ctx.strokeStyle = 'rgba(3,105,94,0.20)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(PAD.left, ySplit); ctx.lineTo(PAD.left + cW, ySplit); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

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
function drawOverallChart(records, filter, progress = 1) {
  const init = initCanvas();
  if (!init) return;
  const { ctx, W, H, PAD } = init;
  const n = records.length;
  const maxY = getOverallMax(records, filter);
  const yFmt = v => `${v.toFixed(1)}%`;
  const { cW, cH } = drawGridAndAxes(ctx, W, H, PAD, n, records, maxY, yFmt, Y_CFG_OVERALL);

  // Y 軸標題（垂直堆疊字元，不旋轉）
  ctx.fillStyle = '#5a7068';
  ctx.font = '11px DM Sans, sans-serif';
  ctx.textAlign = 'center';
  '菌斑覆蓋率'.split('').forEach((ch, i) => {
    ctx.fillText(ch, 10, PAD.top + cH / 2 - 26 + i * 13);
  });

  const points = records.map((r, i) => {
    const val = getOverallValue(r, filter);
    const x = PAD.left + (n === 1 ? cW / 2 : cW * i / (n - 1));
    const y = PAD.top + piecewiseY(val, cH, Y_CFG_OVERALL);
    return { x, y, val };
  });

  // 動畫裁切：只顯示到 progress 對應的 X 位置
  ctx.save();
  ctx.beginPath();
  ctx.rect(PAD.left, 0, cW * progress + 2, H);
  ctx.clip();

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

  ctx.restore(); // 結束裁切

  // 點 + 數值標籤（逐點隨動畫出現）
  points.forEach((p, i) => {
    const ptProg = n === 1 ? 0 : i / (n - 1);
    if (ptProg > progress + 0.01) return;

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
  if (note) note.textContent = '縱軸為菌斑覆蓋率 %（數值越低代表改善越多）';
}

// ===== Detail 折線圖 =====
function drawDetailChart(records, fdis, progress = 1) {
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

  const maxY = 100;
  const yFmt = v => `${v.toFixed(1)}%`;
  const { cW, cH } = drawGridAndAxes(ctx, W, H, PAD, n, records, maxY, yFmt, Y_CFG_DETAIL);

  // Y 軸標題（垂直堆疊字元，不旋轉）
  ctx.fillStyle = '#5a7068';
  ctx.font = '11px DM Sans, sans-serif';
  ctx.textAlign = 'center';
  '菌斑覆蓋率'.split('').forEach((ch, i) => {
    ctx.fillText(ch, 10, PAD.top + cH / 2 - 26 + i * 13);
  });

  fdis.forEach((fdi, fi) => {
    const color = PALETTE[fi % PALETTE.length];
    const points = records.map((r, i) => {
      const ratio = getFdiPlaqueRatio(r, fdi);
      const x = PAD.left + (n === 1 ? cW / 2 : cW * i / (n - 1));
      const y = PAD.top + piecewiseY(ratio, cH, Y_CFG_DETAIL);
      return { x, y };
    });

    // 裁切動畫線段
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, 0, cW * progress + 2, H);
    ctx.clip();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    ctx.restore();

    // 點逐一出現
    points.forEach((p, i) => {
      const ptProg = n === 1 ? 0 : i / (n - 1);
      if (ptProg > progress + 0.01) return;
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
  if (note) note.textContent = '縱軸為菌斑覆蓋率 %（數值越低代表改善越多）';
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

// ===== 動畫執行器 =====
function runChartAnimation(drawFn) {
  if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
  const DURATION = 700;
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / DURATION, 1);
    const progress = 1 - Math.pow(1 - t, 3); // ease-out cubic
    drawFn(progress);
    if (t < 1) _animFrame = requestAnimationFrame(tick);
    else _animFrame = null;
  }
  _animFrame = requestAnimationFrame(tick);
}

// ===== 刷新圖表 =====
function refreshChart(animate = false) {
  const records = buildTrendData(trendAnalyses);
  window._trendSelectedFdis    = [...selectedFdis];
  window._trendMode            = trendMode;
  window._trendOverallFilter   = overallFilter;

  if (trendMode === 'overall') {
    if (animate) {
      runChartAnimation(p => drawOverallChart(records, overallFilter, p));
    } else {
      drawOverallChart(records, overallFilter, 1);
    }
  } else {
    renderLegend(selectedFdis);
    if (animate) {
      runChartAnimation(p => drawDetailChart(records, selectedFdis, p));
    } else {
      drawDetailChart(records, selectedFdis, 1);
    }
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
  refreshChart(true);
};

window.setOverallFilter = function(filter) {
  overallFilter = filter;
  renderOverallControls();
  refreshChart(true);
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

  // 先靜態繪製（確保內容存在），再用 IntersectionObserver 等用戶看到時才播動畫
  refreshChart(false);

  if (_trendObserver) { _trendObserver.disconnect(); _trendObserver = null; }
  if (section && window.IntersectionObserver) {
    _trendObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        refreshChart(true);
        _trendObserver.disconnect();
        _trendObserver = null;
      }
    }, { threshold: 0.3 });
    _trendObserver.observe(section);
  }
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
