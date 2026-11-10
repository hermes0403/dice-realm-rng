---
id: T-0051
title: 移除公告頻道重複的全服天氣資料訂閱
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

目前 `systems/weather.js` 已建立專用的 `realm_weather_state` Realtime 訂閱，但 `systems/global-announcements.js` 的公告頻道又重複訂閱同一張表，導致每個瀏覽器重複接收相同資料庫事件。保留專用天氣頻道及公告 broadcast，移除公告頻道的重複資料表訂閱。

## 範圍與禁止

- 只動：`systems/global-announcements.js`、對應 Node 測試、Board 任務紀錄。
- 不要動：`main`、Supabase schema／publication／資料／權限、玩家既有資料、GitHub Pages 部署。
- 保留 rare roll、secret pet、weather_changed、weather_summoned broadcast。
- 不得移除 `systems/weather.js` 的專用天氣訂閱。

## 驗收條件

- [ ] 公告頻道不再訂閱 `realm_weather_state` 的 postgres_changes。
- [ ] 原有公告與天氣 broadcast 事件仍正常註冊。
- [ ] 新增回歸測試確認只有一個天氣資料表訂閱來源。
- [ ] `node --test tests/*.test.js` 與 `git diff --check` 通過。

## 紀錄

- 2026-11-09 14:10 [叉子] 開單；檢查 Realtime 時發現 weather system 與 global announcements 同時監聽 `realm_weather_state`，造成每個玩家重複訂閱。

- 2026-11-09 14:10 [叉子] 已移除公告頻道對 `realm_weather_state` 的重複 postgres_changes 訂閱，保留四種 broadcast；專用天氣 Realtime 仍由 `systems/weather.js` 負責。新增測試 1/1 通過；與本輪登入閘門及倍率服務測試合計隔離 Node 測試 8/8 通過。完整 repository 測試及 GitHub CI 尚未執行，任務維持 in_progress。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務


- 2026-11-10 [叉子] 棒子已實際驗收目前遊戲功能正常；本紀錄不將舊 CI 失敗描述為遊戲目前故障。重新執行 `work/chazi` HEAD `690827f9946a744fb250b7a4041ab89b675fae86` 的 Branch tests（run #135，attempt 2）後，完整測試仍為 79 項中 65 通過、14 失敗；失敗包含測試檔語法錯誤及測試 mock／預期與目前生命週期設計不一致。未修改遊戲程式。由於任務原驗收條件仍要求完整測試通過，狀態暫維持 `in_progress`；待測試套件釐清後再送審，遊戲功能正常的 Owner 驗收結果已另行記錄。
