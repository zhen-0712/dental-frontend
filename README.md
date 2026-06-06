# Smile Guardian — Web Frontend

智慧口腔衛生分析系統的網頁前端。使用者上傳五個角度的牙齒照片，後端 AI 建立個人化 3D 模型並標示牙菌斑位置，實現從診所到日常生活的牙齒健康量化管理。

> **Smile Guardian** is an intelligent oral hygiene analysis system based on SegmentAnyTooth and 3D modeling, developed at National Central University.
>
> Demo：[http://140.115.51.163:40111](http://140.115.51.163:40111)
> | GitHub：[Backend](https://github.com/Yung-Chen-Chang/SegmentAnyTooth) | [Mobile App](https://github.com/Yung-Chen-Chang/dentalvis-app)

---

## 功能總覽

| 功能 | 說明 |
|------|------|
| **個人化 3D 模型** | 上傳五角度照片（正面、左側、右側、上顎咬合、下顎咬合），後端建立個人化 GLB 模型 |
| **牙菌斑分析** | 塗抹染色劑後重新上傳，AI 標示每顆牙的菌斑覆蓋率並投影到 3D 模型 |
| **假牙模型支援** | 切換「假牙模型」模式（teaching model），自動對應缺牙結構 |
| **3D 互動檢視** | 使用 `<model-viewer>` 互動式展示 GLB 模型，可拖曳旋轉、切換菌斑／牙齒視角 |
| **趨勢追蹤** | Chart.js 折線圖呈現歷次菌斑覆蓋率長期變化，支援依單顆牙或整體顎別篩選 |
| **分析歷史** | 依週／月／全部篩選過去的初始化 / 菌斑任務紀錄 |
| **PDF 報告** | 自動截圖 3D 模型五個角度，產生含牙齒概況、菌斑數據、準確率評估的 PDF |
| **分析完成通知** | 分析完成後寄送 Email 通知 |
| **帳號系統** | JWT 登入／註冊，歷史記錄與模型與帳號綁定 |
| **拍照指引 UI** | 五個角度附帶 SVG 牙科示意圖與提示文字，引導使用者正確拍攝 |

---

## 技術架構

```
dental-web/
├── index.html                 # 單頁應用，所有 section 皆在此
├── favicon.svg / favicon.ico
└── static/
    ├── css/
    │   ├── base.css           # CSS variables、reset、背景
    │   ├── header.css         # Header、Container、Section、Footer、漢堡選單
    │   ├── buttons.css        # 按鈕、徽章、mini-stats、about-grid
    │   ├── layout.css         # Hero、upload-grid、guide-icon
    │   ├── components.css     # btn-primary、btn-outline 等通用元件
    │   ├── upload.css         # 上傳區域、相機模式切換、多張照片模式
    │   ├── progress.css       # 進度條卡片
    │   ├── result.css         # 結果頁左右版型、牙齒 chip、準確率 badge
    │   ├── auth.css           # 登入 Modal、nav-user 區域
    │   ├── history.css        # 歷史卡片、篩選 UI、牙齒 mini chart
    │   ├── trend.css          # 趨勢圖、牙齒選擇 chip、圖例
    │   └── responsive.css     # 響應式覆寫（最後載入）
    └── js/
        ├── main.js            # 入口，組合所有模組、全域 state
        ├── api.js             # 所有 fetch 呼叫（API_BASE 設定在此）
        ├── auth.js            # 帳號管理、Header user area 渲染
        ├── upload.js          # 上傳區域互動（預覽、清除、多張模式）
        ├── photo_check.js     # 上傳後即時照片品質檢查
        ├── progress.js        # 任務輪詢進度條
        ├── result.js          # 結果頁渲染（牙齒概況、菌斑分析、3D viewer）
        ├── history.js         # 歷史記錄渲染與篩選
        ├── trend.js           # 趨勢圖（Chart.js）
        └── report.js          # PDF 報告產生（含 3D 截圖）
```

**純靜態前端**，無 build step，直接由後端 serve `index.html`。所有 JS 以 ES Module 撰寫。

---

## 後端 API

`api.js` 中 `API_BASE` 預設為：

```
http://140.115.51.163:40111
```

| Method | Endpoint | 說明 |
|--------|----------|------|
| `POST` | `/auth/register` | 註冊（email, name, password） |
| `POST` | `/auth/login` | 登入，回傳 JWT token |
| `GET` | `/model_status` | 查詢目前使用者是否已有 3D 模型 |
| `POST` | `/init` | 上傳五角度照片，建立 3D 模型（非同步任務） |
| `POST` | `/init_multi` | 同上，每角度可上傳多張照片 |
| `POST` | `/plaque` | 上傳菌斑照片，執行分析（非同步任務） |
| `GET` | `/status/{task_id}` | 輪詢任務進度 |
| `GET` | `/analyses` | 取得目前使用者的歷史分析列表 |
| `GET` | `/files/{filename}` | 取得後端產生的檔案（GLB、OBJ、JSON） |

認證方式：`Authorization: Bearer <token>`（登入後 JWT token 存於 `localStorage`）。

---

## 上傳流程

### Step 1：初始化（一次性）

```
上傳 5 張照片
  front / left_side / right_side / upper_occlusal / lower_occlusal
    ↓ POST /init  (model_type: regular | teaching)
後端非同步建立 3D 模型（約 3–8 分鐘）
    ↓ 輪詢 GET /status/{task_id}
產生 base.glb、base.obj、real_teeth_analysis.json
```

- 支援**手機拍照**（每角度一張）與**多張照片**模式（每角度多張）
- 支援**前置 / 後置相機**切換（鏡像修正）
- **假牙模型模式**：選擇 teaching model，後端套用預設缺牙清單建模

### Step 2：菌斑分析（可重複）

```
塗抹菌斑染色劑後上傳 5 張照片
    ↓ POST /plaque  (model_type: regular | teaching)
後端非同步執行分析（約 2–5 分鐘）
    ↓ 輪詢 GET /status/{task_id}
產生 plaque.glb、plaque_by_fdi_stats.json、plaque_regions.json
```

---

## 拍照指引

每個上傳格都附有 SVG 牙科示意圖與操作提示：

| 角度 | 提示 |
|------|------|
| 正面 | 張嘴，牙齒對齊鏡頭 |
| 左側 | 手指拉開左嘴角拍側面 |
| 右側 | 手指拉開右嘴角拍側面 |
| 上顎咬合 | 仰頭張嘴，相機朝上拍 |
| 下顎咬合 | 低頭張嘴，相機朝下拍 |

> 左右方向以**使用者自身牙齒方向**為準（牙科慣例）。

---

## 響應式設計

| 斷點 | 對應裝置 |
|------|---------|
| `> 900px` | 桌面（雙欄 Hero、五欄 Upload、左右 Result） |
| `≤ 900px` | 平板（單欄 Hero、三欄 Upload、堆疊 Result） |
| `≤ 768px` | 手機（漢堡選單、三欄 Upload） |
| `≤ 600px` | 手機（二欄 Upload） |
| `≤ 480px` | 小手機（字型縮小、二欄 mini-stats） |

---

## 本地開發

```bash
# Python
python3 -m http.server 8080

# Node.js
npx serve .
```

開啟 `http://localhost:8080`。

> API 預設連到 `140.115.51.163:40111`，需在同一內網或修改 `static/js/api.js` 的 `API_BASE`。

---

## 字型

| 字型 | 用途 |
|------|------|
| DM Serif Display | 標題（hero-title、section-title） |
| DM Sans | 內文 |
| jf-openhuninn | 中文 fallback（本地 woff2） |
