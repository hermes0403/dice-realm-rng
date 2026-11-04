---
id: T-0027
title: 修復長時間自動擲骰意外暫停
status: review
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-04
updated: 2026-11-04
depends_on: []
branch: task/T-0027-auto-roll-watchdog
done_by:
done_at:
---

## 任務

玩家在筆記型電腦保持螢幕開啟並執行自動擲骰時，約 30～60 分鐘後自動擲骰會自行暫停。檢查並修復擲骰流程被非必要遠端請求、背景頁面恢復或計時器延遲卡住的問題。

## 範圍與禁止

- 只動：自動擲骰流程、必要的計時器恢復機制及對應回歸測試。
- 不要動：擲骰機率、玩家存檔格式、經濟數值、天氣規則、管理員功能、Supabase 資料。
- 本次因 `work/chazi` 與 `main` 分歧，依棒子本次明確同意，從最新 `main` 建立獨立任務分支；不修改或同步 `work/chazi`。

## 驗收條件

- [x] 全服稀有公告的遠端延遲不會阻塞下一抽。
- [x] 天氣骰子自動投入有逾時保護，失敗時不會永久鎖住擲骰流程。
- [x] 自動擲骰有卡住偵測與頁面恢復處理，且手動停止仍能立即停止。
- [x] 新增回歸測試，確認 watchdog 啟停與自動擲骰生命週期。
- [x] 執行相關測試及 `git diff --check`；記錄實際結果。

## 紀錄

- 2026-11-04 [叉子] 開始處理。檢查發現擲骰流程會等待全服稀有公告及天氣骰子自動投入，且只有在 `rolling === false` 時才會繼續自動抽取；缺少卡住恢復機制。
- 2026-11-04 [叉子] 棒子同意本次從最新 `main` 建立獨立任務分支；原因是 `work/chazi` 與 `main` 已分歧，避免將角色分支未整合修改帶入本任務。

- 2026-11-04 [叉子] 已在任務分支加入非阻塞稀有公告、天氣投入逾時、45 秒卡住 watchdog、頁面恢復處理與過期擲骰回呼隔離；新增 watchdog 啟停及卡住恢復測試，並新增 PR 自動測試 workflow。尚未執行測試與 git diff --check。

- 2026-11-04 [叉子] GitHub PR #10 已通過 GitHub Actions：`node --test tests/auto-roll-watchdog.test.js tests/lifecycle-regression.test.js` 與 `git diff --check` 均成功（workflow run 41743809651，job 126291665278）。

## 完工回報

### 改了什麼

- `systems/dice.js`：稀有公告非阻塞、天氣自動投入 15 秒逾時、45 秒 watchdog、頁面恢復及舊回呼隔離。
- `tests/auto-roll-watchdog.test.js`：新增 watchdog 啟停、重啟及擲骰卡住恢復測試。
- `.github/workflows/auto-roll-watchdog-tests.yml`：新增 PR 自動測試與 whitespace 檢查。
- `board/README.md`：登記 T-0027。
- PR：`https://github.com/hermes0403/dice-realm-rng/pull/10`。

### 怎麼驗證的

- GitHub Actions workflow run `41743809651`：成功。
- `node --test tests/auto-roll-watchdog.test.js tests/lifecycle-regression.test.js`：exit code 0。
- `git diff --check origin/main...HEAD`：exit code 0。

### 沒做／做不到的

- 尚未合併至 `main`，尚未部署 GitHub Pages；需棒子確認 PR #10 後再整合。
- 尚未以玩家筆電連續自動擲骰 30～60 分鐘進行實機觀察。

### 衍生任務／影響任務

- 無。
