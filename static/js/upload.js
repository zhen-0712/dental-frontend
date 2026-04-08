// ===== upload.js - 上傳邏輯 =====
const VIEWS = ['front', 'left_side', 'right_side', 'upper_occlusal', 'lower_occlusal'];
export { VIEWS };

export function setupUploads(prefix, filesObj, btnId) {
  VIEWS.forEach(view => {
    const input   = document.getElementById(`${prefix}-input-${view}`);
    const zone    = document.getElementById(`${prefix}-zone-${view}`);
    const preview = document.getElementById(`${prefix}-preview-${view}`);
    if (!input) return;

    input.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      filesObj[view] = file;
      zone.classList.add('has-file');
      const reader = new FileReader();
      reader.onload = ev => {
        preview.innerHTML = `<img src="${ev.target.result}" alt="${view}">`;
        preview.classList.add('visible');
      };
      reader.readAsDataURL(file);
      updateBtn(btnId, filesObj);
    });

    zone.addEventListener('click', () => input.click());
  });
}

export function updateBtn(btnId, filesObj) {
  const btn = document.getElementById(btnId);
  if (btn) btn.disabled = !VIEWS.every(v => filesObj[v]);
}
