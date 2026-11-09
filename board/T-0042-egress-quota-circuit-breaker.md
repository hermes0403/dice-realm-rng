---
id: T-0042
title: 雲端服務受限時停止重複同步並保留本機遊戲存檔
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P0
created: 2026-11-09
updated: 2026-11-09
depends_on: []
branch: work/chazi
done_by: 棒子
done_at:
---

## 任務

Supabase 專案因 Egress quota 限制回傳 HTTP 402 時，前端不得持續重試雲端存檔或在載入失敗後立即觸發其他雲端讀取。玩家當前遊戲狀態仍須寫入本機存檔，並顯示雲端受限狀態，避免失敗期間反覆消耗請求。

## 範圍與禁止

- 只動：`services/cloud-save.js`、`services/auth.js`、對應 Node 測試、Board 任務紀錄。
- 不要動：`main`、Supabase schema／資料／權限、玩家既有資料、GitHub Pages 部署。
- 一般網路錯誤仍保留既有同步行為；只有辨識到 HTTP 402 或明確 Egress restriction 時才進入本次暫停狀態。
- 本機存檔必須持續可寫，雲端限制不得清除或覆蓋本機資料。

## 驗收條件

- [ ] HTTP 402／Egress restriction 後，不再排程自動雲端同步。
- [ ] 遊戲變更仍寫入本機與玩家專屬 localStorage 存檔。
- [ ] 雲端載入失敗時，不立即連續呼叫玩家 grants、排行榜、heartbeat 與召喚資料。
- [ ] 新增回歸測試，驗證受限後本機存檔正常且沒有雲端重試 timer。
- [ ] `node --test tests/*.test.js` 與 `git diff --check` 通過。

## 紀錄

- 2026-11-09 08:00 [叉子] 開單；依近期 Supabase 402 記錄，優先降低服務受限期間的無效重試。只處理前端容錯，不變更資料庫或正式部署。
- 2026-11-09 08:20 [叉子] 已在 `work/chazi` 修改雲端存檔 402 circuit breaker、本機存檔狀態及登入後雲端載入失敗時的後續請求閘門；新增回歸測試。尚待執行 Node 測試，未部署、未合併。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
