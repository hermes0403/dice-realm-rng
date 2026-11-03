---
id: T-0024
title: 修正鑽石與糖果成就保存及雲端同步
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-04
updated: 2026-11-04
depends_on: []
branch: task/T-0024-achievement-unlock-persistence
done_by: 棒子
done_at:
---

## 任務

修正鑽石／糖果手套成就載入存檔時被錯誤刪除，以及購買成功後未排程雲端存檔同步的問題。檢查其他現有成就定義與條件，並依可驗證的鑽石手套購買紀錄，補回受影響玩家的鑽石成就完成標記。

## 範圍與禁止

- 只動：手套成就正規化、手套購買成功後的存檔同步、必要的成就回歸測試、Board 任務紀錄，以及符合條件的單一玩家成就標記。
- 不要動：其他玩家資產、其他成就獎勵、手套價格／購買 RPC、玩家資料結構、Supabase schema、其他任務或未合併分支。
- 補回成就時必須設為獎勵已發放，避免重複發獎；不得更動玩家藥水數量。
- 其他成就只做定義／條件一致性檢查，沒有證據不得任意補發。

## 驗收條件

- [ ] 存檔正規化後保留既有 craftVoid 與 craftUniverse 成就。
- [ ] 購買鑽石／糖果手套成功後呼叫既有 save 排程，讓成就與獎勵同步至雲端。
- [ ] 新增回歸測試，覆蓋成就保留及購買後 save 呼叫。
- [ ] 盤點其他成就定義與觸發條件；記錄發現及未修正項目。
- [ ] 只為有 g5 持有狀態及對應購買紀錄、且缺少 craftVoid 的玩家補回完成標記；rewardGiven 必須為 true，不重複發放獎勵。
- [ ] 測試通過、git diff --check 通過，PR 合併後確認 GitHub Pages 部署狀態。

## 紀錄

- 2026-11-04 [叉子] 依棒子本次指示建立。work/chazi 與 main 分歧（work/chazi 相對 main ahead 70、behind 12），且包含其他未整合工作；依 T-0023 的隔離方式，從最新 main 建立獨立任務分支，避免混入其他任務。
- 2026-11-04 [叉子] 已確認根因：normalizeGloves() 會刪除 craftVoid／craftUniverse；購買成功流程只寫本機存檔，未呼叫 save() 雲端同步。正式資料庫目前有 1 位玩家持有 g5 且有購買紀錄，但缺少 craftVoid。其他 20 項一般成就條件盤點未發現符合條件卻未標記的存檔。

## 完工回報

<!-- 推到 review 前必填；未完成就留空。 -->

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
