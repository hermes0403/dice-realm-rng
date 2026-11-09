---
id: T-0052
title: 將全服公告與投票改為即時廣播並降低資料庫輪詢
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-09
updated: 2026-11-09
depends_on: []
branch: work/chazi
done_by: 棒子
done_at:
---

## 任務

目前每位登入玩家每 1.5 秒查詢 `realm_admin_messages` 與 `realm_polls`。單人每天約有 57,600 個輪詢週期，每週期至少兩次資料表查詢，即約 115,200 次資料庫請求；管理員投票結果還會額外重讀。將公告與投票建立／投票結果更新改用 Supabase Realtime Broadcast，連線正常時降低為 60 秒補查；Realtime 中斷時暫時恢復原本 1.5 秒輪詢，確保 3.8 秒公告仍可被接收。

## 範圍與禁止

- 只動：`systems/realm-polls.js`、`services/auth.js`、`script.js`、對應 Node 測試、Board 任務紀錄。
- 不要動：`main`、Supabase schema／publication／資料／權限、玩家既有資料、GitHub Pages 部署。
- 保留公告 3.8 秒顯示、投票時限、每人只能投一次、管理員即時查看票數。
- 不得只把 1.5 秒輪詢直接改成長間隔而導致短公告被漏掉。

## 驗收條件

- [ ] Realtime 正常時，玩家不再每 1.5 秒查詢公告與投票資料；改為 60 秒補查。
- [ ] 管理員公告、投票建立與玩家投票結果透過 Broadcast 即時送達。
- [ ] Realtime 連線中斷時自動回到 1.5 秒 fallback，恢復後再降頻。
- [ ] 投票倒數更新改為每秒一次，保留秒數顯示。
- [ ] Egress 受限時停止輪詢、廣播及投票資料讀取；登入存檔初始化成功前不啟動輪詢。
- [ ] 新增回歸測試驗證 Broadcast 註冊與 fallback／healthy interval 切換。
- [ ] `node --test tests/*.test.js` 與 `git diff --check` 通過。

## 紀錄

- 2026-11-09 14:10 [叉子] 開單；確認 realmPollTick 每 1.5 秒至少查兩張表，持續在線單人每日約有 57,600 個輪詢週期、至少 115,200 次資料庫請求；管理員投票結果還會額外重讀。採用 Broadcast 保留短公告時效，避免單純降頻造成漏訊息。
- 2026-11-09 14:10 [叉子] 已改用 `dice-realm-polls-live` Broadcast 傳送管理員公告、投票建立及投票更新；Realtime 正常時每 60 秒補查，連線異常時 1.5 秒 fallback，資料查詢一般錯誤則 30 秒退避。投票倒數由 250ms 改為 1 秒。加入登入初始化閘門：雲端存檔完成前不啟動輪詢，登出停止計時器，402 受限時停止訂閱／輪詢／資料查詢。新增測試 2 項；目前隔離 Node 測試共 10/10 通過。完整 repository 測試與 GitHub CI 尚未執行，任務維持 in_progress。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
