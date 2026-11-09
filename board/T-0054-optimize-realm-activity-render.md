---
id: T-0054
title: 避免全服活動倒數每秒重建整個 DOM
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-09
updated: 2026-11-09
depends_on: []
branch: work/chazi
done_by: 棒子
done_at:
---

## 任務

`renderRealmActivity` 每秒執行一次，當全服活動存在時每秒重新設定整個活動面板的 `innerHTML`，反覆銷毀及建立卡片節點。改為只有活動內容變動時重建卡片，倒數每秒只更新對應文字節點。

## 範圍與禁止

- 只動：`systems/global-boost.js`、對應 Node 測試、Board 任務紀錄。
- 不要動：`main)、Supabase schema／資料／權限、玩家既有資料、GitHub Pages 部署。
- 保留活動卡片內容、點擊事件、秒數倒數及活動切換顯示。

## 驗收條件

- [ ] 活動內容未變時不重建整個活動面板。
- [ ] 倒數文字仍每秒更新。
- [ ] 活動倍率、結束時間或活動類型變動時會正確重建卡片。
- [ ] 新增回歸測試驗證 DOM 重建次數與倒數更新。
- [ ] `node --test tests/*.test.js` 與 `git diff --check` 通過。

## 紀錄

- 2026-11-09 14:10 [叉子] 開單；發現全服活動卡片每秒重新寫入整個 `innerHTML`，屬於可避免的 DOM churn。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
