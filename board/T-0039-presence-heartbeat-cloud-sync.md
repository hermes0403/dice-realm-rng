---
id: T-0039
title: 調整玩家在線心跳並補齊自動擲骰與雲端同步回歸測試
status: done
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-09
updated: 2026-11-13
depends_on: []
branch: task/T-0039-presence-heartbeat-cloud-sync
done_by: 棒子
done_at: 2026-11-13T09:12:57+08:00
---

## 任務

將登入玩家寫入 `player_profiles` 的 presence heartbeat（在線心跳）間隔由 60 秒調整為 5 分鐘，並同步修正所有依賴 `last_seen` 的在線判定，避免心跳頻率降低後將正常在線玩家誤判為離線。同時為既有自動擲骰、本機存檔、雲端批次同步、登出強制同步及離開頁面備份補齊可重複執行的自動化回歸測試。

## 範圍與禁止

- 僅修改 presence heartbeat、依賴 `last_seen` 的在線判定、必要的同步生命週期測試及本任務測試工作流程。
- 心跳間隔固定為 5 分鐘；所有使用在線狀態的前端／管理員備援邏輯與後端查詢門檻必須一致，並保留合理的網路延遲緩衝。
- 自動擲骰頻率維持每 1.5 秒一次，不得為了降低雲端流量而降低擲骰速度。
- 每次擲骰結果仍須立即寫入本機存檔；不得改成每 5 分鐘才保存本機資料。
- 雲端存檔維持 5 分鐘批次同步，不得恢復成每次擲骰都上傳。
- 手動登出必須等待強制雲端同步成功；同步失敗時不得清除本機資料或假裝登出備份成功。
- `visibilitychange`／`pagehide` 離開頁面備份維持 best-effort（盡力嘗試）；不得宣稱瀏覽器關閉時能保證網路請求完成。
- 測試使用 mock／隔離環境，不得把模擬測試描述成正式 Supabase 壓力測試；不得修改正式玩家資料。
- 不修改擲骰機率、經濟數值、玩家存檔格式、資料庫 schema、RLS、RPC、Edge Functions 或 Supabase 正式資料。

## 驗收條件

- [ ] `player_profiles` presence heartbeat 間隔為 5 分鐘，且成功寫入後才更新上次成功心跳時間；請求失敗不應錯誤延後下一次重試。
- [ ] 全面搜尋並修正依賴 `last_seen` 的在線判定；在線逾時門檻能容忍 5 分鐘心跳週期及合理網路延遲，管理員名單與在線統計使用一致規則。
- [ ] 自動擲骰仍維持 1.5 秒週期，新增測試防止週期被改慢或被雲端請求阻塞。
- [ ] 每次擲骰後本機存檔會立即更新；測試確認本機保存不依賴雲端同步成功。
- [ ] 雲端同步以 5 分鐘批次排程，不會每次擲骰都觸發一次雲端上傳。
- [ ] 手動登出會等待 `flushCloudSave()` 成功；同步失敗時保留本機資料並阻止成功登出流程。
- [ ] 離開頁面時 `visibilitychange`／`pagehide` 會觸發 best-effort 備份，重複事件共用同一同步流程；測試不宣稱瀏覽器一定會等待請求完成。
- [ ] 雲端同步失敗時，本機最新存檔仍保留，後續可重試，不會因失敗而清空或回退本機資料。
- [ ] 相關自動化測試、`git diff --check` 及 Board 驗證通過；測試結果清楚標示為 mock／CI 驗證，未執行的真實瀏覽器長時間測試不得標示通過。

## 預計檢查檔案

- `services/presence.js`
- 管理員玩家名單／在線統計中所有使用 `last_seen` 的查詢與判定
- `services/cloud-save.js`、`systems/dice.js` 及登出流程（以測試覆蓋為主，僅在發現回歸問題時修改）
- `tests/` 內 presence、auto-roll、local-save、cloud-sync／lifecycle 相關測試
- 必要的 GitHub Actions 測試 workflow
- `board/T-0039-presence-heartbeat-cloud-sync.md`、`board/README.md`

## 紀錄

- 2026-11-09 [叉子] 棒子選擇 A：從最新 `main` 建立獨立任務分支，不修改或同步已分歧的 `work/chazi`。開單時 `main` HEAD 為 `3a2a1fdc60fade4c0b9e444a99c181d4c24bffc9`。
- 2026-11-09 [叉子] 已檢查 T-0027 自動擲骰 watchdog 任務及現有雲端同步改動；T-0027 已由棒子驗收結案。本任務承接既有 1.5 秒自動擲骰與 5 分鐘雲端同步設計，補上 presence 5 分鐘心跳與完整回歸測試，不重複修改已完成的 watchdog 功能。
- 2026-11-09 [叉子] 開單前 owner_side 有效 in_progress／review 任務為 3/5：T-0034、T-0035、T-0037；未發現進行中的 owner_side communicate task，兩道啟動閘門均未阻擋。任務可進入 in_progress。
- 2026-11-09 [叉子] Board 任務紀錄先由獨立 Board 分支提交；程式任務分支另從最新 main 建立。此 Board 紀錄同步不代表程式已修改、測試已執行、PR 已合併或已部署。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務

- 2026-11-13 09:12 [棒子明確驗收／叉子代記] 棒子在對話中明確確認本任務已成功，正式驗收結案；依 Board §1.2、§8 代記，狀態更新為 done。