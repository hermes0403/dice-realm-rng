---
id: T-0085
title: 手機橫向版面與 PWA 全螢幕支援
status: review
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-13
updated: 2026-11-13
depends_on: []
branch: task/T-0085-mobile-landscape-pwa-fullscreen
done_by:
done_at:
---

## 任務

讓骰界 RNG 在手機橫向時充分利用寬度，並支援 PWA 安裝後的沉浸式全螢幕顯示。設定頁提供精簡的「全螢幕」按鈕；一般瀏覽器仍須維持完整可操作性。採橫向優先的響應式排版，但不強制所有玩家旋轉裝置。

## 範圍與禁止

- 只動：PWA manifest／必要 service worker、首頁 viewport 與 manifest 宣告、設定頁全螢幕控制、顯示控制模組、橫向響應式 CSS、安全區 inset、必要測試、版本與快取版本、本任務 Board 紀錄。
- 全螢幕由玩家點擊設定按鈕啟用／退出；僅在瀏覽器 API 支援且符合使用者手勢時呼叫 Fullscreen API。
- PWA 安裝模式優先使用可用的 fullscreen／standalone 顯示模式；一般瀏覽器無法隱藏的網址列或系統 UI 不得假稱已隱藏，版面必須在其仍存在時正常使用。
- 使用 viewport-fit=cover 與 safe-area-inset，避免瀏海、挖孔、圓角及系統手勢區域遮住內容。
- 橫向手機將導覽與擲骰主區重新排版，避免沿用直向長頁面造成空間浪費；直向版面仍須正常。
- 不強制鎖定裝置方向；不改動骰子機率、遊戲經濟、天氣、登入、雲端存檔、Supabase schema／RPC／輪詢及既有遊戲功能。
- 不新增高頻網路請求；Service Worker 僅處理 PWA 必要的 app-shell 快取與離線回退，不快取 Supabase API／玩家資料回應。
- 不直接修改 main；依同一任務分支及 PR 流程交付。
- 每次程式修改，遊戲版本遞增 0.01。

## 驗收條件

- [ ] 設定頁只新增清楚的「全螢幕」按鈕，可切換進入／退出全螢幕並同步按鈕狀態。
- [ ] PWA manifest 欄位正確，具備名稱、short_name、start_url、scope、theme_color、background_color、display／display_override、orientation 與可安裝尺寸圖示。
- [ ] PWA 加入主畫面後可在支援的裝置使用獨立／全螢幕顯示；一般瀏覽器不支援時有安全回退，不阻斷遊戲。
- [ ] 一般瀏覽器模式下，網址列／瀏覽器工具列仍存在時，頁面不被遮擋、無水平溢位且主要操作可用。
- [ ] 橫向手機避開安全區，導覽與擲骰區善用寬度；直向、桌面版既有版面不回歸。
- [ ] Service Worker 不攔截或快取 Supabase API、認證、存檔及玩家資料；更新版本能正常替換舊 app-shell cache。
- [ ] 新增或更新對應測試，執行完整 Node 測試與語法／差異檢查；GitHub Actions 與 GitHub Pages 部署成功。
- [ ] 遊戲版本由 V1.14 更新為 V1.15。

## 紀錄

- 2026-11-13 18:18 [叉子] 交付 PR #84 已合併至 main（merge commit `4c3fbf82259e5a95da42279963b6c5e47b2e0bf2`）；GitHub Pages workflow #43408064810 的 build 與 deploy 均成功。程式與部署交付完成，狀態送交 review，等待棒子實際手機驗收。

- 2026-11-13 18:17 [叉子] 完成程式實作；PWA 顯示測試 8/8、JavaScript 語法檢查及差異空白檢查通過。完整 Node 測試為 104/106，2 項既有寵物圖片順序測試仍使用舊 39 隻清單，與本任務修改範圍無關；等待交付 PR 合併及 Pages 部署驗證。

- 2026-11-13 18:09 [叉子] 開單 PR #82 已合併至 main（merge commit `9bbb15e03c556bd75c9da952a89c08a36c72b909`）；重新檢查最新 main 的容量與 Communicate 閘門，owner_side 有效 in_progress 任務 2/5，未觸發優先閘門；任務正式接手，準備開工 PR。

- 2026-11-13 18:08 [叉子] 依棒子明確指示建立；範圍包含設定頁全螢幕按鈕、PWA 顯示、瀏覽器一般模式回退、橫向排版及安全區。採橫向優先但不強制旋轉，避免在不支援方向鎖定的瀏覽器造成阻斷。

## 完工回報

### 改了什麼

- `index.html`：加入 PWA manifest／iOS 主畫面 metadata、`viewport-fit=cover`、設定頁「全螢幕」按鈕，版本更新至 V1.15。
- `ui/display-controls.js`：按鈕切換 Fullscreen API、優先要求隱藏瀏覽器 UI、同步全螢幕狀態，並在 HTTPS 安全來源註冊 Service Worker。
- `manifest.webmanifest` 與兩種尺寸 PNG 圖示：設定 PWA 安裝資訊、fullscreen 優先顯示模式；方向維持 any，不強迫旋轉。
- `sw.js`：網路優先處理同源頁面與靜態資源，離線時回退快取；不處理跨來源 Supabase API／認證／玩家存檔。
- `style.css`：加入安全區 padding、動態 viewport 高度及手機橫向左側導覽／雙欄擲骰版面；直向與桌面保留原樣。
- `script.js`：載入顯示控制模組。

### 怎麼驗證的

- GitHub Actions PWA 顯示測試：8/8 通過；JavaScript 語法檢查及 `git diff --check` 通過。
- 完整 Node 測試曾執行：104/106 通過；剩餘 2 項皆在既有 `tests/pet-image-mapping.test.js`，其預期仍是舊 39 隻寵物，但目前資料已包含 6 隻活動寵物。此任務未修改寵物資料、圖片或相關測試。
- GitHub Pages 尚待交付 PR 合併後部署；實際手機瀏覽器外觀仍需棒子用裝置驗收。

### 沒做／做不到的

- 一般瀏覽器只能在支援 Fullscreen API 且玩家點擊按鈕後請求隱藏瀏覽器 UI；iOS Safari 等不支援的環境會保留系統介面，版面仍可使用。
- 本次不強制鎖定橫向，也不新增 Supabase 查詢、RPC、資料表或輪詢。
- 本次記錄完成的是程式與自動化驗證；尚未宣稱 Pages 已部署或完成 Owner 驗收。

### 衍生任務／影響任務

- 無。
