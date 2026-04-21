// ===== report.js - PDF 報告產生器（HTML 列印版，支援中文）=====
import { captureJawCharts } from './trend.js';

export async function generateReport(toothData, plaqueStats) {
  const btn = document.getElementById('btn-report');
  if (btn) { btn.disabled = true; btn.textContent = '截圖中，請稍候…'; }

  try {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    // 擷取趨勢圖（整體 + 上下顎詳細）
    let trendImgSrc = '';
    const trendCanvas  = document.getElementById('trend-canvas');
    const trendSection = document.getElementById('trend-section');
    if (trendCanvas && trendSection && !trendSection.classList.contains('hidden')) {
      try { trendImgSrc = trendCanvas.toDataURL('image/png'); } catch(e) {}
    }
    const selectedFdiList = window._trendSelectedFdis  || [];
    const trendMode       = window._trendMode          || 'overall';
    const trendFilter     = window._trendOverallFilter || 'all';

    // 離屏渲染上下顎詳細圖（不影響頁面上的當前選擇）
    const { upper: upperJawImg, lower: lowerJawImg, upperFdis, lowerFdis } = captureJawCharts();

    // ===== 3D 模型截圖（必須循序執行，共用同一個 model-viewer）=====
    if (btn) btn.textContent = '模型截圖中（約 30 秒）…';
    let baseImg   = null;
    let plaqueImg = null;
    try { baseImg   = await snap3D('base');   } catch(e) { console.error('base snap:', e); }
    try { plaqueImg = await snap3D('plaque'); } catch(e) { console.error('plaque snap:', e); }
    restoreViewer();

    // 建構 HTML 並列印
    const html = buildReportHTML(
      toothData, plaqueStats, dateStr,
      trendImgSrc, selectedFdiList, trendMode, trendFilter,
      upperJawImg, lowerJawImg, upperFdis, lowerFdis,
      baseImg, plaqueImg
    );

    const win = window.open('', '_blank');
    if (!win) {
      alert('請允許彈出視窗以產出 PDF 報告。\n（在瀏覽器設定中允許此網頁的彈出視窗）');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.addEventListener('load', () => { win.focus(); win.print(); });
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '產出 PDF 報告'; }
  }
}

// ===== 3D 截圖（循序呼叫，每次操作同一個 model-viewer）=====
async function snap3D(mode) {
  const frame = document.getElementById('viewer-frame');
  if (!frame) return null;

  const { getFileUrl } = await import('./api.js');
  const glbUrl = getFileUrl(mode === 'plaque' ? 'plaque_by_fdi.glb' : 'custom_real_teeth.glb');

  const mv = frame.querySelector('model-viewer');
  if (!mv) return null;

  // 俯視咬合面：polar=10deg（接近正上方），FOV 稍大以涵蓋整個牙弓
  mv.removeAttribute('auto-rotate');
  mv.setAttribute('camera-orbit',  '0deg 10deg auto');
  mv.setAttribute('field-of-view', '45deg');
  mv.setAttribute('src', glbUrl);

  await new Promise(resolve => {
    const timeout = setTimeout(resolve, 16000);
    mv.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
  });
  await new Promise(r => setTimeout(r, 1800));

  try {
    const blob = await mv.toBlob({ idealAspect: false });
    return await blobToBase64(blob);
  } catch(e) {
    console.error('toBlob failed:', e);
    return null;
  }
}

function restoreViewer() {
  try {
    const mv = document.querySelector('#viewer-frame model-viewer');
    if (!mv) return;
    import('./api.js').then(({ getFileUrl }) => {
      mv.setAttribute('src', getFileUrl('plaque_by_fdi.glb'));
      mv.setAttribute('auto-rotate', '');
      mv.removeAttribute('camera-orbit');
      mv.removeAttribute('field-of-view');
    });
  } catch(e) {}
}

