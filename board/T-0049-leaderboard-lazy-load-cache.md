---
id: T-0049
title: 排行榜改為開啟時載入並加入快取
status: done
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-09
updated: 2026-11-09
depends_on: [T-0042, T-0046]
branch: work/chazi
done_by: 棒子
done_at: 2026-11-09 2026-11-09
---

## 任務

取消遊戲啟動與雲端存檔載入時的重複排行榜查詢，改由玩家開啟排行榜頁面時載入；加入 in-flight 去重與短期快取，避免連續切頁反覆讀取。

## 範圍與禁止

- 只處理排行榜讀取時機、去重、快取與回歸測試。
- 不修改 `main`、Supabase schema／資料／權限或 GitHub Pages 部署。
- 不清除或修改玩家既有資料。
- 管理員明確要求強制刷新時仍保留 force refresh 能力。

## 驗收條件

- [x] 移除 app startup 的排行榜讀取。
- [x] 移除登入初始化與 cloud-save load 的重複排行榜讀取。
- [x] 開啟排行榜頁面時才讀取。
- [x] 同時請求合併，30 秒快取內不重複讀取。
- [x] Egress blocked 時不發送排行榜查詢。
- [x] 新增回歸測試並實際執行。
- [x] `git diff --check` 通過。

## 紀錄

- 2026-11-09 [叉子] 已移除 script.js 啟動尾端、services/auth.js 登入初始化、services/cloud-save.js 存檔載入完成後的排行榜查詢；ui/navigation.js 原本就有開啟 leaderboard 頁面時 refresh，因此保留為一般玩家唯一讀取入口。systems/leaderboards.js 新增 in-flight 去重、30 秒快取、10 秒失敗退避、force refresh，且 blocked 時只更新 UI 不查詢。script.js 的手動刷新按鈕與管理員更新流程使用 force refresh。新增 tests/leaderboard-refresh-cache.test.js；隔離 Node.js v22.16.0 測試 3/3 pass，git diff --cached --check exit code 0；完整分支測試待 GitHub Actions。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務


- 2026-11-09 [棒子] 驗收：GitHub Actions Branch tests（commit 3ab0c024fab13dde3f23d0abb41583dadef1e875）完整測試 58/58 通過，JavaScript syntax check 與 branch whitespace check 通過；本項修改保留在 work/chazi，未部署，main 與玩家資料未修改。

- 2026-11-09 [棒子] 驗收：GitHub Actions Branch tests（commit 3ab0c024fab13dde3f23d0abb41583dadef1e875）完整測試 58/58 通過，JavaScript syntax check 與 branch whitespace check 通過；本項修改保留在 work/chazi，未部署，main 與玩家資料未修改。