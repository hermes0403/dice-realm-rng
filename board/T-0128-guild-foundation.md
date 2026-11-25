---
id: T-0128
title: 建立公會基礎系統
status: in_progress
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-25
updated: 2026-11-25
depends_on: []
branch: task/T-0128-guild-foundation
done_by:
done_at:
---

## 任務

為《骰界 RNG》建立公會系統的第一階段基礎。玩家可建立公會、搜尋公會、申請加入、由有權限的幹部處理申請、查看基本成員資料及退出公會。公會資料與成員職位必須由伺服器權威管理，避免客戶端偽造或越權修改。

## 範圍與禁止

- 只動：
  - 公會及成員資料表、必要索引、RLS、RPC 與相關 migration。
  - 建立公會、搜尋公會、申請加入、核准／拒絕申請、退出公會所需的最小前端介面與服務模組。
  - 公會成員基本資料與職位欄位：會長、副會長、幹部、一般成員。
  - 相關權限、併發、重複請求及資料完整性測試。
- 基本規則：
  - 每個玩家同一時間最多加入一個公會。
  - 建立公會者自動成為會長；一個公會只能有一位會長。
  - 職位上限：會長 1 位、副會長最多 2 位、幹部最多 3 位。
  - 玩家不可自行修改公會 ID、成員身分或職位；所有加入、退出及職位變更都必須由伺服器驗證。
  - 搜尋結果只顯示公會公開資訊，不暴露成員私密資料或帳號識別資訊。
  - 申請、核准、拒絕及退出操作必須具備交易原子性與冪等保護，避免重複加入或產生孤兒資料。
  - 優先採用使用者開啟公會頁時才載入的方式；不得新增高頻輪詢或不必要的 Realtime 訂閱。
- 不要動：
  - 不修改既有玩家帳號、存檔、骰子、寵物、貨幣、成就及排行榜資料。
  - 不加入公會每日任務、等級／經驗、獎勵或公會排行榜（後續階段處理）。
  - 不在本階段加入邀請連結、邀請碼管理、完整公會設定、轉讓會長或解散公會（後續階段處理）。
  - 不修改其他遊戲系統或既有權限。
  - 不把 service-role key 或其他秘密放進前端。

## 委派資訊

- 關聯原任務：
- 原需求方：
- 接收方：

## 驗收條件

- [x] 已登入玩家可成功建立公會，建立者自動成為唯一會長。
- [x] 玩家可搜尋公會並查看公開資訊。
- [x] 玩家可申請加入；有權限的公會幹部可核准或拒絕，未授權成員無法處理申請。
- [x] 玩家同一時間最多加入一個公會；重複申請、重複核准及併發加入不會產生重複成員。
- [x] 玩家可退出公會；會長退出前必須先完成會長轉讓或解散流程，避免留下無會長公會。
- [x] 會長、副會長、幹部、一般成員的職位資料正確，職位人數上限由伺服器強制執行。
- [x] RLS、RPC EXECUTE 權限及伺服器端權限檢查通過；anon 不可讀寫私人公會資料，玩家不能修改他人職位。
- [ ] 不會讀取或修改其他玩家的遊戲資產；不新增高頻資料庫請求。
- [x] Migration、權限查核、專項測試及相關回歸測試通過，記錄實際命令及 exit code。
- [ ] 手機與桌面版操作正常；未執行的真實瀏覽器／雙帳號驗證須明確標示。

## 紀錄

- 2026-11-25 20:24 [叉子] T-0128 交付 PR #336 已以 merge commit `3a0f23c59a3db137f27b7230b72fba23dcd2c8cc` 合併至 main；PWA display regression、Board lifecycle validation、Cloud save rollback、Coin boost regression 四項 PR workflow 均 success。任務實作與證據已同步到 main；狀態維持 in_progress，等待棒子正式驗收及桌面版操作確認。

- 2026-11-25 20:20 [叉子] T-0128 正式資料庫交易測試先發現一項權限漏洞：未加入公會的登入玩家因 `v_role` 為 NULL，舊判斷 `v_role NOT IN (...)` 不會進入拒絕分支，竟可審核申請。已以 migration `20261125121831_guild_review_application_null_role_guard` 修正為明確拒絕 `v_role IS NULL`，正式 Supabase migration history 已記錄。修正後以明確 `BEGIN ... ROLLBACK` 執行 15 項行為測試，全部 PASS；測試涵蓋未登入拒絕、建立會長、重複建立、搜尋公開欄位、重複申請、未授權審核、核准／拒絕、重複核准、會長退出限制、副會長／幹部人數上限、公會 4 人上限、單一公會唯一成員及公開公會直接加入。測試使用暫存交易資料，已回滾，未留下測試公會或成員。安全權限唯讀查核亦確認 6 張公會資料表啟用 RLS、anon/authenticated 無直接 CRUD、anon 無公會 RPC EXECUTE、職位及總人數 trigger 存在。另以兩個同時 Supabase SQL 連線平行執行建立公會與公開公會加入競態測試，各自觀察到一筆成功、一筆 `already_in_guild`，並立即刪除唯一測試公會；確認資料庫只保留一份成員關係。棒子先前確認手機雙帳號的建立／加入／成員顯示／退出流程已實測；桌面實機尚未由本工作環境獨立驗證。

