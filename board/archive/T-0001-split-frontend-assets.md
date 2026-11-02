---
id: T-0001
title: 將雲端前端拆分為 HTML CSS JavaScript 三檔
status: done
from: barry
to: 老查
owner: 老查
contributors: []
reviewer:
priority: P1
created: 2026-11-01
updated: 2026-11-01
depends_on:
branch: feat/split-frontend-assets
done_by: 老查
done_at: 2026-11-01
---

## 任務

以目前 GitHub Pages 對應的 `origin/main` 前端版本為基準，將 `index.html` 內嵌的樣式與主要程式碼拆分成 `style.css`、`script.js`，形成 `index.html`、`style.css`、`script.js` 三個檔案，並將三個檔案推送覆蓋雲端版本。拆分過程須保留現有遊戲功能與載入順序。

## 範圍與禁止

- 只動：`index.html`、`style.css`、`script.js`，以及本任務必要的 board 紀錄。
- 不要動：Supabase schema、RPC、Edge Functions、資料庫資料、其他遊戲規則；不得將第二項「前端運算邏輯後端化」混入本任務。
- 保留必要的第三方 CDN 載入，例如 Supabase JS；確認其載入順序與 `script.js` 相容。
- 本任務依人類指示免做 Supabase CSV 檢查。

## 驗收條件

- [x] `index.html` 透過外部 stylesheet 載入 `style.css`。
- [x] `index.html` 透過外部 script 載入 `script.js`，且依賴載入順序正確。
- [x] 原本內嵌 CSS 與主要 JavaScript 已完整搬移，沒有遺漏或重複執行。
- [x] 檢查三個檔案的引用路徑、語法與必要的靜態檢查。
- [x] GitHub Pages 目標分支已收到三個檔案的更新，並以線上頁面確認部署結果。
- [x] 執行 `git diff --check`，exit code 0。

## 紀錄

<!-- 只增不改。格式：- YYYY-MM-DD HH:MM [作者] 內容 -->
- 2026-11-01 14:22 [老查] 接手任務；確認遠端 `origin/main` 的 `index.html` 仍包含內嵌 `<style>` 與 `<script>`，雖然遠端已存在 `style.css`、`script.js`，尚未完成外部引用拆分。
- 2026-11-01 14:29 [老查] 已將 CSS 與主要 JavaScript 從 `index.html` 拆至 `style.css`、`script.js`，保留 Supabase CDN 先於應用程式載入；commit `fea25bf` 已推送至 `origin/main`。以 GitHub Pages 加查詢參數避開舊快取後，三個線上檔案皆回應 HTTP 200，HTML 僅引用外部 CSS/JS，未保留內嵌 style 或應用程式 script；任務內容已部署，狀態轉為 review。
- 2026-11-01 14:40 [barry] 確認 T-0001 已可驗收，授權將任務標記為 done，並依 board README 規則合併、封存及本機 commit。
- 2026-11-01 14:40 [老查] 依人類驗收授權將 status 由 review 改為 done；接續執行本機分支整合、任務封存與 commit。

## 完工回報

### 改了什麼

- `index.html`：移除內嵌 CSS／JavaScript，改引用 `style.css` 與 `script.js`。
- `style.css`：完整承接原本的樣式區塊。
- `script.js`：完整承接原本的主要應用程式程式碼。
- Commit：`fea25bf refactor(frontend): split HTML CSS and JavaScript`。

### 怎麼驗證的

- `node --check script.js`：exit code 0。
- `git diff --check`：exit code 0。
- 線上 `index.html`、`style.css`、`script.js`：HTTP 200。
- 線上 HTML：stylesheet 與 script 外部引用各 1，內嵌 `<style>` 與應用程式 `<script>` 各 0。

### 沒做／做不到的

- 尚未進行完整的瀏覽器互動回歸測試；目前已完成語法、檔案引用與線上部署檢查。

### 衍生任務

- 前端權威運算後端化另由 `T-0002-server-authoritative-frontend.md` 追蹤。
