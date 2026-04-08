// ===== photo_check.js - 上傳照片即時品質檢查 =====

const VIEW_REQUIREMENTS = {
  front:          { label: '正面',     minPink: 0.04, minBrightness: 60 },
  left_side:      { label: '左側面',   minPink: 0.03, minBrightness: 55 },
  right_side:     { label: '右側面',   minPink: 0.03, minBrightness: 55 },
  upper_occlusal: { label: '上顎咬合', minPink: 0.02, minBrightness: 50 },
  lower_occlusal: { label: '下顎咬合', minPink: 0.02, minBrightness: 50 },
};

// ===== 核心分析（canvas 取像素）=====
function analyzePhoto(file, view) {
  return new Promise((resolve) => {
    const img   = new Image();
    const url   = URL.createObjectURL(file);
    img.onload  = () => {
      const W = 160, H = 120;   // 縮小取樣，節省計算
      const canvas  = document.createElement('canvas');
      canvas.width  = W; canvas.height = H;
      const ctx     = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(url);

      const data = ctx.getImageData(0, 0, W, H).data;
      const n    = W * H;

      let sumBright = 0, pinkCount = 0, blurScore = 0;
      let prevGray  = -1;

      for (let i = 0; i < n; i++) {
        const r = data[i*4], g = data[i*4+1], b = data[i*4+2];
        const gray     = 0.299*r + 0.587*g + 0.114*b;
        sumBright     += gray;

        // 模糊估算：相鄰像素灰度差（越大越清晰）
        if (prevGray >= 0) blurScore += Math.abs(gray - prevGray);
        prevGray = gray;

        // 偵測粉紅/紅色（牙齦、牙齒）：r高、g中、b低
        if (r > 120 && g < r * 0.85 && b < r * 0.80 && r > 80) pinkCount++;
      }

      const avgBrightness = sumBright / n;
      const blurNorm      = blurScore / n;       // 越高越清晰
      const pinkRatio     = pinkCount / n;

      resolve({ avgBrightness, blurNorm, pinkRatio, view });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// ===== 產生提示訊息 =====
function buildFeedback(result, view) {
  if (!result) return { ok: false, issues: ['照片讀取失敗'] };

  const req    = VIEW_REQUIREMENTS[view] || VIEW_REQUIREMENTS.front;
  const issues = [];
  const tips   = [];

  // 模糊判斷（blurNorm < 3 = 很模糊）
  if (result.blurNorm < 2.5) {
    issues.push('照片可能模糊');
    tips.push('請確保手機對焦後再拍攝');
  }

  // 亮度判斷
  if (result.avgBrightness < req.minBrightness) {
    issues.push('照片太暗');
    tips.push('請在光線充足的地方拍攝，或開閃光燈');
  } else if (result.avgBrightness > 220) {
    issues.push('照片過曝');
    tips.push('請避免直接對著強光拍攝');
  }

  // 嘴巴開合 / 牙齒是否可見
  if (result.pinkRatio < req.minPink) {
    if (view === 'upper_occlusal' || view === 'lower_occlusal') {
      issues.push('看不到足夠的牙齒區域');
      tips.push('請盡量張嘴，讓咬合面完整露出');
    } else {
      issues.push('嘴巴開口不足或角度偏差');
      tips.push('請張大嘴，確保牙齒清楚可見');
    }
  }

  return {
    ok:     issues.length === 0,
    issues,
    tips,
    stats: {
      brightness: Math.round(result.avgBrightness),
      sharpness:  result.blurNorm.toFixed(1),
      toothArea:  (result.pinkRatio * 100).toFixed(1) + '%',
    }
  };
}

// ===== 渲染提示 badge =====
function renderCheckBadge(view, feedback, zoneEl) {
  // 移除舊的 badge
  zoneEl.querySelectorAll('.photo-check-badge').forEach(el => el.remove());

  if (feedback.ok) {
    const badge = document.createElement('div');
    badge.className = 'photo-check-badge ok';
    badge.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> 照片品質良好`;
    zoneEl.appendChild(badge);
    return;
  }

  const badge = document.createElement('div');
  badge.className = 'photo-check-badge warn';
  const issueText = feedback.issues.join('・');
  const tipText   = feedback.tips[0] || '';
  badge.innerHTML = `
    <div class="pcb-title">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      ${issueText}
    </div>
    ${tipText ? `<div class="pcb-tip">${tipText}</div>` : ''}
  `;
  zoneEl.appendChild(badge);
}

// ===== 主入口：綁定到 upload zone =====
export function setupPhotoCheck(prefix, view, zoneEl) {
  const input = zoneEl.querySelector(`#${prefix}-input-${view}`) ||
                document.getElementById(`${prefix}-input-${view}`);
  if (!input) return;

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 顯示「分析中」
    let badge = zoneEl.querySelector('.photo-check-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'photo-check-badge checking';
      zoneEl.appendChild(badge);
    }
    badge.className = 'photo-check-badge checking';
    badge.innerHTML = '<span class="pcb-spinner"></span> 檢查中…';

    const result   = await analyzePhoto(file, view);
    const feedback = buildFeedback(result, view);
    renderCheckBadge(view, feedback, zoneEl);
  });
}

// ===== 批次綁定所有 upload zones =====
export function setupAllPhotoChecks(prefix) {
  const views = ['front', 'left_side', 'right_side', 'upper_occlusal', 'lower_occlusal'];
  views.forEach(view => {
    const zone = document.getElementById(`${prefix}-zone-${view}`);
    if (zone) setupPhotoCheck(prefix, view, zone);
  });
}
