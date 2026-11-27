---
id: T-0161
title: 修正主頁全服加成活動卡片在手機版顯示異常與裁切
status: review
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-27
updated: 2026-11-27
depends_on: [T-0138]
branch: task/T-0161-global-boost-homepage-layout
done_by:
done_at:
---

## 任務

修正管理員啟用全服運氣、速度、融合運氣或金錢倍率後，所有玩家主頁的「管理員活動」卡片在窄螢幕／手機版顯示異常、文字擠壓或遭容器裁切的問題。

## 範圍與禁止

- 只動：主頁管理員活動卡片的容器寬度、卡片排列、文字換行、溢位處理、卡片視覺樣式及必要的前端回歸測試／快取版本。
- 保留全服運氣、速度、融合運氣、金錢倍率的計算、狀態讀取、Realtime／輪詢頻率、倒數及點擊說明。
- 不修改管理員加成操作、資料庫、RPC、Edge Function、權限或玩家收益計算。
- 不修改主頁其他卡片、導航、公告及骰子區域。

## 驗收條件

- [ ] 手機窄螢幕下，每張活動卡片都完整留在主頁內容寬度內，不會水平溢出或被裁切。
- [ ] 運氣、速度、融合運氣、金錢倍率及剩餘時間文字清楚可讀，長數字／長文案能合理換行。
- [ ] 桌面版仍維持整齊的多卡排列；手機版採用不擠壓文字的排列。
- [ ] 活動卡片顏色不再被全域按鈕／面板樣式覆寫成低對比或不一致樣式。
- [ ] 點擊卡片仍能顯示原本活動說明；活動到期後仍會正常隱藏。
- [ ] 回歸測試、語法檢查及 GitHub Pages 部署成功；未修改任何加成計算或同步行為。

## 紀錄

- 2026-11-27 16:05 [叉子] 開工：以最新 main（`39c426e588cfb72da5661f4619dc925859a08ef1`）建立獨立任務分支。Board 索引目前 owner_side 有 4 張 in_progress 任務（T-0142、T-0146、T-0147、T-0148），未達五單容量上限；目前索引未列出有效 communicate task。範圍限定主頁活動卡片 CSS／必要測試與快取版本，不更動加成運算、同步及資料庫。
- 2026-11-27 16:19 [叉子] 完成：PR #427 已合併，merge commit `2a791abbefc61d9722dc860c83a7858a4ca412b8`；GitHub Pages 部署 run `45964625436` success。PR head `06d9cb73e497f3f00ed3ddb5a24d3fc5ea43abd9` 的 19 個 GitHub Actions checks 全部 success。過程中依測試發現並修正快取版本斷言／保留原公會資產版本；最後版本確認通過 PWA、完整遊戲回歸、Coin boost、Cloud save、Auth、Board 等檢查。

## 完工回報

### 改了什麼

- `style.css`：主頁活動區設為完整可用寬度；活動卡片改用響應式 Grid，桌面自動多欄、手機單欄；卡片設置 min-width:0、文字換行、圖示固定寬度及明確高對比配色。
- `index.html`、`sw.js`：更新主樣式 URL 版本，讓玩家載入新版活動卡片 CSS；公會模組與 guild.css 的既有快取版本保持不變。
- `tests/global-boost-homepage-render.test.mjs`：新增活動卡片寬度、換行及手機單欄樣式回歸測試。
- `tests/pwa-display-controls.test.mjs`：同步主樣式版本斷言。

### 怎麼驗證的

- PR #427：19/19 GitHub Actions checks success，包含 PWA display、Full game regression、Coin boost、Cloud save、Auth、Board lifecycle 等。
- GitHub Pages deployment run `45964625436`：success。
- 未修改 `systems/global-boost.js`、`systems/coin-boost.js`、加成計算、倒數、Realtime／輪詢、管理員權限、資料庫及收益結算。

### 沒做／做不到的

- 尚未在實際手機瀏覽器開啟有效全服加成，逐一檢查不同螢幕寬度；目前以自動化樣式回歸及正式 Pages 部署作驗證，仍待棒子實機驗收。

### 衍生任務／影響任務

- 無
