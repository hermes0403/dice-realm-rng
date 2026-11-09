---
id: T-0055
title: 將全服天氣與公告 Realtime 延後至登入初始化完成
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-09
updated: 2026-11-09
depends_on: [T-0042]
branch: work/chazi
done_by: 棒子
done_at:
---

## 任務

目前頁面載入時就建立全服公告與全服天氣 Realtime 頻道，且天氣 5 分鐘補查計時器在未登入時仍可能查詢公開天氣資料。遊戲需要登入才能進行擲骰與存檔，應延後到雲端存檔及登入初始化成功後才建立全服頻道，登出時解除訂閱；保留登入後天氣即時更新與補查。

## 範圍與禁止

- 只動：`systems/weather.js`、`systems/global-announcements.js`、`services/auth.js`、`script.js`、對應 Node 測試、Board 任務紀錄。
- 不要動：`main)、Supabase schema／publication／資料／權限、玩家既有資料、GitHub Pages 部署。
- 保留登入後全服天氣、稀有擲骰、秘密寵物及管理員公告即時事件。
- 不可在雲端服務受限時嘗試重新連線。

## 驗收條件

- [ ] 未登入時不建立全服公告與全服天氣 Realtime 頻道。
- [ ] 雲端存檔與登入初始化成功後才建立頻道及初始天氣讀取。
- [ ] 登出時解除全服公告、天氣與個人天氣訂閱。
- [ ] 402／Egress 受限時不重新建立頻道或發送補查。
- [ ] 新增回歸測試驗證登入前不連線、登入後連線、登出解除。
- [ ] `node --test tests/*.test.js` 與 `git diff --check` 通過。

## 紀錄

- 2026-11-09 14:10 [叉子] 開單；確認全服公告與全服天氣 Realtime 在頁面載入時即建立，未登入訪客也會佔用 WebSocket 頻道；天氣補查計時器也在登入前啟動。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
