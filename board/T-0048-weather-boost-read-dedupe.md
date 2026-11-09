---
id: T-0048
title: 合併重複天氣與全服加成讀取
status: done
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
done_at: 2026-11-09
---

## 任務

減少重複的天氣與全服加成雲端讀取：避免重複初始 refresh、對天氣骰子統計增加 in-flight 去重與短期快取，受限時停止統計 RPC。保留 Realtime 即時更新與五分鐘 reconciliation。

## 範圍與禁止

- 只處理天氣／全服加成重複讀取與快取。
- 不修改 `main`、Supabase schema／資料／權限或 GitHub Pages 部署。
- 不清除或修改玩家既有資料。
- 不降低 Realtime 即時更新能力。

## 驗收條件

- [x] 全服加成初始讀取只執行一次。
- [x] 天氣骰子統計同時只允許一個 RPC。
- [x] 五分鐘內重複開啟圖鑑不重複查詢統計。
- [x] Egress blocked 時不發送天氣統計 RPC。
- [x] 新增回歸測試並實際執行。
- [x] `git diff --check` 通過。

## 紀錄

- 2026-11-09 [叉子] 已移除 script.js 啟動尾端重複的 refreshGlobalBoost()（setupGlobalBoostUI 已執行首次讀取）；新增 services/weather-dice-stats.js，提供 5 分鐘快取、in-flight 去重、失敗 30 秒退避與 Egress blocked guard，script.js 已改用新 loader。新增 tests/weather-dice-stats.test.js；在隔離 Node.js v22.16.0 環境以相同服務檔與測試內容執行 node --test：4/4 pass；git diff --cached --check exit code 0。完整分支測試等待 GitHub Actions 新版 workflow 驗證。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務


- 2026-11-09 [棒子] 驗收：GitHub Actions Branch tests（commit 3ab0c024fab13dde3f23d0abb41583dadef1e875）完整測試 58/58 通過，JavaScript syntax check 與 branch whitespace check 通過；本項修改保留在 work/chazi，未部署，main 與玩家資料未修改。