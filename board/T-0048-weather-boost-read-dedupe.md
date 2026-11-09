---
id: T-0048
title: 合併重複天氣與全服加成讀取
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-09
updated: 2026-11-09
depends_on: [T-0042, T-0044, T-0046]
branch: work/chazi
done_by: 棒子
done_at:
---

## 任務

減少重複的天氣與全服加成雲端讀取：避免重複初始 refresh、對天氣骰子統計增加 in-flight 去重與短期快取，受限時停止統計 RPC。保留 Realtime 即時更新與五分鐘 reconciliation。

## 範圍與禁止

- 只處理天氣／全服加成重複讀取與快取。
- 不修改 `main`、Supabase schema／資料／權限或 GitHub Pages 部署。
- 不清除或修改玩家既有資料。
- 不降低 Realtime 即時更新能力。

## 驗收條件

- [ ] 全服加成初始讀取只執行一次。
- [ ] 天氣骰子統計同時只允許一個 RPC。
- [ ] 五分鐘內重複開啟圖鑑不重複查詢統計。
- [ ] Egress blocked 時不發送天氣統計 RPC。
- [ ] 新增回歸測試並實際執行。
- [ ] `git diff --check` 通過。

## 紀錄

- 2026-11-09 [叉子] 盤點發現 setupGlobalBoostUI() 已執行 refreshGlobalBoost()，script.js 啟動尾端又額外呼叫一次；loadWeatherDiceExistCounts() 每次呼叫都直接 RPC，缺少 in-flight 去重與快取。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
