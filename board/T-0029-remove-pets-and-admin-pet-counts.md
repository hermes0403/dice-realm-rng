---
id: T-0029
title: 移除指定寵物並新增全服寵物持有數統計
status: review
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-04
updated: 2026-11-04
depends_on: []
branch: task/T-0029-remove-pets-and-admin-pet-counts
done_by:
done_at:
---

## 任務

將冰原兔、藍晶甲蟲、日蝕金狼、星焰鳳皇移出新的寵物合成取得池，依原本個別權重重新分配剩餘寵物的機率；更新寵物背包排序文字，並在管理員面板新增全服各寵物持有總數與持有人數統計。

## 範圍與禁止

- 只動：寵物取得池與個別權重、寵物圖鑑／管理員發放選單的退場顯示、寵物背包排序文字、管理員全服寵物數量彙總及相關測試。
- 四隻退場寵物的定義、圖片索引、收益與技能資料保留，供既有玩家存檔繼續顯示及使用；不刪除任何玩家持有的寵物或存檔。
- 退場寵物不再由合成取得，也不出現在一般管理員發放選單；曾發現／持有的玩家仍可在圖鑑查看。
- 重新分配方式：移除該寵物原有權重，保留同稀有度其他寵物的相對權重，由剩餘權重總和自動正規化；不改變各骰子區間的稀有度機率。
- 全服統計只顯示彙總數字，不顯示玩家名稱、帳號或個別存檔內容；只讀取，不寫入資料庫。
- 本次依棒子確認，從最新 main 建立獨立任務分支；保留 work/chazi 不動，只建立 PR，不合併、不部署。

## 驗收條件

- [x] 冰原兔、藍晶甲蟲、日蝕金狼、星焰鳳皇不會再由寵物合成取得。
- [x] 剩餘同稀有度寵物依原始相對權重重新分配機率，其他稀有度機率不變。
- [x] 既有玩家持有的四隻退場寵物仍能正常顯示、裝備、計算收益及保留圖鑑紀錄。
- [x] 管理員發放選單不再提供四隻退場寵物。
- [x] 寵物背包排序顯示「依稀有度遞增／遞減」及「依每秒金錢遞增／遞減」。
- [x] 管理員面板顯示每種寵物全服持有總數及持有人數，並顯示總寵物數與持有寵物玩家數。
- [x] 全服寵物統計不顯示任何玩家個資，且不修改雲端存檔。
- [x] `node --test tests/pet-removal-admin-counts.test.js` 通過，`git diff --check` 無錯誤。

## 紀錄

- 2026-11-04 12:12 [叉子] 依棒子明確同意，從最新 main 建立獨立任務分支；work/chazi 保持不動。
- 2026-11-04 12:12 [叉子] 已開始處理寵物退場、權重重分配、背包排序標籤及管理員全服持有數統計；不操作玩家存檔，不合併、不部署。
- 2026-11-04 12:23 [叉子] 修改與回歸測試已完成，PR #12 已建立；新增測試及三項既有回歸 workflow 全部成功，已送棒子驗收；未合併、未部署。

## 完工回報

### 改了什麼

- `data/pets.js`：將 c9 冰原兔、r4 藍晶甲蟲、l1 日蝕金狼、m2 星焰鳳皇標記為退場；合成池排除四隻，保留定義與圖片索引。移除原個別權重後，剩餘寵物按原相對權重自動正規化。
- `systems/pets.js`：管理員一般發放選單隱藏退場寵物；圖鑑只對曾發現／持有者保留退場寵物。
- `index.html`：更新寵物背包四種排序名稱及順序；新增全服寵物統計面板。
- `admin/monitoring.js`、`admin/ui-bindings.js`、`script.js`：使用既有管理員專用存檔監控 API，彙總每種寵物總數、持有人數、全服寵物總數及持有寵物玩家數；畫面不顯示玩家個資。
- 新增 `tests/pet-removal-admin-counts.test.js` 與 `.github/workflows/pet-removal-admin-counts-tests.yml`。
- PR：`https://github.com/hermes0403/dice-realm-rng/pull/12`。最新任務 commit：`c22b61a977243c860992244f6ec3aa7ca5f29701`。

### 怎麼驗證的

- GitHub Actions `41772800054`（本任務）：success；`node --test tests/pet-removal-admin-counts.test.js` 與 `git diff --check origin/main...HEAD` 兩步均成功。
- GitHub Actions `41772800354`（寵物背包／自動出售回歸）：success。
- GitHub Actions `41772800007`（金錢倍率回歸）：success。
- GitHub Actions `41772800011`（成就保存回歸）：success。
- 比較 `main...task/T-0029-remove-pets-and-admin-pet-counts`：12 commits ahead、0 behind，10 個任務相關檔案有變更。

### 沒做／做不到的

- 未合併至 `main`，未部署 GitHub Pages；等待棒子驗收 PR #12。
- 未刪除或修改任何玩家持有的寵物、雲端存檔或資料庫資料。
- 未進行正式管理員帳號的瀏覽器實機驗收；目前驗證為程式回歸測試與 CI。
- `work/chazi` 未修改。

### 衍生任務／影響任務

- 無
