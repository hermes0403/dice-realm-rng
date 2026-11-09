---
id: T-0053
title: 管理面板雲端請求加入 Egress 閘門並降低收益監控頻率
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-09
updated: 2026-11-09
depends_on: [T-0042]
branch: work/chazi
done_by: 棒子
done_at:
---

## 任務

管理 API 與部分管理面板資料表查詢沒有統一檢查 Egress 受限狀態；全服收益監控在面板展開時每 15 秒重新讀取所有玩家存檔與個人資料。加入共用 circuit breaker，並將收益監控刷新改為 60 秒，保留手動載入能力。

## 範圍與禁止

- 只動：`admin/grants.js`、`admin/player-management.js`、`admin/monitoring.js`、`admin/ui-bindings.js`、`admin/pet-odds.js`、`systems/global-announcements.js`、`systems/global-boost.js`、`script.js`、對應 Node 測試、Board 任務紀錄。
- 不要動：`main`、Supabase schema／資料／權限、玩家既有資料、GitHub Pages 部署。
- 管理員功能與原本顯示內容必須保留。
- 一般 503 不能永久封鎖管理功能；402／Egress restriction 必須停止後續請求。

## 驗收條件

- [ ] 管理 Edge Function 請求共用 Egress 閘門，402 後不再重試。
- [ ] 管理面板直接查詢在受限狀態下不再發出請求。
- [ ] 全服收益監控自動刷新改為每 60 秒，且 Egress 受限時停止。
- [ ] 新增回歸測試驗證 402 閘門與監控刷新頻率。
- [ ] `node --test tests/*.test.js` 與 `git diff --check` 通過。

## 紀錄

- 2026-11-09 14:10 [叉子] 開單；發現管理 API 沒有共用 Egress gate，管理收益監控展開時每 15 秒抓取所有玩家存檔與 profiles，可能造成大筆回傳流量。

- 2026-11-09 14:10 [叉子] 已將 adminApi 接入共用 Egress circuit breaker，HTTP 402 會標記受限並阻止後續 Edge Function 呼叫；一般 503 不會永久封鎖。管理員玩家名單／稀有紀錄 fallback、收益監控、天氣歷史、藥水／成就／公告紀錄及直接天氣／全服加成 RPC 加入受限檢查；收益監控自動刷新由 15 秒改為 60 秒。寵物合成與稀有擲骰在受限時跳過雲端寫入，仍保留本機秘密寵物公告。adminApi 隔離測試 3/3 通過，本輪所有隔離測試 13/13 通過；逐檔回讀與尾端空白檢查通過。完整 repository 測試／GitHub CI 尚未執行，任務維持 in_progress。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
