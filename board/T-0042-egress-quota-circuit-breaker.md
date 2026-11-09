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
- [ ] 登入後的訪問紀錄與個人天氣 Realtime 僅在雲端存檔及初始化成功後啟動；登出時仍清理舊訂閱。

## 紀錄

- 2026-11-09 08:00 [叉子] 開單；依近期 Supabase 402 記錄，優先降低服務受限期間的無效重試。只處理前端容錯，不變更資料庫或正式部署。
- 2026-11-09 08:20 [叉子] 已在 `work/chazi` 修改雲端存檔 402 circuit breaker、本機存檔狀態及登入後雲端載入失敗時的後續請求閘門；新增回歸測試。尚待執行 Node 測試，未部署、未合併。

- 2026-11-09 14:10 [叉子] 發現登入狀態事件在雲端存檔載入前就啟動個人天氣 Realtime，並排程訪問紀錄；已改為雲端載入及登入初始化成功後才啟動，登出時仍執行舊訂閱清理。新增三項初始化閘門回歸測試；待 CI 執行完整驗證。

- 2026-11-09 14:10 [叉子] 新增登入初始化閘門回歸測試 3/3 通過（以分支現行 auth helper 建立隔離 Node 測試環境）；完整 repository 測試及正式登入流程整合測試尚未執行，故驗收條件維持未勾選。

- 2026-11-09 [叉子] 回讀登入與存檔流程後，修正既有 dirty marker／載入期間產生 dirty marker 的兩條恢復路徑：本機資料恢復成功且未觸發雲端限制時，`loadCloudSave()` 回報成功，讓登入初始化可以繼續；若仍受 HTTP 402 限制，則維持停止後續雲端初始化。新增 `tests/cloud-save-failure.test.js` 回歸案例，確認恢復時不讀取雲端、保留本機資料並排程安全同步。已回讀確認程式碼與測試已寫入 `work/chazi`；目前執行環境無法連線 GitHub 下載完整 repository，故尚未實際執行該測試或完整測試套件，驗收仍未完成。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
