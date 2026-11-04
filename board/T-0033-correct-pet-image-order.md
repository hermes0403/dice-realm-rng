---
id: T-0033
title: 依原始順序移除退役寵物圖片並修正配對
status: review
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-04
updated: 2026-11-05
depends_on: []
branch: task/T-0033-correct-pet-image-order
done_by:
done_at:
---

## 任務

修正 T-0032 合併後仍存在的寵物名稱與圖片錯配。以退役前 43 張圖片的原始順序為基準，移除 4 隻退役寵物的圖片，再依現役 PETS 順序重新建立 ID 對應，避免手動錯刪其他圖片。

## 範圍與禁止

- 只動：寵物圖片資產對應檢查、前端入口與寵物模組快取版本、相關測試及 Board 紀錄。
- 確認目前 main 的 ID 圖片表已排除原始圖片序列第 9、13、19、29 張（1 起算），對應退役寵物 ID：c9、r4、l1、m2；不得重複刪除其他圖片。
- 現有 39 張圖片必須依現役 PETS 順序對應：38 隻一般寵物及最後的管理員寵物水餃。
- 對 index.html 的 script.js 入口、script.js 內 data/pets.js 與 systems/pets.js 匯入加版本 query，避免瀏覽器繼續使用舊模組快取。
- 保留依穩定 pet ID 取圖，不得恢復陣列索引或取餘數配圖。
- 不修改玩家存檔、持有寵物、融合機率、寵物收益或 Supabase 資料。
- work/chazi 與 main 均不直接修改；本任務由最新 main 建立獨立分支。此授權不包含 PR、合併或部署。

## 驗收條件

- [ ] 退役的 4 張圖片確實移除。
- [ ] 39 張圖片依現役 PETS 順序與 39 個 pet ID 一對一對應。
- [ ] 38 隻一般寵物及管理員水餃的名稱與圖片位置正確。
- [ ] 圖鑑、背包及共用 petArt 的畫面仍依 pet ID 取圖。
- [ ] 測試涵蓋現役 ID、圖片唯一性、退役 ID 排除及 key 順序。
- [ ] 執行可用的測試與 git diff --check；未執行項目明確記錄。
- [ ] 未建立 PR、未合併 main、未部署 Pages，除非另獲棒子明確授權。

## 紀錄

- 2026-11-04 [叉子] 棒子明確允許從最新 main 建立新分支並修改；work/chazi 保持不動。
- 2026-11-04 [叉子] 比對 T-0032 修改前的 43 張原始圖片陣列，確認需刪除第 9、13、19、29 張（1 起算），其餘 39 張依原始順序對應 38 隻現役一般寵物及管理員水餃。
- 2026-11-04 [叉子] 再次逐張檢視 39 張圖片，確認現有 PET_IMAGE_ASSETS 的內容、順序與寵物名稱相符；並確認 main 已成功完成 GitHub Pages build 與 deploy。原始 4 張退役圖早已不在現有 39 張表內，因此不再重複刪除。
- 2026-11-04 [叉子] 為 index.html 的 script.js 入口，以及 script.js 中 data/pets.js、systems/pets.js 兩個模組匯入加上版本 query，強制瀏覽器取得最新寵物圖片映射與 ID 渲染程式。

## 驗收紀錄

- 2026-11-04 [叉子] PR #16 已合併至 main（2459544334da4c5d343eef2ebb72bc0ae6947637），GitHub Pages 部署 run 41806019959 success；但 Node 測試、git diff --check 及線上圖鑑／背包實際圖片驗證尚未完成。狀態調整為 review，待補測後再判定通過。

## 完工回報

### 改了什麼

- data/pets.js：確認 main 中現有 39 張 ID 對應與原始 43 張圖片序列移除退役圖後的順序完全一致；此檔無需再次修改。
- tests/pet-image-mapping.test.js：新增圖片對應 key 順序必須與 PETS 順序一致的測試。
- index.html：為 script.js 加版本 query。
- script.js：為 data/pets.js、systems/pets.js 加版本 query。
- board/README.md：新增 T-0033 索引。

### 怎麼驗證的

- 已透過原始 main 版本 fcc70fba3441ce144d00e8106c28130bb2d44aa5 取得原始 43 張圖片序列。
- 靜態核對確認原始 43 張圖移除第 9、13、19、29 張後，剩餘 39 張與現有 PET_IMAGE_ASSETS 的值逐筆完全相同；39 個 key 順序與現有 PETS 完全一致，圖片內容無重複。
- 已逐張目視檢查 39 張圖，寵物圖像內容與名稱一致。
- GitHub Actions 的 Pages build 與 deploy job 均為 success（run 41802946762，commit 979ab016adca9ae18eed76f954042c956fa2cf30）。
- Node 測試、git diff --check、瀏覽器實際圖鑑／背包驗證尚未執行。

### 沒做／做不到的

- 尚未建立 PR、合併 main 或部署 GitHub Pages。
- 尚未確認線上 Pages 的實際圖片顯示結果。

### 衍生任務／影響任務

- 待本任務完成後，由棒子在正式 Pages 驗收圖鑑及寵物背包圖片。

 
## 補充驗收紀錄

- 2026-11-04 16:00 [叉子] 更正先前紀錄：PR #16 已合併，Pages 部署 run `41806019959` success。PR workflow 的 pet-removal 回歸 job `41805922228` 成功，且已執行 `git diff --check`；但 workflow 執行的是 `tests/pet-removal-admin-counts.test.js`，並未執行新增的寵物圖片映射測試。
- 2026-11-04 16:00 [叉子] 原始 43 張圖片移除 4 張後與 39 張 ID 對應表的逐筆核對已有紀錄；圖片映射專屬 Node 測試及線上圖鑑／背包實際顯示仍未完成，維持 review。

- 2026-11-05 [叉子] 棒子已完成線上人工驗收：39 隻寵物在圖鑑、背包及其他顯示位置的圖片均正確，重新整理後仍正確。另從 GitHub main 靜態重查，現役 39 個 pet ID 與 39 張圖片 key 一對一且順序完全相同，圖片內容無重複，4 個退場 ID（c9、r4、l1、m2）均無映射；petArt 依穩定 ID 取圖並有缺圖 fallback。新增測試包含 key 順序斷言。11 項等價靜態斷言全部通過；PR #15/#16 新增 patch 逐行空白掃描未發現尾端空白或空白後接 tab。因執行環境無法解析 github.com（`git clone` 回報 `Could not resolve host: github.com`），`node --test tests/pet-image-mapping.test.js` 與正式 `git diff --check` 命令仍未能執行；patch 空白掃描僅作替代檢查，不冒稱為原命令通過。維持 review，待 Node 測試可執行後再結案。
