---
id: T-0085
title: 手機橫向版面與 PWA 全螢幕支援
status: in_progress
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

- 2026-11-13 18:09 [叉子] 開單 PR #82 已合併至 main（merge commit `9bbb15e03c556bd75c9da952a89c08a36c72b909`）；重新檢查最新 main 的容量與 Communicate 閘門，owner_side 有效 in_progress 任務 2/5，未觸發優先閘門；任務正式接手，準備開工 PR。

- 2026-11-13 18:08 [叉子] 依棒子明確指示建立；範圍包含設定頁全螢幕按鈕、PWA 顯示、瀏覽器一般模式回退、橫向排版及安全區。採橫向優先但不強制旋轉，避免在不支援方向鎖定的瀏覽器造成阻斷。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
