---
id: T-0028
title: 排除萬聖節骰子自動出售並補齊寵物背包排序
status: done
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-04
updated: 2026-11-04
depends_on: []
branch: task/T-0028-pet-backpack-sort-and-auto-sell-filter
done_by: 叉子（依棒子授權技術驗收）
done_at: 2026-11-04
---

## 任務

調整首頁「背包與自動出售」設定，完全排除萬聖節限定骰子，並防止舊存檔中殘留的萬聖節自動出售設定繼續生效；寵物背包「我的寵物」清單提供收益與稀有度兩種排序方向。

## 範圍與禁止

- 只動：自動出售骰子選項清單與自動出售判斷、寵物背包排序控制與排序邏輯，以及必要回歸測試。
- 不要動：萬聖節骰子的擲出機率、圖鑑／收藏、玩家骰子與寵物資產、出售價格、寵物合成及自動出售寵物設定。
- 排序只改變畫面顯示順序，不改變玩家持有資料及裝備狀態。
- 本次依棒子明確同意，從最新 main 建立獨立任務分支；保留 work/chazi 不動，完成後只建立 PR，不合併或部署。

## 驗收條件

- [x] 自動出售骰子選項不顯示 d33、d34、d35、d36 等萬聖節骰子。
- [x] 舊存檔殘留的萬聖節自動出售 ID 不會造成萬聖節骰子被自動出售。
- [x] 一般／天氣骰子選項依常見到稀有排列。
- [x] 寵物背包提供賺錢遞增、賺錢遞減、稀有度遞增、稀有度遞減四種排序。
- [x] 排序不修改原始寵物陣列、寵物 UID、裝備狀態或持有資料。
- [x] 執行相關測試與 git diff --check，記錄實際結果。

## 紀錄

- 2026-11-04 09:54 [叉子] 依棒子明確同意，從最新 main 建立獨立任務分支；work/chazi 保持不動。
- 2026-11-04 09:54 [叉子] 已更新首頁說明與寵物排序選項；自動出售選項移除萬聖節骰子，並在渲染時清除舊設定中的萬聖節 ID；擲骰出售判斷另加萬聖節保護。寵物收益遞減排序邏輯已加入，尚待測試。

- 2026-11-04 10:00 [叉子] 新增純函式排序／篩選與回歸測試；GitHub Actions run 41757623632 成功，其他既有 PR workflow 亦全部成功。任務已送 PR #11，等待棒子驗收；未合併、未部署。

## 驗收紀錄

- 2026-11-04 [叉子] 技術驗收（依棒子授權）：PR #11 已合併至 main（8d07b092c5115f3b842596c94e0fa31cd60788ef）；本任務 Pet backpack and auto-sell regression tests、git diff --check 均由 GitHub Actions 通過，PR 上其他既有回歸 workflow 亦成功；最新已確認的 GitHub Pages 部署 run 41806019959 success，包含本任務變更。驗收條件均有自動化測試及合併部署證據，狀態更新為 done。未另行執行真實玩家瀏覽器操作，列為部署後觀察事項。

## 完工回報

### 改了什麼

- `index.html`：更新自動出售說明，寵物背包排序選項改為賺錢遞減／遞增、稀有度遞減／遞增四種。
- `ui/inventory.js`：新增 `filterAutoSellDice`，排除 d33～d36，清除舊設定殘留的萬聖節 ID；一般骰子與天氣骰子依常見到稀有排序。
- `systems/dice.js`：自動出售判斷再加萬聖節 ID 保護，避免舊存檔偏好誤賣。
- `systems/pets.js`：新增 `sortOwnedPets` 純函式，支援收益與稀有度雙向排序。
- 新增 `tests/pet-backpack-sort-and-auto-sell.test.js` 及對應 GitHub Actions workflow。
- PR：`https://github.com/hermes0403/dice-realm-rng/pull/11`。

### 怎麼驗證的

- GitHub Actions run `41757623632`（本任務測試）：success。
- GitHub Actions run `41757623395`（achievement-persistence）：success。
- GitHub Actions run `41757623367`（coin-boost）：success。
- GitHub Actions run `41757623401`（auto-roll-watchdog）：success。
- 比較 `main...task/T-0028-pet-backpack-sort-and-auto-sell-filter`：11 commits ahead、0 behind，僅 8 個任務相關檔案有差異。
- PR workflow 已執行 `node --test tests/pet-backpack-sort-and-auto-sell.test.js` 及 `git diff --check origin/main...HEAD`，整體成功。

### 沒做／做不到的

- 未合併至 main，未部署 GitHub Pages；待棒子驗收 PR #11。
- 未操作 Supabase 或玩家資產資料。
- 尚未進行正式玩家帳號的實機操作驗收。

### 衍生任務／影響任務

- 無
