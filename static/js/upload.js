// ===== upload.js - 上傳邏輯（支援單張/多張模式）=====
const VIEWS = ['front', 'left_side', 'right_side', 'upper_occlusal', 'lower_occlusal'];

export { VIEWS };

// ==================== Single mode (原始功能) ====================

export function setupUploads(prefix, filesObj, btnId) {
  VIEWS.forEach(view => {
    const input   = document.getElementById(`${prefix}-input-${view}`);
    const zone    = document.getElementById(`${prefix}-zone-${view}`);
    const preview = document.getElementById(`${prefix}-preview-${view}`);
    if (!input) return;

    input.addEventListener('change', e => {
      const isMulti = input.hasAttribute('multiple');

      if (isMulti) {
        // ── 多張照片模式 ──
        const files = Array.from(e.target.files);
        if (!files.length) return;
        if (!Array.isArray(filesObj[view])) filesObj[view] = [];
        filesObj[view].push(...files);

        zone.classList.add('has-file');
        _updateCountBadge(zone, filesObj[view].length);
        _addClearBtn(zone, prefix, view, filesObj, btnId);

        // 第一張顯示 preview
        if (!preview.classList.contains('visible')) {
          _showPreview(preview, files[0], view);
        }
        updateBtn(btnId, filesObj);
      } else {
        // ── 單張照片模式 ──
        const file = e.target.files[0];
        if (!file) return;
        filesObj[view] = file;
        zone.classList.add('has-file');
        _removeCountBadge(zone);
        _showPreview(preview, file, view);
        _addClearBtn(zone, prefix, view, filesObj, btnId);
        updateBtn(btnId, filesObj);
      }

      // reset input value so same file can be re-selected
      input.value = '';
    });

    zone.addEventListener('click', () => input.click());
  });
}

// ==================== Mode switching ====================

/**
 * mode: 'single' | 'multi'
 * 切換模式時清空已上傳的照片並重置 UI
 */
export function switchUploadMode(prefix, filesObj, btnId, mode) {
  VIEWS.forEach(view => {
    delete filesObj[view];

    const zone    = document.getElementById(`${prefix}-zone-${view}`);
    const preview = document.getElementById(`${prefix}-preview-${view}`);
    const input   = document.getElementById(`${prefix}-input-${view}`);

    if (zone) {
      zone.classList.remove('has-file');
      if (mode === 'multi') zone.classList.add('multi-mode');
      else                  zone.classList.remove('multi-mode');
      _removeCountBadge(zone);
      _removeClearBtn(zone);
    }
    if (preview) {
      preview.innerHTML = '';
      preview.classList.remove('visible');
    }
    if (input) {
      input.value = '';
      if (mode === 'multi') input.setAttribute('multiple', '');
      else                  input.removeAttribute('multiple');
    }
  });
  updateBtn(btnId, filesObj);
}

// ==================== Button state ====================

export function updateBtn(btnId, filesObj) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const firstInput = document.getElementById(
    btnId === 'btn-init' ? 'init-input-front' : 'plaque-input-front'
  );
  const isMulti = firstInput?.hasAttribute('multiple');

  if (isMulti) {
    btn.disabled = !VIEWS.every(v => Array.isArray(filesObj[v]) && filesObj[v].length > 0);
  } else {
    btn.disabled = !VIEWS.every(v => filesObj[v] && !Array.isArray(filesObj[v]));
  }
}

// ==================== Helpers ====================

function _showPreview(preview, file, view) {
  const reader = new FileReader();
  reader.onload = ev => {
    preview.innerHTML = `<img src="${ev.target.result}" alt="${view}">`;
    preview.classList.add('visible');
  };
  reader.readAsDataURL(file);
}

function _updateCountBadge(zone, count) {
  let badge = zone.querySelector('.multi-count-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'multi-count-badge';
    zone.appendChild(badge);
  }
  badge.textContent = `${count} 張`;
}

function _removeCountBadge(zone) {
  zone.querySelector('.multi-count-badge')?.remove();
}

// ── Clear button ──

function _addClearBtn(zone, prefix, view, filesObj, btnId) {
  if (zone.querySelector('.upload-clear-btn')) return; // 已存在就跳過
  const btn = document.createElement('button');
  btn.className = 'upload-clear-btn';
  btn.title = '移除照片';
  btn.innerHTML = '&times;';
  btn.addEventListener('click', e => {
    e.stopPropagation(); // 阻止觸發 zone click（開啟選檔）
    _clearZone(zone, prefix, view, filesObj, btnId);
  });
  zone.appendChild(btn);
}

function _clearZone(zone, prefix, view, filesObj, btnId) {
  delete filesObj[view];
  zone.classList.remove('has-file');
  _removeCountBadge(zone);
  _removeClearBtn(zone);

  const preview = document.getElementById(`${prefix}-preview-${view}`);
  if (preview) {
    preview.innerHTML = '';
    preview.classList.remove('visible');
  }
  const input = document.getElementById(`${prefix}-input-${view}`);
  if (input) input.value = '';

  // 移除 photo-check badge（避免殘留舊狀態）
  const badge = zone.querySelector('.photo-check-badge');
  if (badge) badge.remove();

  updateBtn(btnId, filesObj);
}

function _removeClearBtn(zone) {
  zone.querySelector('.upload-clear-btn')?.remove();
}
