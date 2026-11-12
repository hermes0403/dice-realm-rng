---
id: T-0052
title: 將全服公告與投票改為即時廣播並降低資料庫輪詢
status: done
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-09
updated: 2026-11-12
depends_on: []
branch: work/chazi
done_by: 棒子
done_at: 2026-11-12
---

## 任務

目前每位登入玩家每 1.5 秒查詢 `realm_admin_messages` 與 `realm_polls`，管理員有進行中的投票時還會重複讀取投票結果。將公告與投票建立／投票結果更新改用 Supabase Realtime Broadcast，連線正常時降低為 60 秒補查；Realtime 中斷時暫時恢復原本 1.5 秒輪詢，確保 3.8 秒公告仍可被接收。

## 範圍與禁止

- 只動：`systems/realm-polls.js`、對應 Node 測試、Board 任務紀錄。
- 不要動：`main)、Supabase schema／publication／資料／權限、玩家既有資料、GitHub Pages 部署。
- 保留公告 3.8 秒顯示、投票時限、每人只能投一次、管理員即時查看票數。
- 不得只把 1.5 秒輪詢直接改成長間隔而導致短公告被漏掉。

## 驗收條件

- [ ] Realtime 正常時，玩家不再每 1.5 秒查詢公告與投票資料；改為 60 秒補查。
- [ ] 管理員公告、投票建立與玩家投票結果透過 Broadcast 即時送達。
- [ ] Realtime 連線中斷時自動回到 1.5 秒 fallback，恢復後再降頻。
- [ ] 投票倒數更新改為每秒一次，保留秒數顯示。
- [ ] 新增回歸測試驗證 Broadcast 註冊與 fallback／healthy interval 切換。
- [ ] `node --test tests/*.test.js` 與 `git diff --check` 通過。

## 紀錄

- 2026-11-09 14:10 [叉子] 開單；確認 realmPollTick 每 1.5 秒至少查兩張表，持續在線單人每日可能產生 57,600 次查詢；管理員投票結果還會額外重讀。採用 Broadcast 保留短公告時效，避免單純降頻造成漏訊息。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務

- 2026-11-12 [棒子驗收] 棒子確認 T-0052 實作成功，正式驗收結案。
