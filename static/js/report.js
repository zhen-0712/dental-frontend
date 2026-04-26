// ===== report.js - PDF 報告產生器（HTML 列印版，支援中文）=====
import { captureOverallChart, captureJawCharts } from './trend.js';

// 五個截圖角度（菌斑模型）
const SNAP_ANGLES = [
  { label: '左側',  orbit: '90deg 75deg auto',  fov: '38deg' },
  { label: '右側',  orbit: '270deg 75deg auto', fov: '38deg' },
  { label: '正面',  orbit: '0deg 75deg auto',   fov: '38deg' },
  { label: '上俯視', orbit: '0deg 5deg auto',   fov: '45deg' },
  { label: '下俯視', orbit: '0deg 175deg auto', fov: '45deg' },
];

export async function generateReport(toothData, plaqueStats) {
  const btn = document.getElementById('btn-report');
  if (btn) { btn.disabled = true; btn.textContent = '準備中…'; }

  try {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    // ===== 趨勢圖（全部離屏渲染，不影響頁面）=====
    const overallImg = captureOverallChart();
    const { upper: upperJawImg, lower: lowerJawImg, upperFdis, lowerFdis } = captureJawCharts();

    // ===== 3D 菌斑模型：5 個角度（循序截圖）=====
    if (btn) btn.textContent = '3D 模型載入中…';
    const snapResults = await snapPlaqueAllAngles(btn);
    restoreViewer();

    // ===== 建構 HTML 並列印 =====
    const html = buildReportHTML(
      toothData, plaqueStats, dateStr,
      overallImg, upperJawImg, lowerJawImg, upperFdis, lowerFdis,
      snapResults
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

// ===== 3D 截圖：載入一次，循環變換角度 =====
async function snapPlaqueAllAngles(btn) {
  const frame = document.getElementById('viewer-frame');
  if (!frame) return [];

  const { getFileUrl } = await import('./api.js');
  const glbUrl = getFileUrl('plaque_by_fdi.glb');
  const mv = frame.querySelector('model-viewer');
  if (!mv) return [];

  // 載入模型一次
  mv.removeAttribute('auto-rotate');
  mv.setAttribute('field-of-view', '38deg');
  mv.setAttribute('src', glbUrl);

  await new Promise(resolve => {
    const timeout = setTimeout(resolve, 16000);
    mv.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
  });
  await new Promise(r => setTimeout(r, 1200));

  // 循環 5 個角度
  const results = [];
  for (let i = 0; i < SNAP_ANGLES.length; i++) {
    const { label, orbit, fov } = SNAP_ANGLES[i];
    if (btn) btn.textContent = `截圖中 ${i + 1}/${SNAP_ANGLES.length}（${label}）…`;

    mv.setAttribute('camera-orbit', orbit);
    mv.setAttribute('field-of-view', fov);
    await new Promise(r => setTimeout(r, 900)); // 等相機移動與重繪穩定

    let img = null;
    try {
      const blob = await mv.toBlob({ idealAspect: false });
      img = await blobToBase64(blob);
    } catch(e) { console.error(`snap ${label} failed:`, e); }
    results.push({ label, img });
  }
  return results;
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
  overallImg, upperJawImg, lowerJawImg, upperFdis, lowerFdis,
  snapResults
) {
  const C = { jade:'#03695e', red:'#c0392b', muted:'#5a7068', ink:'#1a2420', bg:'#eaede3' };

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

  // ===== 趨勢圖：整體（全部）=====
  const trendSection = overallImg
    ? sec('菌斑趨勢（整體趨勢 · 全部）',
        `<img src="${overallImg}" style="width:100%;border-radius:6px;display:block;" />`)
    : '';

  // ===== 趨勢圖：上顎詳細 =====
  const trendUpperSection = upperJawImg
    ? sec(`上顎菌斑趨勢（FDI：${upperFdis.join('、')}）`,
        `<img src="${upperJawImg}" style="width:100%;border-radius:6px;display:block;" />`)
    : '';

  // ===== 趨勢圖：下顎詳細 =====
  const trendLowerSection = lowerJawImg
    ? sec(`下顎菌斑趨勢（FDI：${lowerFdis.join('、')}）`,
        `<img src="${lowerJawImg}" style="width:100%;border-radius:6px;display:block;" />`)
    : '';

  // ===== 3D 模型截圖（5 個角度）=====
  const noSnap = `<div style="padding:32px 0;background:#eaede3;border-radius:6px;text-align:center;color:#5a7068;font-size:10px;">截圖不可用</div>`;
  const snapCells = SNAP_ANGLES.map(({ label }) => {
    const found = snapResults.find(r => r.label === label);
    const img   = found?.img;
    return `
      <div style="text-align:center;">
        ${img ? `<img src="${img}" style="width:100%;border-radius:6px;display:block;background:#f4f4f0;" />` : noSnap}
        <p style="font-size:10.5px;color:#5a7068;margin-top:5px;">${label}</p>
      </div>`;
  }).join('');

  const snapSection = sec('3D 菌斑模型截圖', `
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
      ${snapCells}
    </div>
    <p style="font-size:10px;color:#5a7068;margin-top:6px;">紅色區域為偵測到的菌斑位置</p>
  `);

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Smile Guardian 牙齒健康分析報告 ${dateStr}</title>
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
  <div><h1>Smile Guardian</h1><div class="sub">牙齒健康分析報告</div></div>
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
  Smile Guardian &nbsp;·&nbsp; ${dateStr} &nbsp;·&nbsp; 本報告僅供個人參考，實際診斷請諮詢專業牙醫師
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
