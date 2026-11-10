---
id: T-0055
title: 將全服天氣與公告 Realtime 延後至登入初始化完成
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-09
updated: 2026-11-09
depends_on: [T-0042]
branch: work/chazi
done_by: 棒子
done_at:
---

## 任務

目前頁面載入時就建立全服公告與全服天氣 Realtime 頻道，且天氣 5 分鐘補查計時器在未登入時仍可能查詢公開天氣資料。遊戲需要登入才能進行擲骰與存檔，應延後到雲端存檔及登入初始化成功後才建立全服頻道，登出時解除訂閱；保留登入後天氣即時更新與補查。

## 範圍與禁止

- 只動：`systems/weather.js`、`systems/global-announcements.js`、`services/auth.js`、`script.js`、對應 Node 測試、Board 任務紀錄。
- 不要動：`main)、Supabase schema／publication／資料／權限、玩家既有資料、GitHub Pages 部署。
- 保留登入後全服天氣、稀有擲骰、秘密寵物及管理員公告即時事件。
- 不可在雲端服務受限時嘗試重新連線。

## 驗收條件

- [ ] 未登入時不建立全服公告與全服天氣 Realtime 頻道。
- [ ] 雲端存檔與登入初始化成功後才建立頻道及初始天氣讀取。
- [ ] 登出時解除全服公告、天氣與個人天氣訂閱。
- [ ] 402／Egress 受限時不重新建立頻道或發送補查。
- [ ] 新增回歸測試驗證登入前不連線、登入後連線、登出解除。
- [ ] `node --test tests/*.test.js` 與 `git diff --check` 通過。

## 紀錄

- 2026-11-09 14:10 [叉子] 開單；確認全服公告與全服天氣 Realtime 在頁面載入時即建立，未登入訪客也會佔用 WebSocket 頻道；天氣補查計時器也在登入前啟動。

- 2026-11-09 14:10 [叉子] 已移除頁面啟動時的全服公告／天氣 Realtime 建立；改為登入雲端存檔與初始化成功後建立。登出會解除公告、全服天氣、個人天氣與投票頻道；天氣 5 分鐘補查在未登入或受限時不發請求。新增公告與天氣生命週期測試；目前隔離 Node 測試共 16/16 通過。完整 repository 測試與 GitHub CI 尚未執行，任務維持 in_progress。


- 2026-11-09 [叉子] 追加檢查發現 `systems/global-boost.js` 的全服加成 Realtime 仍在 `setupGlobalBoostUI()` 頁面初始化時提前建立，且立即讀取 `realm_global_boost`。已改為新增 `startGlobalBoostRealtime()`／`stopGlobalBoostRealtime()`，登入初始化成功後由 `services/auth.js` 注入的全服啟動流程呼叫，登出解除頻道；未登入時不讀取、不訂閱，管理收益監控計時器也加上登入判斷。新增 `tests/global-boost-render.test.js` 生命週期回歸測試。GitHub 回讀確認 `systems/global-boost.js`、`script.js`、測試檔均已寫入 `work/chazi`；測試尚未實際執行，完整 CI 未執行，故仍維持 in_progress。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務


- 2026-11-10 [叉子] 棒子已實際驗收目前遊戲功能正常；本紀錄不將舊 CI 失敗描述為遊戲目前故障。重新執行 `work/chazi` HEAD `690827f9946a744fb250b7a4041ab89b675fae86` 的 Branch tests（run #135，attempt 2）後，完整測試仍為 79 項中 65 通過、14 失敗；失敗包含測試檔語法錯誤及測試 mock／預期與目前生命週期設計不一致。未修改遊戲程式。由於任務原驗收條件仍要求完整測試通過，狀態暫維持 `in_progress`；待測試套件釐清後再送審，遊戲功能正常的 Owner 驗收結果已另行記錄。
