// ===== history.js - 歷史分析區塊 =====
import { API_BASE } from './api.js';
import { getToken, isLoggedIn } from './auth.js';

const ALL_UPPER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const ALL_LOWER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

let allAnalyses = [];
let currentFilter = 'week';
let currentWeekOffset  = 0;
let currentMonthOffset = 0;

export async function fetchAnalyses() {
  const token = getToken();
  if (!token) return [];
  const res = await fetch(`${API_BASE}/analyses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return res.json();
}

function getWeekRange(offset) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function getMonthRange(offset) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function filterByTime(analyses) {
  if (currentFilter === 'week') {
    const { start, end } = getWeekRange(currentWeekOffset);
    return analyses.filter(a => { const d = new Date(a.created_at); return d >= start && d <= end; });
  }
  if (currentFilter === 'month') {
    const { start, end } = getMonthRange(currentMonthOffset);
    return analyses.filter(a => { const d = new Date(a.created_at); return d >= start && d <= end; });
  }
  return analyses;
}

function weekLabel(offset) {
  const { start, end } = getWeekRange(offset);
  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
  if (offset === 0) return `本週 (${fmt(start)}–${fmt(end)})`;
  if (offset === -1) return `上週 (${fmt(start)}–${fmt(end)})`;
  return `${fmt(start)}–${fmt(end)}`;
}

function monthLabel(offset) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  if (offset === 0) return `本月 (${d.getFullYear()}/${d.getMonth()+1})`;
  return `${d.getFullYear()}年${d.getMonth()+1}月`;
}

function getOffsets() {
  const weeks = new Set(), months = new Set();
  const now = new Date();
  allAnalyses.forEach(a => {
    const d = new Date(a.created_at);
    const thisMonday = new Date(now);
    const day = now.getDay();
    thisMonday.setDate(now.getDate() - (day===0?6:day-1));
    thisMonday.setHours(0,0,0,0);
    const recMonday = new Date(d);
    const rday = d.getDay();
    recMonday.setDate(d.getDate() - (rday===0?6:rday-1));
    recMonday.setHours(0,0,0,0);
    weeks.add(Math.round((recMonday - thisMonday) / (7*24*3600*1000)));
    months.add((d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()));
  });
  return {
    weekOffsets:  [...weeks].sort((a,b)=>b-a).slice(0,12),
    monthOffsets: [...months].sort((a,b)=>b-a).slice(0,12),
  };
}

function makeDropdown(id, items, activeVal, onSelect) {
  const activeLabel = items.find(i=>i.val===activeVal)?.label || items[0]?.label || '選擇';
  return `
    <div class="hf-dropdown" id="${id}">
      <div class="hf-dropdown-trigger" onclick="window.toggleHfDropdown('${id}')">
        <span id="${id}-label">${activeLabel}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="hf-dropdown-menu">
        ${items.map(item => `
          <div class="hf-dropdown-item ${item.val===activeVal?'active':''}"
               onclick="window.selectHfItem('${id}', ${item.val}, '${item.label}', '${onSelect}')">
            ${item.label}
          </div>
        `).join('')}
      </div>
    </div>`;
}

function buildFilterUI() {
  const wrap = document.getElementById('history-filter-wrap') || document.querySelector('.history-filter');
  if (!wrap) return;
  const { weekOffsets, monthOffsets } = getOffsets();
  const weekItems  = weekOffsets.map(o => ({ val: o, label: weekLabel(o) }));
  const monthItems = monthOffsets.map(o => ({ val: o, label: monthLabel(o) }));
  const showWeekDD  = currentFilter === 'week'  && weekItems.length  > 0;
  const showMonthDD = currentFilter === 'month' && monthItems.length > 0;
  wrap.innerHTML = `
    <div class="history-filter-ui">
      ${showWeekDD  ? makeDropdown('hf-week-dd',  weekItems,  currentWeekOffset,  'onWeekSelect')  : ''}
      ${showMonthDD ? makeDropdown('hf-month-dd', monthItems, currentMonthOffset, 'onMonthSelect') : ''}
      <div class="history-filter-tabs">
        <button class="history-filter-btn ${currentFilter==='week' ?'active':''}" onclick="window.setHistoryFilter('week')">週</button>
        <button class="history-filter-btn ${currentFilter==='month'?'active':''}" onclick="window.setHistoryFilter('month')">月</button>
        <button class="history-filter-btn ${currentFilter==='all'  ?'active':''}" onclick="window.setHistoryFilter('all')">全部</button>
      </div>
    </div>`;
  document.addEventListener('click', closeAllDropdowns, { once: false });
}

function closeAllDropdowns(e) {
  if (!e.target.closest('.hf-dropdown')) {
    document.querySelectorAll('.hf-dropdown.open').forEach(d => d.classList.remove('open'));
  }
}

// ===== 準確度計算 =====
function calcToothAccuracySimple(t) {
  if (!t || !t.teeth) return null;
  const total = Object.keys(t.teeth).length;
  if (total === 0) return null;
  const detected = (t.detected_teeth || []).length;
  const never    = (t.never_detected || []).length;
  const coverage = detected / (detected + never || 1);
  const confidences = Object.values(t.teeth).map(x => x.confidence || 0);
  const avgConf = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const multiView = Object.values(t.teeth).filter(x => x.num_views >= 2).length / total;
  const score = coverage * 0.35 + avgConf * 0.40 + multiView * 0.25;
  return { score, grade: score >= 0.85 ? 'A' : score >= 0.70 ? 'B' : score >= 0.55 ? 'C' : 'D' };
}

function calcPlaqueAccuracySimple(s, toothAnalysis) {
  if (!s || !s.fdi_plaque_summary) return null;
  const summary = s.fdi_plaque_summary;
  const total = Object.keys(summary).length;
  if (total === 0) return null;
  const hits = Object.values(summary).filter(v => v.hit_verts > 0).length;
  const satTotal = s.sat_plaque_fdi_count || total;
  const hitRate = hits / satTotal;
  const teethMap = (toothAnalysis && toothAnalysis.teeth) ? toothAnalysis.teeth : {};
  const cross = Object.keys(summary).filter(fdi => {
    const ti = teethMap[fdi];
    return ti && (ti.detected_in_views || []).length >= 2 && (summary[fdi].hit_verts || 0) > 0;
  }).length;
  const crossRate = cross / total;
  const score = hitRate * 0.60 + crossRate * 0.40;
  return { score, grade: score >= 0.80 ? 'A' : score >= 0.60 ? 'B' : score >= 0.40 ? 'C' : 'D' };
}

function gradeColor(g) {
  return g === 'A' ? '#03695e' : g === 'B' ? '#6daf5f' : g === 'C' ? '#e8a020' : '#c0392b';
}

function renderAccuracyMini(score, grade, label) {
  const pct = (score * 100).toFixed(0);
  const color = gradeColor(grade);
  return `
    <div class="history-accuracy-mini">
      <span class="history-acc-label">${label}</span>
      <div class="history-acc-bar-wrap">
        <div class="history-acc-bar" style="width:${pct}%;background:${color};"></div>
      </div>
      <span class="history-acc-grade" style="color:${color};">${grade}</span>
      <span class="history-acc-pct">${pct}%</span>
    </div>`;
}

export async function renderHistorySection() {
  const section = document.getElementById('history-section');
  if (!section) return;
  if (!isLoggedIn()) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  allAnalyses = await fetchAnalyses();
  renderHistoryGrid();
}

function renderHistoryGrid() {
  const grid = document.getElementById('history-grid');
  if (!grid) return;
  buildFilterUI();
  const filtered = filterByTime(allAnalyses);
  if (filtered.length === 0) {
    grid.innerHTML = `<p class="history-empty">${currentFilter === 'week' ? '本週' : currentFilter === 'month' ? '本月' : ''}尚無分析記錄</p>`;
    return;
  }
  grid.innerHTML = filtered.map(a => renderCard(a)).join('');
}

function renderCard(a) {
  const typeLabel = a.type === 'init' ? '初始化' : '菌斑分析';
  const typeClass = a.type === 'init' ? 'init' : 'plaque';
  const statusDot  = { done: 'done', failed: 'failed', running: 'running', queued: 'running' }[a.status] || 'running';
  const statusText = { done: '完成', failed: '失敗', running: '進行中', queued: '等待中' }[a.status] || a.status;
  const date = new Date(a.created_at).toLocaleString('zh-TW', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  let summaryHtml = '', detailHtml = '';
  if (a.status === 'done' && a.result) {
    if (a.type === 'plaque' && a.result.stats) {
      const s = a.result.stats;
      const ratio = s.plaque_ratio != null ? `${(s.plaque_ratio * 100).toFixed(1)}%` : '—';
      const teeth = Object.keys(s.fdi_plaque_summary || {}).length;
      const toothAna = a.result?.tooth_analysis || null;
      const acc = calcPlaqueAccuracySimple(s, toothAna);
      summaryHtml = `
        <div class="history-summary">
          <div class="history-summary-item">
            <span class="history-summary-val red">${ratio}</span>
            <span class="history-summary-label">菌斑覆蓋率</span>
          </div>
          <div class="history-summary-item">
            <span class="history-summary-val">${teeth}</span>
            <span class="history-summary-label">有菌斑牙齒</span>
          </div>
          ${acc ? `<div class="history-summary-item">
            <span class="history-summary-val" style="color:${gradeColor(acc.grade)};font-size:1.5rem;">${acc.grade}</span>
            <span class="history-summary-label">分析準確度</span>
          </div>` : ''}
        </div>
        ${acc ? renderAccuracyMini(acc.score, acc.grade, '菌斑分析準確度') : ''}`;
      detailHtml = renderPlaqueDetail(a.result.stats, a.result.tooth_analysis || a.result.tooth_data || null);
    } else if (a.type === 'init' && a.result.tooth_analysis) {
      const t = a.result.tooth_analysis;
      const acc = calcToothAccuracySimple(t);
      summaryHtml = `
        <div class="history-summary">
          <div class="history-summary-item">
            <span class="history-summary-val">${t.total_detected ?? '—'}</span>
            <span class="history-summary-label">偵測牙齒</span>
          </div>
          <div class="history-summary-item">
            <span class="history-summary-val">${(t.never_detected || []).length}</span>
            <span class="history-summary-label">未偵測到</span>
          </div>
          ${acc ? `<div class="history-summary-item">
            <span class="history-summary-val" style="color:${gradeColor(acc.grade)};font-size:1.5rem;">${acc.grade}</span>
            <span class="history-summary-label">模型準確度</span>
          </div>` : ''}
        </div>
        ${acc ? renderAccuracyMini(acc.score, acc.grade, '模型還原準確度') : ''}`;
      detailHtml = renderToothDetail(t);
    }
  }
  return `
    <div class="history-card" id="hcard-${a.id}">
      <div class="history-card-header" onclick="window.toggleHistoryCard(${a.id})">
        <div class="history-card-meta">
          <span class="history-type-badge ${typeClass}">${typeLabel}</span>
          <span class="history-date">${date}</span>
        </div>
        <div class="history-card-right">
          <div class="history-status">
            <div class="history-status-dot ${statusDot}"></div>
            ${statusText}
          </div>
          <svg class="history-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      ${summaryHtml}
      <div class="history-detail">
        ${detailHtml || '<p style="color:var(--muted);font-size:0.875rem;">無詳細資料</p>'}
      </div>
    </div>`;
}

function renderToothDetail(t) {
  const detected = new Set((t.detected_teeth || []).map(Number));
  const missing  = new Set((t.never_detected || []).map(Number));
  const suspects = new Set([
    ...(t.suspicious?.low_confidence || []),
    ...(t.suspicious?.insufficient_views || []),
  ].map(Number));
  const makeRow = (teeth, label) => `
    <div class="history-tooth-row">
      <span class="history-tooth-label">${label}</span>
      ${teeth.map(n => {
        const cls = missing.has(n) ? 'missing' : suspects.has(n) ? 'suspect' : detected.has(n) ? 'present' : 'missing';
        return `<div class="history-tooth-chip ${cls}" title="FDI ${n}">${n}</div>`;
      }).join('')}
    </div>`;
  const missingList = (t.never_detected || []);
  const missingHtml = missingList.length > 0
    ? `<p class="history-detail-title" style="margin-top:0.875rem;">缺牙</p>
       <div class="history-missing-list">${missingList.map(n => `<span class="missing-badge">${n}</span>`).join('')}</div>`
    : '';
  const suspectList = [...(t.suspicious?.insufficient_views || []), ...(t.suspicious?.low_confidence || [])];
  const suspectHtml = suspectList.length > 0
    ? `<p class="history-detail-title" style="margin-top:0.875rem;">視角不足 / 可信度低</p>
       <div class="history-missing-list">${suspectList.map(n => `<span class="suspect-badge">${n}</span>`).join('')}</div>`
    : '';
  const acc = calcToothAccuracySimple(t);
  const accHtml = acc ? `
    <p class="history-detail-title" style="margin-top:0.875rem;">各項指標</p>
    <div style="display:flex;flex-direction:column;gap:4px;">
      ${[
        ['偵測覆蓋率', (t.detected_teeth||[]).length / ((t.detected_teeth||[]).length + (t.never_detected||[]).length || 1)],
        ['平均可信度', Object.values(t.teeth||{}).reduce((a,b) => a+(b.confidence||0), 0) / (Object.keys(t.teeth||{}).length || 1)],
        ['多視角驗證', Object.values(t.teeth||{}).filter(x => x.num_views >= 2).length / (Object.keys(t.teeth||{}).length || 1)],
      ].map(([label, val]) => `
        <div style="display:grid;grid-template-columns:80px 1fr 36px;align-items:center;gap:8px;">
          <span style="font-size:0.72rem;color:var(--muted);">${label}</span>
          <div style="height:5px;background:rgba(3,105,94,0.08);border-radius:99px;overflow:hidden;">
            <div style="height:100%;width:${(val*100).toFixed(0)}%;background:${gradeColor(acc.grade)};border-radius:99px;"></div>
          </div>
          <span style="font-size:0.7rem;color:var(--muted);text-align:right;">${(val*100).toFixed(0)}%</span>
        </div>`).join('')}
    </div>` : '';
  return `
    <p class="history-detail-title">牙齒分布</p>
    <div class="history-tooth-chart">
      ${makeRow(ALL_UPPER, '上')}
      ${makeRow(ALL_LOWER, '下')}
    </div>
    ${missingHtml}${suspectHtml}${accHtml}`;
}

function renderPlaqueDetail(stats, toothData) {
  const summary = stats.fdi_plaque_summary || {};
  const maxPx   = Math.max(...Object.values(summary).map(v => v.total_plaque_px), 1);
  const plaqueMap = {};
  Object.entries(summary).forEach(([fdi, info]) => { plaqueMap[Number(fdi)] = info.total_plaque_px; });
  const missing = new Set(
    (toothData?.never_detected || window._toothData?.never_detected || []).map(Number)
  );
  const makeRow = (teeth, label) => `
    <div class="history-plaque-row">
      <span class="history-tooth-label">${label}</span>
      ${teeth.map(t => {
        const isMissing = missing.has(t);
        const px  = isMissing ? 0 : (plaqueMap[t] || 0);
        const pct = isMissing ? 0 : Math.round(px / maxPx * 100);
        const cls = isMissing ? 'missing-tooth' : '';
        return `<div class="history-plaque-chip ${cls}" title="FDI ${t}: ${isMissing ? '缺牙' : px+' px'}">
          <div class="history-plaque-fill" style="height:${pct}%"></div>
          <span class="history-plaque-num">${t}</span>
        </div>`;
      }).join('')}
    </div>`;
  const topTeeth = Object.entries(summary).sort((a,b) => b[1].total_plaque_px - a[1].total_plaque_px).slice(0, 5);
  const topHtml = topTeeth.length > 0 ? `
    <p class="history-detail-title" style="margin-top:0.875rem;">菌斑最多的牙齒</p>
    <div style="display:flex;flex-direction:column;gap:4px;">
      ${topTeeth.map(([fdi, info]) => `
        <div style="display:grid;grid-template-columns:32px 1fr 48px;align-items:center;gap:8px;">
          <span style="font-size:0.75rem;font-weight:700;color:var(--jade);">${fdi}</span>
          <div style="height:6px;background:rgba(3,105,94,0.08);border-radius:99px;overflow:hidden;">
            <div style="height:100%;width:${(info.total_plaque_px/maxPx*100).toFixed(0)}%;background:linear-gradient(90deg,var(--red-plaque),#e74c3c);border-radius:99px;"></div>
          </div>
          <span style="font-size:0.7rem;color:var(--muted);text-align:right;">${info.total_plaque_px}px</span>
        </div>`).join('')}
    </div>` : '';
  const toothAnaD = toothData || window._toothData || null;
  const acc = calcPlaqueAccuracySimple(stats, toothAnaD);
  const total = Object.keys(summary).length;
  const hits = Object.values(summary).filter(v => v.hit_verts > 0).length;
  const teethMapD = (toothData && toothData.teeth) ? toothData.teeth : (window._toothData?.teeth || {});
  const cross = Object.keys(summary).filter(fdi => {
    const ti = teethMapD[fdi];
    return ti && (ti.detected_in_views||[]).length >= 2 && (summary[fdi].hit_verts||0) > 0;
  }).length;
  const accHtml = acc ? `
    <p class="history-detail-title" style="margin-top:0.875rem;">各項指標</p>
    <div style="display:flex;flex-direction:column;gap:4px;">
      ${[
        ['投射命中率', hits / (total || 1)],
        ['多視角驗證', cross / (total || 1)],
      ].map(([label, val]) => `
        <div style="display:grid;grid-template-columns:80px 1fr 36px;align-items:center;gap:8px;">
          <span style="font-size:0.72rem;color:var(--muted);">${label}</span>
          <div style="height:5px;background:rgba(3,105,94,0.08);border-radius:99px;overflow:hidden;">
            <div style="height:100%;width:${(val*100).toFixed(0)}%;background:${gradeColor(acc.grade)};border-radius:99px;"></div>
          </div>
          <span style="font-size:0.7rem;color:var(--muted);text-align:right;">${(val*100).toFixed(0)}%</span>
        </div>`).join('')}
    </div>` : '';
  return `
    <p class="history-detail-title">各牙菌斑分布</p>
    <div class="history-plaque-chart">
      ${makeRow(ALL_UPPER, '上')}
      ${makeRow(ALL_LOWER, '下')}
    </div>
    ${topHtml}${accHtml}`;
}

export function toggleHfDropdown(id) {
  const dd = document.getElementById(id);
  if (!dd) return;
  const wasOpen = dd.classList.contains('open');
  document.querySelectorAll('.hf-dropdown.open').forEach(d => d.classList.remove('open'));
  if (!wasOpen) dd.classList.add('open');
}

export function selectHfItem(ddId, val, label, fnName) {
  document.getElementById(ddId)?.classList.remove('open');
  document.getElementById(`${ddId}-label`).textContent = label;
  document.querySelectorAll(`#${ddId} .hf-dropdown-item`).forEach(el => {
    el.classList.toggle('active', el.textContent.trim() === label);
  });
  if (fnName === 'onWeekSelect')  window.onWeekSelect(val);
  if (fnName === 'onMonthSelect') window.onMonthSelect(val);
}

export function toggleHistoryCard(id) {
  const card = document.getElementById(`hcard-${id}`);
  if (!card) return;
  card.classList.toggle('expanded');
}

export function setHistoryFilter(filter) {
  currentFilter = filter;
  if (filter === 'week')  currentWeekOffset  = 0;
  if (filter === 'month') currentMonthOffset = 0;
  renderHistoryGrid();
}

export function onWeekSelect(val) {
  currentWeekOffset = parseInt(val);
  renderHistoryGrid();
}

export function onMonthSelect(val) {
  currentMonthOffset = parseInt(val);
  renderHistoryGrid();
}

export function scrollToHistory(e) {
  if (e) e.preventDefault();
  const section = document.getElementById('history-section');
  if (!section) return;
  if (section.classList.contains('hidden') && isLoggedIn()) section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth' });
}
