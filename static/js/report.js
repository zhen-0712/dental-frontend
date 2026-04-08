// ===== report.js - PDF Report Generator =====

const JADE   = [3, 105, 94];
const RED    = [192, 57, 43];
const MUTED  = [90, 112, 104];
const INK    = [26, 36, 32];
const BG     = [234, 237, 227];
const WHITE  = [255, 255, 255];

export async function generateReport(toothData, plaqueStats) {
  const btn = document.getElementById('btn-report');
  if (btn) { btn.disabled = true; btn.textContent = '產出中…'; }

  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PW = 210, PH = 297, M = 18, CW = PW - M * 2;
    let y = M;

    // ===== Header =====
    doc.setFillColor(...JADE);
    doc.rect(0, 0, PW, 30, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('DentalVis', M, 13);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Dental Health Analysis Report', M, 21);
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    doc.text(dateStr, PW - M, 21, { align: 'right' });
    y = 38;

    // ===== Section 1: Tooth Detection Summary =====
    if (toothData) {
      y = secTitle(doc, 'Tooth Detection Summary', y, M, CW);
      const never = (toothData.never_detected || []);
      y = infoTable(doc, [
        ['Detected Teeth',  `${toothData.total_detected ?? '-'} teeth`],
        ['Reliable Count',  `${toothData.reliable_count ?? '-'} teeth`],
        ['Not Detected',    `${never.length} teeth`],
        ['Missing List',    never.length > 0 ? never.join(', ') : 'None'],
      ], y, M, CW);
      y += 5;
    }

    // ===== Section 2: Plaque Analysis Summary =====
    if (plaqueStats) {
      y = secTitle(doc, 'Plaque Analysis Summary', y, M, CW);
      const summary = plaqueStats.fdi_plaque_summary || {};
      const ratio = plaqueStats.plaque_ratio != null
        ? `${(plaqueStats.plaque_ratio * 100).toFixed(1)}%` : '-';
      y = infoTable(doc, [
        ['Plaque Coverage',     ratio],
        ['Affected Teeth',      `${Object.keys(summary).length} teeth`],
        ['Plaque Vertices',     `${plaqueStats.plaque_vertices ?? '-'}`],
        ['Total Vertices',      `${plaqueStats.total_vertices ?? '-'}`],
      ], y, M, CW);
      y += 5;

      // ===== Plaque Bar Chart =====
      y = secTitle(doc, 'Plaque Amount per Tooth (px)', y, M, CW);
      const sorted = Object.entries(summary)
        .sort((a, b) => b[1].total_plaque_px - a[1].total_plaque_px);
      const maxPx = sorted[0]?.[1].total_plaque_px || 1;
      const BAR_H = 5, GAP = 3, LW = 18, BW = CW - LW - 22;

      for (const [fdi, info] of sorted) {
        if (y > PH - 28) { doc.addPage(); y = M; }
        const pct = info.total_plaque_px / maxPx;
        const jaw = info.jaw === 'upper' ? 'U' : 'L';

        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.setFont('helvetica', 'normal');
        doc.text(`${fdi}(${jaw})`, M, y + BAR_H - 0.5);

        doc.setFillColor(...BG);
        doc.roundedRect(M + LW, y, BW, BAR_H, 1, 1, 'F');
        if (pct > 0) {
          doc.setFillColor(...RED);
          doc.roundedRect(M + LW, y, BW * pct, BAR_H, 1, 1, 'F');
        }
        doc.setTextColor(...MUTED);
        doc.text(`${info.total_plaque_px}px`, M + LW + BW + 2, y + BAR_H - 0.5);
        y += BAR_H + GAP;
      }
      y += 5;
    }

    // ===== Section 3: Trend Chart (canvas screenshot) =====
    const trendCanvas  = document.getElementById('trend-canvas');
    const trendSection = document.getElementById('trend-section');
    if (trendCanvas && trendSection && !trendSection.classList.contains('hidden')) {
      if (y > PH - 80) { doc.addPage(); y = M; }
      y = secTitle(doc, 'Plaque Trend', y, M, CW);
      try {
        const imgData = trendCanvas.toDataURL('image/png');
        const ratio   = trendCanvas.height / trendCanvas.width;
        const imgH    = Math.min(CW * ratio, 70);
        doc.addImage(imgData, 'PNG', M, y, CW, imgH);
        y += imgH + 6;

        // 圖例文字
        const selectedFdiList = window._trendSelectedFdis || [];
        if (selectedFdiList.length > 0) {
          doc.setFontSize(7.5);
          doc.setTextColor(...MUTED);
          doc.text('Teeth shown: ' + selectedFdiList.join(', '), M, y);
          y += 5;
        }
      } catch(e) {
        doc.setFontSize(8); doc.setTextColor(...MUTED);
        doc.text('(Trend chart unavailable)', M, y + 5);
        y += 10;
      }
    }

    // ===== Section 4: 3D Model Snapshots =====
    if (y > PH - 100) { doc.addPage(); y = M; }
    y = secTitle(doc, '3D Model Snapshots', y, M, CW);

    const snapImgH = 70;
    const snapW    = (CW - 6) / 2;  // 兩張並排

    async function snap3D(mode) {
      // 直接用頁面上現有的 model-viewer，切換 src 後截圖
      const frame = document.getElementById('viewer-frame');
      if (!frame) return null;
      const { getFileUrl } = await import('./api.js');
      const glbUrl = getFileUrl(mode === 'plaque' ? 'plaque_by_fdi.glb' : 'custom_real_teeth.glb');

      let mv = frame.querySelector('model-viewer');
      if (!mv) return null;

      // 設定角度（正面略俯視）
      mv.setAttribute('camera-orbit', '0deg 72deg auto');
      mv.setAttribute('field-of-view', '28deg');
      mv.removeAttribute('auto-rotate');

      // 切換 src
      mv.setAttribute('src', glbUrl);

      // 等載入
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 14000);
        mv.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
      });

      // 等渲染穩定
      await new Promise(r => setTimeout(r, 1200));

      try {
        const blob = await mv.toBlob({ idealAspect: false });
        return blobToBase64(blob);
      } catch(e) {
        console.error('toBlob failed:', e);
        return null;
      }
    }

    const labels = ['Tooth Model', 'Plaque Model'];
    const modes  = ['base', 'plaque'];
    const b64s   = [];

    for (const mode of modes) {
      try {
        const b64 = await snap3D(mode);
        b64s.push(b64);
      } catch(e) {
        b64s.push(null);
      }
    }

    // 截圖完成後，把 viewer 還原回菌斑模型 + 恢復 auto-rotate
    try {
      const { getFileUrl } = await import('./api.js');
      const mvFinal = document.querySelector('#viewer-frame model-viewer');
      if (mvFinal) {
        mvFinal.setAttribute('src', getFileUrl('plaque_by_fdi.glb'));
        mvFinal.setAttribute('auto-rotate', '');
        mvFinal.removeAttribute('camera-orbit');
        mvFinal.removeAttribute('field-of-view');
      }
    } catch(e) {}

    // 並排顯示
    b64s.forEach((b64, i) => {
      const x = M + i * (snapW + 6);
      if (b64) {
        doc.addImage(b64, 'PNG', x, y, snapW, snapImgH);
      } else {
        doc.setFillColor(...BG);
        doc.rect(x, y, snapW, snapImgH, 'F');
        doc.setFontSize(7.5); doc.setTextColor(...MUTED);
        doc.text('(snapshot unavailable)', x + snapW/2, y + snapImgH/2, { align: 'center' });
      }
      // 標籤
      doc.setFontSize(8); doc.setTextColor(...MUTED);
      doc.setFont('helvetica', 'normal');
      doc.text(labels[i], x + snapW/2, y + snapImgH + 4, { align: 'center' });
    });
    y += snapImgH + 10;

    // ===== Footer =====
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(
        `DentalVis  |  ${dateStr}  |  Page ${i} / ${pages}  |  For reference only - consult your dentist`,
        PW / 2, PH - 6, { align: 'center' }
      );
    }

    doc.save(`DentalVis_${dateStr}.pdf`);

  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '產出 PDF 報告'; }
  }
}

// ===== Helpers =====
function secTitle(doc, title, y, M, CW) {
  doc.setFillColor(...BG);
  doc.rect(M, y, CW, 7, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...JADE);
  doc.text(title, M + 3, y + 5);
  return y + 10;
}

function infoTable(doc, rows, y, M, CW) {
  const COL1 = 52, RH = 7;
  rows.forEach(([label, val], i) => {
    if (i % 2 === 0) { doc.setFillColor(249, 250, 246); doc.rect(M, y, CW, RH, 'F'); }
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(label, M + 3, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(String(val), M + COL1, y + 5);
    y += RH;
  });
  return y;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}