// ===== HTML 報告建構 =====
function buildReportHTML(
  toothData, plaqueStats, dateStr,
  trendImgSrc, selectedFdiList, trendMode, trendFilter,
  upperJawImg, lowerJawImg, upperFdis, lowerFdis,
  baseImg, plaqueImg
) {
  const C = { jade:'#03695e', red:'#c0392b', muted:'#5a7068', ink:'#1a2420', bg:'#eaede3', aqua:'#239dca' };

  // ===== 牙齒偵測摘要 =====
  let toothSection = '';
  if (toothData) {
    const never = toothData.never_detected || [];
    toothSection = sec('牙齒偵測摘要', `
      <table class="info-table">
        <tr><td class="lbl">偵測牙齒數</td><td class="val">${toothData.total_detected ?? '-'} 顆</td></tr>
        <tr><td class="lbl">可靠偵測數</td><td class="val">${toothData.reliable_count ?? '-'} 顆</td></tr>
        <tr><td class="lbl">未偵測到</td><td class="val">${never.length} 顆</td></tr>
        <tr><td class="lbl">缺牙列表</td><td class="val">${never.length > 0 ? never.join('、') : '無'}</td></tr>
      </table>
    `);
  }

  // ===== 菌斑分析摘要 =====
  let plaqueSection = '';
  let barSection    = '';
  if (plaqueStats) {
    const summary = plaqueStats.fdi_plaque_summary || {};
    const ratio   = plaqueStats.plaque_ratio != null
      ? `${(plaqueStats.plaque_ratio * 100).toFixed(1)}%` : '-';

    plaqueSection = sec('菌斑分析摘要', `
      <table class="info-table">
        <tr><td class="lbl">菌斑覆蓋率</td><td class="val">${ratio}</td></tr>
        <tr><td class="lbl">有菌斑牙齒</td><td class="val">${Object.keys(summary).length} 顆</td></tr>
        <tr><td class="lbl">菌斑頂點數</td><td class="val">${plaqueStats.plaque_vertices ?? '-'}</td></tr>
        <tr><td class="lbl">總頂點數</td><td class="val">${plaqueStats.total_vertices ?? '-'}</td></tr>
      </table>
    `);

    const sorted = Object.entries(summary).sort((a, b) => b[1].total_plaque_px - a[1].total_plaque_px);
    const maxPx  = sorted[0]?.[1].total_plaque_px || 1;
    const bars   = sorted.map(([fdi, info]) => {
      const pct = (info.total_plaque_px / maxPx * 100).toFixed(1);
      const jaw = info.jaw === 'upper' ? '上' : '下';
      return `
        <div class="bar-row">
          <div class="bar-lbl">${fdi}(${jaw})</div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <div class="bar-num">${info.total_plaque_px}px</div>
        </div>`;
    }).join('');
    barSection = sec('各顆牙齒菌斑量', `<div class="bar-chart">${bars}</div>`);
  }

  // ===== 趨勢圖：整體 =====
  let trendSection = '';
  if (trendImgSrc) {
    const modeLabel   = trendMode === 'overall' ? '整體趨勢' : '牙齒明細';
    const filterLabel = trendMode === 'overall'
      ? { all:'全部', upper:'上顎', lower:'下顎' }[trendFilter]
      : (selectedFdiList.length > 0 ? `FDI：${selectedFdiList.join('、')}` : '');
    const subtitle = filterLabel ? `${modeLabel} · ${filterLabel}` : modeLabel;
    trendSection = sec(`菌斑趨勢（${subtitle}）`, `
      <img src="${trendImgSrc}" style="width:100%;border-radius:6px;display:block;" />
    `);
  }

  // ===== 趨勢圖：上顎詳細 =====
  let trendUpperSection = '';
  if (upperJawImg) {
    trendUpperSection = sec(`上顎菌斑趨勢（FDI：${upperFdis.join('、')}）`, `
      <img src="${upperJawImg}" style="width:100%;border-radius:6px;display:block;" />
    `);
  }

  // ===== 趨勢圖：下顎詳細 =====
  let trendLowerSection = '';
  if (lowerJawImg) {
    trendLowerSection = sec(`下顎菌斑趨勢（FDI：${lowerFdis.join('、')}）`, `
      <img src="${lowerJawImg}" style="width:100%;border-radius:6px;display:block;" />
    `);
  }

  // ===== 3D 模型截圖 =====
  const imgStyle  = 'width:100%;border-radius:6px;display:block;background:#f4f4f0;';
  const noSnap    = `<div style="padding:48px 0;background:#eaede3;border-radius:6px;text-align:center;color:#5a7068;font-size:11px;">截圖不可用</div>`;
  const snapSection = sec('3D 模型截圖（俯視咬合面）', `
    <div style="display:flex;gap:14px;">
      <div style="flex:1;text-align:center;">
        ${baseImg   ? `<img src="${baseImg}"   style="${imgStyle}" />` : noSnap}
        <p class="snap-label">牙齒模型</p>
      </div>
      <div style="flex:1;text-align:center;">
        ${plaqueImg ? `<img src="${plaqueImg}" style="${imgStyle}" />` : noSnap}
        <p class="snap-label">菌斑模型</p>
      </div>
    </div>
  `);

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DentalVis 牙齒健康分析報告 ${dateStr}</title>
<style>
  @page { size: A4; margin: 16mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Noto Sans TC', 'PingFang TC', '微軟正黑體', 'Microsoft JhengHei', sans-serif;
    color: ${C.ink}; background: #fff; font-size: 13px; line-height: 1.6;
  }
  .rpt-header {
    background: ${C.jade}; color: #fff; padding: 13px 18px; border-radius: 6px;
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px;
  }
  .rpt-header h1 { font-size: 20px; font-weight: 700; }
  .rpt-header .sub { font-size: 11px; opacity: 0.85; margin-top: 2px; }
  .rpt-header .date { font-size: 13px; font-weight: 600; text-align: right; }
  .rpt-header .disc { font-size: 10px; opacity: 0.8; text-align: right; margin-top: 2px; }
  .rpt-section { margin-bottom: 18px; page-break-inside: avoid; }
  .rpt-title {
    background: ${C.bg}; color: ${C.jade}; font-size: 10.5px; font-weight: 700;
    padding: 4px 10px; border-radius: 4px; margin-bottom: 8px; letter-spacing: 0.05em;
  }
  .info-table { width: 100%; border-collapse: collapse; }
  .info-table tr:nth-child(even) { background: #f9faf6; }
  .info-table td { padding: 5px 10px; font-size: 12.5px; }
  .info-table td.lbl { color: ${C.muted}; width: 110px; }
  .info-table td.val { font-weight: 600; color: ${C.ink}; }
  .bar-chart { display: flex; flex-direction: column; gap: 3px; }
  .bar-row { display: flex; align-items: center; gap: 8px; }
  .bar-lbl { width: 46px; font-size: 10.5px; color: ${C.muted}; text-align: right; flex-shrink: 0; }
  .bar-track { flex: 1; height: 9px; background: ${C.bg}; border-radius: 5px; overflow: hidden; }
  .bar-fill { height: 100%; background: ${C.red}; border-radius: 5px; }
  .bar-num { width: 58px; font-size: 10.5px; color: ${C.muted}; }
  .snap-label { font-size: 11px; color: ${C.muted}; margin-top: 6px; }
  .rpt-footer {
    margin-top: 24px; padding-top: 10px; border-top: 1px solid #dde2d6;
    font-size: 9.5px; color: ${C.muted}; text-align: center;
  }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .rpt-section { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<div class="rpt-header">
  <div><h1>DentalVis</h1><div class="sub">牙齒健康分析報告</div></div>
  <div><div class="date">${dateStr}</div><div class="disc">僅供參考，請諮詢牙醫師</div></div>
</div>

${toothSection}
${plaqueSection}
${barSection}
${trendSection}
${trendUpperSection}
${trendLowerSection}
${snapSection}

<div class="rpt-footer">
  DentalVis &nbsp;·&nbsp; ${dateStr} &nbsp;·&nbsp; 本報告僅供個人參考，實際診斷請諮詢專業牙醫師
</div>

</body>
</html>`;
}

// ===== Helpers =====
function sec(title, body) {
  return `<div class="rpt-section"><div class="rpt-title">${title}</div>${body}</div>`;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
