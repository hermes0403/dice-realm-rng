---
id: T-0032
title: 修復寵物圖片與寵物 ID 錯配
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
branch: task/T-0032-pet-image-id-mapping
done_by:
done_at:
---

## 任務

修復寵物圖鑑、寵物背包等介面中寵物名稱與圖片錯配的問題。現況為寵物圖片仍以陣列索引搭配，退場寵物移除後圖片清單未同步，造成後續寵物顯示錯誤圖片。

## 範圍與禁止

- 只動：寵物圖片資產定義、寵物 ID 與圖片的明確對應、相關顯示函式、必要測試及 Board 紀錄。
- 每隻現役寵物必須以穩定 pet ID 對應圖片，不得依 PETS 陣列位置、圖片陣列位置或取餘數推算。
- 逐張核對現存圖片內容與寵物名稱；無法確認歸屬的舊圖不得指派給其他寵物。
- 清理已退場且確認無引用的舊圖片資產；保留所有現役寵物正確圖片。
- 不修改玩家持有寵物、玩家存檔、融合機率、寵物收益及 Supabase 資料。
- 依棒子明確授權，從最新 main 建立獨立任務分支；work/chazi 保持不動。此授權不包含合併或部署。

## 驗收條件

- [ ] 39 隻現役寵物各自有唯一且明確的 ID → 圖片對應。
- [ ] 圖鑑、寵物背包及所有使用 petArt 的畫面皆顯示正確圖片。
- [ ] 不存在依陣列索引或取餘數配圖的程式。
- [ ] 退場寵物圖片不再被現役寵物引用，無法辨識歸屬的圖片不會被錯誤套用。
- [ ] 新增測試涵蓋所有現役寵物 ID、缺圖處理及退場 ID 不可引用。
- [ ] 相關測試及 git diff --check 通過；未執行項目需明確列出。

## 紀錄

- 2026-11-04 [叉子] 棒子明確授權從最新 main 建立獨立修復分支，work/chazi 保持不動。開工前比較 main 與 work/chazi 為 diverged（main 相對 work/chazi：work/chazi ahead 70、behind 73），因此不從 work/chazi 派生。
- 2026-11-04 [叉子] 已建立 task/T-0032-pet-image-id-mapping，基準為 main 最新提交 fcc70fba3441ce144d00e8106c28130bb2d44aa5。
- 2026-11-04 [叉子] 查核 43 張原始圖片後確認其中 4 張分別屬於已退場寵物（冰原兔、藍晶甲蟲、日蝕金狼、星焰鳳皇）；其餘 39 張依實際圖像逐一對應到 39 個現役 pet ID。`PET_IMAGE_ASSETS` 已改為以 pet ID 為 key 的物件，`petArt()` 改用 `PET_IMAGE_ASSETS[pet.id]`，並為缺圖加上圖示 fallback。新增 `tests/pet-image-mapping.test.js`。

## 驗收紀錄

- 2026-11-04 [叉子] PR #15 已合併至 main（979ab016adca9ae18eed76f954042c956fa2cf30），靜態檢查確認 39 個 pet ID 對應完整；但 Node 測試、git diff --check 及瀏覽器圖鑑／背包驗證未執行。狀態調整為 review，尚不能判定完整通過。

## 完工回報

### 改了什麼

- `data/pets.js`：將 43 張陣列圖片改為 39 張 ID 對應圖片，排除 4 張退場寵物舊圖。
- `systems/pets.js`：移除陣列索引與取餘數配圖，依寵物 ID 取圖；缺圖時顯示寵物圖示。
- `tests/pet-image-mapping.test.js`：新增現役 ID 完整性、退場 ID 排除及圖片唯一性測試。
- `board/README.md`：新增 T-0032 索引。

### 怎麼驗證的

- GitHub 靜態檢查：現役寵物 39 隻、圖片對應 39 筆、ID 無重複、圖片無重複、對應 key 與現役 ID 完全相同、退場 ID 均無對應；以上檢查均為 true。
- 確認 `petArt()` 已使用 `PET_IMAGE_ASSETS[pet.id]`，不存在舊的 `PETS.findIndex(...)` 配圖邏輯。
- GitHub compare：分支相對 main ahead 5、behind 0；變更僅含 Board 索引、任務紀錄、data/pets.js、systems/pets.js 及新增測試。
- Node 測試、`git diff --check`、瀏覽器實際圖鑑與背包驗證：未執行；目前 GitHub API 工作方式無法代替本機 Node 與瀏覽器環境。

### 沒做／做不到的

- 尚未建立 PR、合併 main 或部署 GitHub Pages；需另行取得棒子明確授權。
- 尚未完成遊戲頁面實際顯示驗收。

### 衍生任務／影響任務

 
## 補充驗收紀錄

- 2026-11-04 16:00 [叉子] 更正先前紀錄：PR #15 已合併，Pages 部署 run `41802946762` success。PR workflow 的 pet-removal 回歸 job 成功，且該 job 已執行 `git diff --check`；但 workflow 執行的是 `tests/pet-removal-admin-counts.test.js`，並未執行新增的 `tests/pet-image-mapping.test.js`。
- 2026-11-04 16:00 [叉子] 39 個 ID 對應的靜態核對已有紀錄；圖片映射專屬 Node 測試及線上圖鑑／背包實際顯示仍未完成，維持 review。
