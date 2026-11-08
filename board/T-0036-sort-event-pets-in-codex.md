---
id: T-0036
title: 依稀有度與每秒收益排序活動寵物圖鑑
status: done
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-05
updated: 2026-11-09
depends_on: [T-0035]
branch: task/T-0036-sort-event-pets-in-codex
done_by: 棒子
done_at: 2026-11-09
---

## 任務

修正收藏圖鑑寵物排序，讓六隻限時活動寵物依照自己的稀有度及每秒收益插入對應位置，不再全部集中在圖鑑最後。

## 範圍與禁止

- 只修改 `systems/pets.js`、本任務測試及本任務 Board 紀錄。
- 先依普通、稀有、傳奇、神話、秘密排序；同稀有度內依每秒基礎收益由低至高排序。
- 未知／特殊稀有度排在標準五階之後。
- 不修改活動寵物收益、一般融合池、玩家存檔或其他寵物資料。

## 驗收條件

- [ ] 六隻活動寵物按各自稀有度插入圖鑑。
- [ ] 同稀有度內依每秒收益由低至高排列。
- [ ] 原有寵物與管理員寵物仍依標準稀有度排序。
- [ ] 未知／特殊稀有度不會被排到普通品質之前。
- [ ] 專項測試通過，並完成 `git diff --check`。

## 紀錄

- 2026-11-05 18:50 [叉子] 接手 T-0036；排序程式與專項測試已在任務分支，從 main 的 T-0035 活動寵物資料延續。因 work/chazi 與 main 分歧且尚未包含 T-0035 活動寵物資料，本次不將任務分支直接合入 work/chazi，也不修改 main。
- 2026-11-05 18:50 [叉子] 以隔離測試夾具執行排序及活動寵物圖鑑測試，5 項通過；完整 repository CI 後續已補跑。
- 2026-11-05 18:55 [叉子] T-0036 PR #21 已合併至 main。GitHub Actions 的 pet-removal-and-admin-counts 工作成功執行 `node --test tests/pet-removal-admin-counts.test.js tests/limited-event-pets-codex.test.js`，並且 `git diff --check origin/main...HEAD` 成功；另外三個既有回歸工作亦全部成功。GitHub Pages 部署工作仍在執行，待確認部署完成。

## 完工回報

### 改了什麼

- `systems/pets.js`：圖鑑合併活動寵物後，依標準稀有度排序，同品質內依 `PET_BASE_INCOME` 由低至高排序；未知品質排在標準品質之後。
- `tests/limited-event-pets-codex.test.js`：新增完整圖鑑排序測試，確認六隻活動寵物均出現在圖鑑。

### 怎麼驗證的

- 隔離 Node 測試夾具：`node --test tests/limited-event-pets-codex.test.js`，5/5 通過。此為隔離夾具結果，並非完整 repository 執行結果。
- 已檢查兩個任務 commit 的新增 diff，未發現新增行尾空白。
- 完整 repository 的活動寵物圖鑑專項 Node 測試及 CI `git diff --check` 均已成功；GitHub Pages 部署完成狀態待確認。

### 沒做／做不到的

- 尚未建立 PR、合併或部署；GitHub Pages 線上版本尚未更新。
- 任務依賴 T-0035，T-0035 目前仍為 in_progress。

### 衍生任務／影響任務

- 無。

- 2026-11-09 [棒子] 使用者明確確認此任務先前已由其完成實際驗收，並指示直接驗收成功；本任務依 reviewer 的人工驗收確認結案。未實際執行的自動化測試或額外測量仍以既有紀錄為準，不另行宣稱已執行。