- 2026-11-25 [叉子] 修正先前 5 項 PWA 回歸測試失敗：將 HTML script/style 版本斷言更新為目前實際載入版本，Service Worker 快取殼升至 v2.14，並同步預快取目前 script.js、ui/guild.js、style.css、guild.css。GitHub Actions run 45511969931 成功：11 個既有語法檢查步驟全部成功，回歸測試 72/72 通過、0 失敗（其中原先 5 項失敗已通過）。另新增 docs/migrations/20261124221835_guild_foundation.sql，依 2026-11-25 正式 Supabase 的表欄位、constraints、indexes、RLS、role-limit trigger、private/public RPC 定義與 grants 反向整理，補回版本 20261124221835 的來源追蹤；此為來源檔補登，未重新套用正式資料庫。檔案依既有 docs/migrations 慣例放置，未觸碰禁止推送的 supabase/。CI run 發生於 migration 來源檔補登之前，SQL 尚未由獨立資料庫測試環境執行；正式環境僅完成唯讀結構比對。

- 2026-11-25 06:57 [叉子] 已完成公會前端第一階段串接：script.js 匯入並建立 createGuildSystem，導航切換時才載入公會資料；搜尋結果依 join_mode 顯示直接加入／申請加入，操作提示依 RPC 回傳區分；會長退出按鈕停用並提示需先轉讓或解散。Supabase 正式環境 guild_foundation migration（版本 20261124221835）已存在，三張公會表均啟用 RLS；查核 public RPC 僅 authenticated 可執行、anon 不可執行，三張資料表對 anon／authenticated 均無直接 CRUD 權限。GitHub Actions 在 commit e52a889 的既有擲骰回歸工作中，script.js 語法檢查通過；整體測試 72 項中 67 項通過、5 項失敗，失敗集中於既有 PWA 版本字串斷言（仍期待舊 script/style/cache 版本），與公會模組無直接關聯。尚未完成真實登入雙帳號瀏覽器驗證；ui/guild.js 尚未納入自動語法檢查。正式 migration 原始檔未納入分支（AGENTS.md 禁止推送 supabase/ 目錄），需另行處理來源追蹤；尚未建立 PR、合併 main 或部署 GitHub Pages。

- 2026-11-25 叉子：PR #321 已合併，六項棒子已驗收任務完成歸檔。重新依 main 最新 Board 檢查 §15.3：owner_side 有效 in_progress 任務為 0 張；collaborator_side 的 T-0002、T-0038 不屬本方容量。搜尋 Board 任務與紀錄未發現有效 Communicate 優先鎖。兩道閘門均未阻擋，將 T-0128 轉為 in_progress，建立任務分支 task/T-0128-guild-foundation。
- 2026-11-25 叉子：依棒子「公會基礎系統開始吧」建立第一階段任務。開工前盤點發現 owner_side 目前仍有 6 張有效 in_progress 任務（T-0026、T-0114、T-0117、T-0119、T-0126、T-0127），達到 Board §15.3 的五單上限；本任務先保持 open，不建立任務分支、不修改程式或 Supabase。須待既有任務狀態依正式驗收紀錄更新後，重新檢查容量與 Communicate 優先閘門，再轉為 in_progress。

## 完工回報

### 改了什麼

- 正式 Supabase migration：`20261125121831_guild_review_application_null_role_guard`，修正沒有公會職位的登入玩家可通過申請審核權限檢查的漏洞。
- `docs/migrations/20261125201831_guild_review_application_null_role_guard.sql`：保存正式 migration 原始碼。
- `tests/sql/guild-foundation-behavior.sql`：新增可回滾的正式資料庫行為測試。
- `tests/guild-foundation-authorization.test.mjs`：新增權限修正的靜態回歸測試。
- 本任務文件：補上正式資料庫檢查、行為測試及競態測試結果。

### 怎麼驗證的

- 正式 Supabase 專案 `pkdctcfifauygnjipmab`：RLS／grants／RPC EXECUTE／trigger 唯讀檢查通過；6 張公會相關資料表均啟用 RLS，anon/authenticated 無直接 CRUD，anon 無公會 RPC EXECUTE。
- 以明確 `BEGIN ... ROLLBACK` 執行資料庫行為測試，15/15 PASS；測試資料已回滾。
- 兩組平行 SQL session 競態測試：同一玩家同時建立公會，以及同一玩家同時加入公開公會，均為 1 次成功、1 次 `already_in_guild`；臨時公會已刪除，確認無殘留。
- Supabase migration history 顯示版本 `20261125121831` 已套用。
- GitHub Actions 與本次 PR 的自動化測試結果待交付 PR 執行後補記。

### 沒做／做不到的

- 尚未完成桌面實機瀏覽器操作驗證；手機雙帳號操作由棒子確認通過。
- T-0128 尚待棒子依完整證據作最終驗收；目前不自行標記 done。

### 衍生任務／影響任務

- T-0129 介面已由棒子確認手機雙帳號操作通過；T-0131 公會排行榜仍依賴 T-0128、T-0129 正式完成。
