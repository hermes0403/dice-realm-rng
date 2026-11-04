---
id: T-0031
title: 整合工坊導覽並將寵物合成入口改為融合機
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
branch: task/T-0031-workshop-navigation-and-fusion-machine
done_by:
done_at:
---

## 任務

將寵物合成入口更名為「融合機」，更新寵物數量與介紹文案；並把原本分開的「手套工坊」及「藥水工坊」導覽入口整合為「工坊」，進入後可在兩個內部分類間切換。

## 範圍與禁止

- 只動：寵物融合頁標題與簡介、工坊導覽入口、工坊內部分類切換及必要樣式、Board 任務紀錄。
- 融合機簡介固定顯示「39 種寵物 · 5 個品質」、「PET SYNTHESIS CORE」、「投入兩顆骰子，合成一隻寵物。」及指定的骰子倍率說明。
- 工坊保留原有手套及藥水功能、DOM 控制項 ID 與事件綁定；只改頁面導覽與分類呈現。
- 不修改擲骰、寵物融合機率、手套／藥水合成規則、玩家存檔及 Supabase 資料。
- 本次依棒子明確授權，從最新 main 建立獨立任務分支；work/chazi 保持不動。此授權不包含合併或部署。

## 驗收條件

- [ ] 寵物頁入口及標題顯示「融合機」，數量顯示「39 種寵物 · 5 個品質」。
- [ ] 融合機顯示指定的完整介紹文字，兩顆骰子的選擇與合成功能維持正常。
- [ ] 主導覽只顯示一個「工坊」入口，不再分別顯示手套工坊及藥水工坊。
- [ ] 進入工坊後可切換「手套工坊」及「藥水工坊」，兩者既有功能及欄位 ID 保留。
- [ ] 相關測試及 git diff --check 通過；未執行項目需明確列出。

## 紀錄

- 2026-11-04 [叉子] 棒子回覆「用啊」，明確授權本次從最新 main 建立獨立任務分支，並保留 work/chazi 不動。已建立 task/T-0031-workshop-navigation-and-fusion-machine，基準 commit 為 aa7e8d484f424bb4fbc0c87cd606b4a1ae9f10b1。
- 2026-11-04 [叉子] 已修改 index.html、config.js、ui/navigation.js：寵物頁改名「融合機」、數量更新為 39 種；手套與藥水內容改放在單一「工坊」頁面，新增兩個內部分類切換，原有手套／藥水欄位 ID 保留。Board 索引及任務檔已建立。

## 驗收紀錄

- 2026-11-04 [叉子] PR #14 已合併至 main（fcc70fba3441ce144d00e8106c28130bb2d44aa5），但任務卡記錄的 git diff --check、瀏覽器導覽及融合／手套／藥水實際功能測試尚未執行。狀態調整為 review，待補測後再判定通過。

## 完工回報

### 改了什麼

### 怎麼驗證的

- GitHub compare：任務分支相對 main 為 ahead 5、behind 0；變更僅含 index.html、config.js、ui/navigation.js 與兩份 Board 文件。
- 靜態檢查：融合機標題、39 種寵物、完整說明文字、工坊頁及兩個分類 panel 各存在一次；融合按鈕、配方清單及藥水清單 ID 均保留；script.js、style.css、ui/navigation.js、config.js、index.html 未找到舊的 page-gloves／page-potions 導覽引用。
- `git diff --check`、瀏覽器實際操作及遊戲內融合／手套／藥水功能測試：未執行，GitHub 檔案 API 無法替代本機工作樹與瀏覽器驗證。

### 沒做／做不到的

### 衍生任務／影響任務
