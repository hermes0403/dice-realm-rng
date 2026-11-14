---
id: T-0067
title: 統計卡片恢復低色差底色與框線
status: review
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-12
updated: 2026-11-14
depends_on: [T-0066]
branch: task/T-0067-stat-cards-match-background
done_by:
done_at:
---

## 任務

恢復「累積擲骰」、「已發現骰子」、「額外運氣」及其他統計區塊的卡片底色與框線，讓統計資訊重新有清楚但低色差的區隔。

## 範圍與禁止

- 僅調整所有 `.stat` 統計卡片的底色、邊框及陰影。
- 卡片底色比翡翠綠頁面背景稍亮，保留細緻綠色邊框及輕微陰影。
- 保留既有文字顏色與可讀性。
- 不改變卡片尺寸、間距、排列、位置、文字、按鈕、功能或遊戲邏輯。
- 不新增外部資源或網路請求。

## 驗收條件

- [x] 所有統計卡片恢復低色差底色、可辨識細邊框與輕微陰影。
- [ ] 數字與標籤在實際手機及桌面畫面均清楚可讀（待棒子實際畫面驗收）。
- [x] 不改動一般功能按鈕、版面尺寸或遊戲功能。
- [x] 本次 PR 相關 CI 全數通過。
- [x] GitHub Pages 部署成功。

## 完工回報

- 修改檔案：`style.css`、`index.html`、`sw.js`、`tests/pwa-display-controls.test.mjs`。
- 程式提交：`ebbeccc7ae85efe43c16b835e9efc53ce855645f`；交付 PR #103 已合併，merge commit：`7a1e66a5edd510f6a7f3a10530bb04b82c343454`。
- 遊戲版本更新至 V1.24，CSS cache key 與 Service Worker cache name 同步更新。
- CI：PWA display、Admin navigation、Dice roll save、Cloud save rollback、Pet removal/admin counts、Pet backpack/auto-sell、Heaven Potion odds、Coin boost 均成功。
- Pages 部署：workflow #43546673915 成功。
- 未完成：尚未取得棒子手機及桌面實際畫面驗收；因此任務維持 review，不標記 done。

## 紀錄

- 2026-11-12 [叉子] 棒子指出前次誤調一般操作按鈕；本任務改為針對統計數值卡片。
- 2026-11-14 10:31 [叉子] 依棒子最新指示恢復全站統計卡片低色差底色、細邊框及輕微陰影；不改動尺寸、排列、按鈕或遊戲邏輯。PR #103 合併及 Pages 部署成功，等待棒子實際畫面驗收。
