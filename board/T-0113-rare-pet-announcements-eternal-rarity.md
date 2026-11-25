---
id: T-0113
title: 神話、秘密、永恆寵物合成全服彈幕與永恆稀有度配色
status: done
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-20
updated: 2026-11-25
depends_on: []
branch: task/T-0113-rare-pet-announcements-eternal-rarity
done_by: 棒子
done_at: 2026-11-25
---

## 任務

1. 玩家合成取得「神話」、「秘密」或「永恆」寵物時，顯示全服飛行彈幕，格式固定為：`玩家{玩家名稱} 召喚到{稀有度}寵物 {寵物名稱}`。例如：`玩家ccc 召喚到神話寵物 xxxx`。
2. 彈幕由合成成功的玩家端觸發一次，透過既有 Supabase Realtime announcement channel 廣播給其他在線玩家；不可新增資料表、輪詢或額外資料庫查詢。合成失敗、背包滿、普通／稀有／傳奇寵物不得觸發。
3. 保留秘密寵物舊版 `secret_pet` 廣播相容性，避免新舊版本玩家互相看不到公告或新版重複顯示。
4. 遊戲內永恆寵物稀有度文字改為較深的普通藍至普通粉漸層（藍色沿用稀有藍 `#0755d9`，粉色沿用既有粉色 `#ffaddd`），保留粗體，降低原本過亮的發光效果。

## 範圍與禁止

- 允許修改：`systems/realm-social.js`、`script.js`、新增 `systems/pet-rarity-theme.js`、新增相關測試與專用 workflow、Board 任務檔與索引。
- 避開 `style.css`、`index.html`、`sw.js`，目前 T-0085 正在修改共用版面與 PWA 檔案；永恆配色透過獨立模組注入單一樣式規則，不改共用 CSS。
- 不修改寵物機率、合成結果、玩家存檔、寵物背包、收益、帳號或 Supabase 正式資料。
- 不增加 Supabase DB / PostgREST 查詢、Realtime polling、資料表、RPC 或 Edge Function。
- 不移除既有 `secret_pet` 相容監聽；新版同一筆秘密寵物公告不得因舊事件與新事件而重複顯示。
- 只更新必要模組的 import cache key。

## 驗收條件

- [x] 神話、秘密、永恆寵物成功合成時，所有新版在線玩家均收到一次彈幕，文案與稀有度正確。
- [x] 發送端本地只顯示一次；舊版秘密寵物事件不會讓新版重複顯示。
- [x] 普通、稀有、傳奇寵物及失敗合成不發彈幕。
- [x] 永恆稀有度文字在背包、圖鑑及使用相同 class 的遊戲 UI 呈普通藍至普通粉漸層；其他稀有度不變。
- [x] 新增回歸測試，專用測試、JavaScript 語法檢查與差異空白檢查通過。
- [x] PR 合併與 GitHub Pages 部署狀態經棒子實際驗收確認；不得把測試通過宣稱為已部署。

## 開工紀錄

- 2026-11-20 [叉子] 以 main SHA `4a6f3124cf35fb8308183f6b515d25ff10fae30c` 檢查 Board：owner_side 的 `in_progress` 任務為 T-0085（1/5）；未發現指派給 owner_side 的有效 Communicate task 或 owner_side 原任務鎖定。T-0111／T-0112 已由既有 PR 使用，故本任務使用下一個未使用 ID T-0113。T-0085 涵蓋共用 CSS／首頁／Service Worker，本任務避開這些檔案。

- 2026-11-20 [叉子] 開工前再次核對 origin/main SHA `4a6f3124cf35fb8308183f6b515d25ff10fae30c`；owner_side `in_progress` 任務為 T-0085，容量 1/5；完整讀取所有有效 Board 任務後，無指派給 owner_side 的有效 Communicate task、無 owner_side `returned` 委派單或未解除鎖定。任務由 open 轉 in_progress，開始實作。

- 2026-11-20 [叉子] PR #235 專用測試 6/6 通過；JavaScript 語法檢查、git diff --check 通過。PR 上所有 14 個相關 GitHub Actions 工作均成功（含 Board lifecycle validation）。程式實作完成，轉 review；正式合併與 Pages 部署仍待確認。


## 驗收結案

- 2026-11-25 [棒子] 使用者確認本任務驗收成功，功能沒有問題，正式結案。
