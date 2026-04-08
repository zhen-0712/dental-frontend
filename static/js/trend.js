// ===== trend.js - 菌斑趨勢分析 =====
import { API_BASE } from './api.js';
import { getToken, isLoggedIn } from './auth.js';

const ALL_UPPER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const ALL_LOWER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

let trendAnalyses = [];
let selectedFdis  = [];
let chartCanvas   = null;

function buildTrendData(analyses) {
  return analyses
    .filter(a => a.type === 'plaque' && a.status === 'done' &&
                 a.result?.stats?.fdi_plaque_summary &&
                 Object.keys(a.result.stats.fdi_plaque_summary).length > 0)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

function getAllFdiInData(records) {
  const set = new Set();
  records.forEach(r => Object.keys(r.result.stats.fdi_plaque_summary).forEach(fdi => set.add(Number(fdi))));
  return [...set].sort((a, b) => a - b);
}

function getMaxPxAcrossAll(records) {
  let max = 1;
  records.forEach(r => Object.values(r.result.stats.fdi_plaque_summary).forEach(v => {
    if (v.total_plaque_px > max) max = v.total_plaque_px;
  }));
  return max;
}

const PALETTE = [
  '#03695e','#6daf5f','#239dca','#e8a020','#c0392b',
  '#8e44ad','#2980b9','#27ae60','#d35400','#7f8c8d',
];

function drawChart(records, fdis) {
  if (!chartCanvas) return;
  const ctx = chartCanvas.getContext('2d');
  const W = chartCanvas.width, H = chartCanvas.height;
  const PAD = { top: 20, right: 20, bottom: 48, left: 48 };
  const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
  ctx.clearRect(0, 0, W, H);
  if (records.length < 2) {
    ctx.fillStyle = '#5a7068';
    ctx.font = '14px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('需要至少 2 次菌斑分析才能顯示趨勢', W / 2, H / 2);
    return;
  }
  const maxPx = getMaxPxAcrossAll(records), n = records.length;
  ctx.strokeStyle = 'rgba(3,105,94,0.08)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + cH * (1 - i / 4);
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y); ctx.stroke();
    ctx.fillStyle = '#5a7068'; ctx.font = '11px DM Sans, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(maxPx * i / 4)}`, PAD.left - 6, y + 4);
  }
  ctx.fillStyle = '#5a7068'; ctx.font = '11px DM Sans, sans-serif'; ctx.textAlign = 'center';
  records.forEach((r, i) => {
    const x = PAD.left + (n === 1 ? cW / 2 : cW * i / (n - 1));
    const d = new Date(r.created_at);
    ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`, x, PAD.top + cH + 18);
  });
  ctx.save(); ctx.translate(14, PAD.top + cH / 2); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center'; ctx.fillStyle = '#5a7068'; ctx.font = '11px DM Sans, sans-serif';
  ctx.fillText('菌斑像素量', 0, 0); ctx.restore();
  fdis.forEach((fdi, fi) => {
    const color = PALETTE[fi % PALETTE.length];
    const points = records.map((r, i) => {
      const px = r.result.stats.fdi_plaque_summary[String(fdi)]?.total_plaque_px ?? 0;
      const x = PAD.left + (n === 1 ? cW / 2 : cW * i / (n - 1));
      const y = PAD.top + cH * (1 - px / maxPx);
      return { x, y, px };
    });
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    points.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    });
  });
}

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
      let chipClass = 'trend-tooth-chip';
      if (isMissing)       chipClass += ' missing';
      else if (isSelected) chipClass += ' selected';
      else if (!hasPlaque) chipClass += ' no-plaque';
      const clickable = !isMissing ? `onclick="window.toggleTrendFdi(${fdi})"` : '';
      return `<div class="${chipClass}" title="FDI ${fdi}" ${clickable}>${fdi}</div>`;
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
    </div>`;
}

function renderLegend(fdis) {
  const el = document.getElementById('trend-legend');
  if (!el) return;
  el.innerHTML = fdis.map((fdi, i) => `
    <div class="trend-legend-item">
      <span class="trend-legend-dot" style="background:${PALETTE[i % PALETTE.length]};"></span>
      <span>FDI ${fdi}</span>
    </div>`).join('');
}

function refreshSelector() {
  const records = buildTrendData(trendAnalyses);
  renderFdiSelector(getAllFdiInData(records), getMissingFdis());
}

function refreshChart() {
  window._trendSelectedFdis = [...selectedFdis];
  const records = buildTrendData(trendAnalyses);
  drawChart(records, selectedFdis);
  renderLegend(selectedFdis);
}

window.toggleTrendFdi = function(fdi) {
  const idx = selectedFdis.indexOf(fdi);
  if (idx >= 0) selectedFdis.splice(idx, 1);
  else if (selectedFdis.length < 10) selectedFdis.push(fdi);
  refreshSelector(); refreshChart();
};

window.selectAllTrendFdi = function() {
  const records = buildTrendData(trendAnalyses);
  selectedFdis = getAllFdiInData(records).slice(0, 10);
  refreshSelector(); refreshChart();
};

window.clearTrendFdi = function() {
  selectedFdis = []; refreshSelector(); refreshChart();
};

window.selectJawTrendFdi = function(jaw) {
  const records = buildTrendData(trendAnalyses);
  const available = getAllFdiInData(records);
  const missing = getMissingFdis();
  const jawTeeth = jaw === 'upper' ? ALL_UPPER : ALL_LOWER;
  const toAdd = jawTeeth.filter(f => available.includes(f) && !missing.has(f) && !selectedFdis.includes(f));
  selectedFdis = [...selectedFdis, ...toAdd].slice(0, 10);
  refreshSelector(); refreshChart();
};

window.clearJawTrendFdi = function(jaw) {
  const jawTeeth = new Set(jaw === 'upper' ? ALL_UPPER : ALL_LOWER);
  selectedFdis = selectedFdis.filter(f => !jawTeeth.has(f));
  refreshSelector(); refreshChart();
};

window.selectTopTrendFdi = function() {
  const records = buildTrendData(trendAnalyses);
  const fdiTotals = {};
  records.forEach(r => Object.entries(r.result.stats.fdi_plaque_summary).forEach(([fdi, info]) => {
    fdiTotals[fdi] = Math.max(fdiTotals[fdi] || 0, info.total_plaque_px);
  }));
  selectedFdis = Object.entries(fdiTotals)
    .sort((a,b) => b[1]-a[1]).slice(0,5).map(([fdi]) => Number(fdi));
  refreshSelector(); refreshChart();
};

export async function renderTrendSection(analyses) {
  const section = document.getElementById('trend-section');
  if (!section) return;
  if (!isLoggedIn()) { section.classList.add('hidden'); return; }
  trendAnalyses = analyses;
  const records = buildTrendData(analyses);
  if (records.length < 2) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  const availableFdis = getAllFdiInData(records);
  const fdiTotals = {};
  records.forEach(r => Object.entries(r.result.stats.fdi_plaque_summary).forEach(([fdi, info]) => {
    fdiTotals[fdi] = Math.max(fdiTotals[fdi] || 0, info.total_plaque_px);
  }));
  selectedFdis = Object.entries(fdiTotals)
    .sort((a,b) => b[1]-a[1]).slice(0,5).map(([fdi]) => Number(fdi));
  renderFdiSelector(availableFdis, getMissingFdis());
  chartCanvas = document.getElementById('trend-canvas');
  if (chartCanvas) {
    chartCanvas.width  = chartCanvas.offsetWidth  || 600;
    chartCanvas.height = chartCanvas.offsetHeight || 260;
  }
  refreshChart();
}
