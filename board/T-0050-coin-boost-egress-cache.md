---
id: T-0050
title: 降低寵物收益倍率查詢頻率並加入 Egress 受限閘門
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-09
updated: 2026-11-09
depends_on: []
branch: work/chazi
done_by: 棒子
done_at:
---

## 任務

寵物收益系統每秒呼叫倍率刷新函式，但目前只使用 5 秒快取，導致每位在線玩家可能每 5 秒向管理 Edge Function 發出一次倍率查詢；此查詢也沒有共用 Egress 受限閘門。將快取調整為合理間隔，並在 HTTP 402／Egress restriction 後停止後續請求，保留倍率資料與寵物收益顯示。

## 範圍與禁止

- 只動：`systems/coin-boost.js`、`script.js`、對應 Node 測試、Board 任務紀錄。
- 不要動：`main`、Supabase schema／資料／權限、玩家既有資料、GitHub Pages 部署。
- 不變更寵物收益計算公式及現有倍率上限。
- 一般網路錯誤需有退避，不可形成每秒重試。

## 驗收條件

- [ ] 倍率查詢成功後至少 60 秒內不重複發出 Edge Function 請求。
- [ ] 多次同時呼叫時只會有一個進行中的查詢。
- [ ] HTTP 402／Egress restriction 後不再發出倍率查詢。
- [ ] 一般 503 錯誤有退避，不會每秒重試。
- [ ] 新增回歸測試，驗證快取、併發合併、402 閘門與一般錯誤退避。
- [ ] `node --test tests/*.test.js` 與 `git diff --check` 通過。

## 紀錄

- 2026-11-09 14:10 [叉子] 開單；檢查寵物收益計時器時發現倍率服務每 5 秒可能呼叫一次管理 Edge Function，且未接入雲端受限狀態。先修正請求頻率與容錯，不改收益計算。

- 2026-11-09 14:10 [叉子] 已將倍率查詢快取調整為 60 秒，新增一般失敗 30 秒退避，並接入共用 Egress 受限狀態；同時新增快取、併發、402 與 503 回歸測試。待執行測試驗證。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
