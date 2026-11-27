---
id: T-0162
title: 寵物重量預估獲得機率顯示精度調整
status: review
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-27
updated: 2026-11-27
depends_on: [T-0125]
branch: task/T-0162-pet-weight-odds-display-rounding
done_by:
done_at:
---

## 任務

依棒子指定，將「寵物資訊」頁面六個重量門檻的預估獲得機率顯示值調整為四位小數，僅更改顯示精度，不改動重量生成分布或實際機率。

## 範圍與禁止

- 只動：`index.html` 的六筆顯示文字、對應 `tests/pet-info-page.test.js` 及必要的 Board 紀錄。
- 不要動：寵物重量生成、抽取機率、寵物收益、變異、玩家資料、Supabase、其他遊戲功能。
- 指定顯示值：
  - 1K+ kg：0.2499%
  - 50K+ kg：0.0232%
  - 1M+ kg：0.0093%
  - 25M+ kg：0.0038%
  - 200M+ kg：0.0033%
  - 1B+ kg：0.0009%

## 驗收條件

- [ ] 六筆重量門檻及指定顯示值完全一致。
- [ ] 舊的五位小數字串不再出現在寵物資訊表格。
- [ ] 寵物資訊頁既有其他內容不變。
- [ ] 寵物資訊頁測試與相關回歸測試通過。
- [ ] GitHub Pages 部署成功。
- [ ] 未修改任何實際生成機率或遊戲經濟數值。

## 紀錄

- 2026-11-27 16:25 [叉子] 開工：以 main `abbb65a812f5d6d87cc359bd6a6f99b11a22f60c` 建立獨立分支。Board 索引顯示 owner_side in_progress 任務為 T-0142、T-0146、T-0147、T-0148，共 4/5；新增本任務後仍在容量上限內。僅調整前端表格文字及測試。
- 2026-11-27 16:51 [叉子] 完成：PR #429 已合併，merge commit `a3a12b2b9b4bc3e2b90fc03cd3fac0eafdc7d3f9`；18/18 GitHub Actions checks success。GitHub Pages deployment run `45968609218` build、deploy、report-build-status 全部 success。Service Worker cache 更新為 v2.53。

## 完工回報

### 改了什麼

- 寵物資訊頁六筆顯示值更新為四位小數：1K+ 0.2499%、50K+ 0.0232%、1M+ 0.0093%、25M+ 0.0038%、200M+ 0.0033%、1B+ 0.0009%。
- 更新寵物資訊頁測試與 PWA cache version assertions。
- Service Worker shell cache 升為 v2.53，確保已安裝 PWA 重新取得最新首頁。

### 怎麼驗證的

- PR #429：18/18 checks 全數 success，包含 PWA display、full game regression、pet odds 相關測試及 Board lifecycle。
- Pages run `45968609218`：build、deploy、report-build-status 全部 success。
- 檢查 diff 僅修改顯示文字、測試及 Service Worker cache version；沒有更改寵物重量生成、機率計算、收益或任何玩家資料。

### 沒做／做不到的

- 未在真實手機瀏覽器逐一驗收 PWA 更新畫面；自動化與正式部署均成功。

### 衍生任務／影響任務

- 無

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
