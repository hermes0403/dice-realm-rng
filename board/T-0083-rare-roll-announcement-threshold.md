---
id: T-0083
title: 將全服稀有擲骰公告門檻提高至 1/8192
status: open
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-13
updated: 2026-11-13
depends_on: []
branch: task/T-0083-rare-roll-announcement-threshold
done_by:
done_at:
---

## 任務

調整全服稀有擲骰公告：只有玩家擲出稀有度達到 1/8192 或更稀有（分母 >= 8192）時，才在全服公告區顯示並透過既有 Realtime Broadcast 發送。低於門檻的擲骰不顯示、不廣播，也不寫入稀有擲骰雲端歷史。平常不新增任何輪詢或 PostgREST 查詢。

本任務的「全服稀有擲骰公告」是 `globalAnnouncements`／`rare_roll` 事件；不包含管理員手動公告 `realm_admin_messages`，也不會自動降低該資料表原有的補查頻率。

## 範圍與禁止

- 只動：稀有擲骰公告模組、其呼叫端（若必要）、對應 Node 測試、遊戲版本顯示／快取版本及本任務紀錄。
- 保留既有 Realtime channel；不新增資料表、欄位、RPC、Edge Function、Supabase schema／權限或任何定時輪詢。
- 不改變骰子機率、擲骰流程、玩家收益、管理員手動公告、投票及天氣公告。
- 不把低於 1/8192 的結果寫入 `roll_announcements`；達門檻時保留既有紀錄功能。
- 不直接修改 main；不修改其他任務檔。

## 驗收條件

- [ ] 分母小於 8192 時，不顯示、不廣播、不寫入稀有擲骰歷史。
- [ ] 分母等於 8192 或大於 8192 時，公告玩家名稱、骰子名稱及稀有度，並透過既有 Broadcast 送達全服。
- [ ] 不新增任何固定輪詢、PostgREST 讀取或其他背景查詢。
- [ ] 管理員手動公告、投票、天氣公告與其他既有公告功能不受影響。
- [ ] 新增門檻邊界與 Broadcast payload 測試。
- [ ] `node --test tests/*.test.js` 與 `git diff --check` 通過；遊戲版本每次程式修改遞增 0.01。

## 紀錄

- 2026-11-13 08:15 [叉子] 依棒子「用一用」開單；目標為讓全服稀有掉落公告只在分母達 8192 時觸發，平時不產生公告事件或額外查詢。任務先保持 open，待完成准入檢查及開工 PR 後再實作。
