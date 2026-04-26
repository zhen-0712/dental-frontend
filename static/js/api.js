// ===== api.js - 所有 API 呼叫 =====
const API_BASE = 'http://140.115.51.163:40111';

export async function fetchModelStatus() {
  const token = localStorage.getItem('smileguardian_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_BASE}/model_status`, { headers });
  return res.json();
}

export async function fetchToothData() {
  const token = localStorage.getItem('smileguardian_token');
  if (token) {
    try {
      const res = await fetch(`${API_BASE}/analyses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const analyses = await res.json();
        const lastInit = analyses.find(a => a.type === 'init' && a.status === 'done' && a.result?.tooth_analysis);
        if (lastInit) return lastInit.result.tooth_analysis;
      }
    } catch(e) {}
  }
  const res = await fetch(`${API_BASE}/files/real_teeth_analysis.json`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchPlaqueStats() {
  const token = localStorage.getItem('smileguardian_token');
  if (token) {
    try {
      const res = await fetch(`${API_BASE}/analyses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const analyses = await res.json();
        const lastPlaque = analyses.find(a => a.type === 'plaque' && a.status === 'done' && a.result?.stats);
        if (lastPlaque) return lastPlaque.result.stats;
      }
    } catch(e) {}
  }
  const res = await fetch(`${API_BASE}/files/plaque_by_fdi_stats.json`);
  if (!res.ok) return null;
  return res.json();
}

// ===== 新增：取得 plaque_regions.json（供準確度評估用）=====
export async function fetchPlaqueRegions() {
  try {
    const res = await fetch(`${API_BASE}/files/plaque_regions.json`);
    if (!res.ok) return null;
    return res.json();
  } catch(e) { return null; }
}

function authHeaders() {
  const token = localStorage.getItem('smileguardian_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function submitInit(filesObj, mirror = false) {
  const formData = new FormData();
  Object.entries(filesObj).forEach(([view, file]) =>
    formData.append(view, file, `${view}.jpg`)
  );
  formData.append('mirror', mirror ? '1' : '0');
  const res = await fetch(`${API_BASE}/init`, {
    method: 'POST', body: formData, headers: authHeaders()
  });
  return res.json();
}

export async function submitPlaque(filesObj, mirror = false) {
  const formData = new FormData();
  Object.entries(filesObj).forEach(([view, file]) =>
    formData.append(view, file, `${view}.jpg`)
  );
  formData.append('mirror', mirror ? '1' : '0');
  const res = await fetch(`${API_BASE}/plaque`, {
    method: 'POST', body: formData, headers: authHeaders()
  });
  return res.json();
}

export async function submitInitMulti(filesObj, mirror = false) {
  const formData = new FormData();
  Object.entries(filesObj).forEach(([view, files]) => {
    const arr = Array.isArray(files) ? files : [files];
    arr.forEach((file, i) => formData.append(`${view}_${i}`, file, `${view}_${i}.jpg`));
  });
  formData.append('mirror', mirror ? '1' : '0');
  const res = await fetch(`${API_BASE}/init_multi`, {
    method: 'POST', body: formData, headers: authHeaders()
  });
  return res.json();
}


export async function fetchTaskStatus(taskId) {
  const res = await fetch(`${API_BASE}/status/${taskId}`);
  return res.json();
}

export function getFileUrl(filename) {
  const token = localStorage.getItem('smileguardian_token');
  if (token) {
    return `${API_BASE}/files/${filename}?token=${token}`;
  }
  return `${API_BASE}/files/${filename}`;
}

export { API_BASE };