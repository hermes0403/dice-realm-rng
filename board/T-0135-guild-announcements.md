---
id: T-0135
title: 新增公會公告功能
status: review
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-25
updated: 2026-11-25
depends_on: []
branch: task/T-0135-guild-announcements
done_by:
done_at:
---

## 任務

新增公會公告，讓公會成員能在公會首頁看到目前公告，並讓會長與副會長可以在公會設定頁發布、修改或清除公告。

## 規則

- 每個公會只保留一則目前公告，最多 200 字；送出空白內容代表清除公告。
- 公告顯示在公會首頁，所有公會成員都能閱讀。
- 只有會長（leader）與副會長（vice_leader）能發布、修改或清除公告；officer 與 member 僅能閱讀。
- 顯示最後更新時間及發布者名稱；沒有公告時顯示清楚的空狀態。
- 開啟公會首頁時，公告隨既有公會資料一併載入，不增加額外讀取請求。
- 不建立公告歷史紀錄；每次儲存覆蓋目前公告。

## 範圍與禁止

- 只動公會公告資料表、RPC、權限、設定頁表單、公會首頁公告顯示與相關測試。
- 公告資料必須由伺服器端驗證，限制最多 200 字。
- 公告資料表啟用 RLS，不開放客戶端直接 INSERT／UPDATE／DELETE；透過受權限保護的 RPC 修改。
- RPC 使用 SECURITY DEFINER 時必須固定空 search_path，明確限定 schema，並限制執行權限。
- 不修改公會名稱、介紹、加入方式、成員上限、職位管理、申請流程、XP、每日任務或排行榜。
- 不新增高頻輪詢或 Realtime，不增加公會首頁額外資料請求。
- 不修改其他玩家資料、遊戲存檔或貨幣。

## 驗收條件

- [ ] 公會首頁能顯示目前公告、發布者與最後更新時間。
- [ ] 沒有公告時顯示空狀態，不出現 undefined/null。
- [ ] 設定頁能發布、修改及清除公告，最多 200 字。
- [ ] 會長與副會長可操作；officer、member 及非公會成員不可修改。
- [ ] 匿名使用者不能呼叫公告寫入 RPC。
- [ ] 客戶端不能直接寫入公告資料表。
- [ ] 公告隨既有公會資料載入，不新增額外讀取請求、不輪詢、不使用 Realtime。
- [ ] SQL 權限、RLS、RPC 交易及單元／回歸測試通過。
- [ ] 手機與桌面版排版正常，PWA 資產快取版本同步。

## 紀錄

- 2026-11-25 21:35 [叉子] 依棒子要求接續下一項公會功能。owner_side 有效 in_progress 任務盤點為 0/5；T-0132、T-0134 均已轉 review，不計容量；Communicate 優先閘門未發現有效鎖定。先檢查現有角色欄位及公會資料載入方式。
- 2026-11-25 21:40 [叉子] 狀態轉換：in_progress → review。PR #351 已合併至 main，merge commit `498c5d4676b20cb2db6d75660924995923f78fc4`；正式 Supabase migration `guild_announcements` 已套用。公告表 RLS 已啟用，anon 無表讀取／RPC 執行權限，authenticated 無表直接寫入權限；公告寫入 RPC 為 SECURITY DEFINER 且固定空 search_path。交易測試驗證 200 字成功、201 字拒絕、空白清除及非會長／副會長拒絕寫入，測試交易已 rollback。17 個 GitHub Actions workflows 全數 success；Pages run `45625769416` build、deploy、report-build-status 全部 success。

## 完工回報

### 改了什麼

- 新增 `public.guild_announcements`，每個公會只保留一則公告，最多 200 字，保存發布者及更新時間。
- `private.guild_get_my_guild()` 將公告資料隨既有公會資料一併回傳，不增加額外讀取 RPC。
- 新增 `private.guild_update_announcement(text)` 與 authenticated-only public wrapper；僅 leader、vice_leader 可發布、修改及清除。
- 公會首頁顯示公告、發布者、更新時間及空狀態；公會設定頁新增公告編輯欄位。
- 更新 `guild.css`、PWA 資產版本與 Service Worker cache 至 `dice-realm-shell-v2.25`。
- 新增 `tests/guild-announcements.test.mjs` 並更新 PWA workflow。
- PR #351 已合併，merge commit `498c5d4676b20cb2db6d75660924995923f78fc4`。

### 怎麼驗證的

- 正式資料庫確認公告表 RLS 已啟用；anon 無 SELECT 權限，authenticated 無 INSERT／UPDATE／DELETE 權限。
- 正式資料庫確認 anon 不可執行公告 RPC、authenticated 可執行；private RPC 不授權 authenticated 直接呼叫；SECURITY DEFINER 固定空 search_path。
- 交易內 RPC 測試：200 字公告可發布並由 `guild_get_my_guild` 讀回，201 字遭拒，空白內容成功清除，非會長／副會長遭拒；測試交易已 rollback。
- PR head `005f06d41278003f5f0ceebd91a5b66954ccbc86` 的 17 個 GitHub Actions workflows 全數 success，PWA display regression tests success。
- GitHub Pages run `45625769416`：build、deploy、report-build-status 全部 success。
- 公告資料沒有增加獨立讀取請求、輪詢或 Realtime。

### 沒做／做不到的

- 未使用真實玩家帳號進行手機與桌面實機操作；已完成自動化及正式資料庫交易測試，仍待棒子驗收。
- 本版本不保存公告歷史，編輯後會覆蓋目前公告。

### 衍生任務／影響任務

- 後續成員管理、職位管理、會長轉讓與解散公會將另開任務，依序實作。
