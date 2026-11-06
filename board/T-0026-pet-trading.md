---
id: T-0026
title: 新增玩家寵物交易系統
status: blocked
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-06
updated: 2026-11-06
depends_on: [T-0012]
branch: task/T-0026-pet-trading
done_by: 棒子
done_at:
---

## 任務

在融合機右側新增獨立的寵物交易入口與全新深色科幻介面。玩家可選擇交易對象，發送邀請；對方加入後，雙方各選擇一隻自己擁有的寵物，檢視對方提供的寵物並分別確認。雙方確認後由伺服器原子交換寵物所有權，成功後播放交換動畫並更新雙方背包及圖鑑。

## 範圍與禁止

- 只動：
  - 融合機旁的交易入口、玩家選擇／邀請流程、交易房間 UI、雙方寵物選擇與確認狀態、交易動畫。
  - 必要的 Supabase 交易房間／邀請資料、Realtime 同步、RLS 與伺服器 RPC。
  - 寵物資產鎖定、所有權驗證、交易冪等與相關測試。
- 不要動：
  - 不修改融合機機率、寵物屬性、收益公式或既有寵物圖片。
  - 不允許客戶端直接更新寵物 user_id、直接交換存檔陣列，或以動畫完成作為交易成功依據。
  - 不得在交易未由伺服器確認成功前播放成功動畫或顯示已完成。
  - 不得允許同一隻寵物同時參與多筆交易，或在交易鎖定期間出售、融合、裝備／卸下。
  - 不得改動其他玩家的既有寵物資料作測試；測試資料須可回滾或使用隔離測試帳號。

## 交易規則

- 玩家只能邀請有效玩家，不能邀請自己；對方須明確接受邀請才可進房。
- 每個房間僅兩名玩家；邀請可拒絕、取消或逾時，房間可安全取消。
- 雙方各提供且只能提供一隻目前確實持有、未被出售或其他交易鎖定的寵物。
- 任一方更換寵物或撤回選擇時，雙方確認狀態全部重置。
- 雙方都確認後，伺服器必須重新驗證參與者、寵物 UID、持有權、交易鎖、房間狀態及雙方確認版本，並在單一資料庫交易中完成交換。
- 交易完成採冪等保護；重複點擊、重送請求、斷線重連或併發請求都不能重複交換或複製寵物。
- 成功後雙方重新載入伺服器權威寵物清單、裝備清單與圖鑑；失敗、逾時或取消不得改變任何寵物所有權。
- 離線、離開房間、拒絕或交易失敗時須釋放交易鎖；不可留下永久鎖定。
- 交易成功動畫只在伺服器回傳明確成功後播放。

## 驗收條件

- [ ] 交易入口位於融合機右側，手機與桌面版排版正常，視覺符合骰界深色科幻風格。
- [ ] 可搜尋／選擇玩家、送出邀請、接受／拒絕、取消與處理逾時。
- [ ] 雙方加入同一房間後能即時看到對方、雙方寵物選擇與確認狀態。
- [ ] 任一方更改寵物時，雙方確認狀態同步重置。
- [ ] 後端原子交換兩隻寵物的唯一所有權；資料庫中每個寵物 UID 只能有一位持有人。
- [ ] 交易中寵物不能出售、融合或裝備；取消／失敗／逾時會釋放鎖定。
- [ ] 未授權玩家不能讀寫其他房間；客戶端不能偽造交易對象、寵物 UID、確認狀態或完成結果。
- [ ] 覆蓋重複請求、雙方同時確認、雙裝置、斷線重連、房間取消、逾時及交易失敗測試。
- [ ] 成功後雙方背包與圖鑑更新，只有成功交易才播放完成動畫。
- [ ] 相關測試通過；git diff --check exit 0，記錄實際命令與 exit code。

## 紀錄

- 2026-11-06 10:04 [棒子] 開單，要求在融合機右側新增玩家寵物交易介面與雙方確認後交換寵物的流程。
- 2026-11-06 10:04 [叉子] 已確認目前寵物資產伺服器權威化仍由 T-0012 負責且狀態為 open。交易功能依賴可信寵物 UID／所有權及既有寵物交易契約，先標記 blocked；不得另建互相競爭的寵物資產寫入路徑。解除依賴後再實作交易 UI、Realtime 與原子交換 RPC。
- 2026-11-06 [叉子] 依棒子指示先完成不依賴 T-0012 的介面骨架：在融合機右側新增寵物交易面板、玩家搜尋欄、邀請入口、雙方交易房間／寵物提供欄位及確認區，並加入桌面雙欄、手機堆疊的樣式。所有交易控制目前保持停用，明確標示服務建置中；未新增客戶端資產交換、未修改 Supabase 寵物資料。任務仍維持 blocked，待 T-0012 完成後接續邀請、Realtime、鎖定與原子交換。修改 commit：0a868a9（index.html）、4be8791（style.css）。未執行本機 git diff --check、瀏覽器測試或部署；目前僅確認 GitHub 檔案更新成功。

- 2026-11-06 [叉子] 依棒子指示先不接觸 T-0012，僅推進不涉及寵物資產所有權的前置功能：啟用雲端玩家名稱／UUID 搜尋、排除自己、顯示可選玩家與選擇狀態；交易邀請按鈕仍鎖定，避免在邀請／房間後端尚未建立前製造假邀請。新增獨立搜尋模組並接入頁面。此部分尚未部署或瀏覽器驗收；未修改 T-0012、寵物存檔或 Supabase schema。


- 2026-11-06 [叉子] 依棒子指示繼續實作 T-0026 邀請流程，仍未接觸 T-0012 或任何寵物資產資料。Supabase 新增 pet_trade_invitations，RLS 僅允許邀請雙方讀取；建立邀請與接受／拒絕／取消均由受限 RPC 執行，邀請 2 分鐘逾期、同一對象重複邀請防護、每位發送者 10 分鐘最多 10 次，並加入參與者驗證與狀態鎖。前端已接通送出邀請、邀請收件匣、接受／拒絕／取消及手動重新整理。資料庫 migration 已套用；尚未用隔離帳號完成端到端邀請測試、未接 Realtime、未建立交易房間或交換寵物，未部署網站。GitHub 更新：5890367（邀請 service）、f1c5019（邀請收件匣 UI）、c03ded8（樣式）。GitHub API 更新，不代表已執行本機 git status、git diff --check 或瀏覽器測試。

- 2026-11-06 [叉子] 依棒子指示採用獨立移植方式，不合併 work/chazi。建立 task/T-0026-pet-trading，基於 main HEAD 1e7021c。將交易入口、玩家搜尋／邀請／收件匣 service 與樣式獨立移植至任務分支；未改 main、未碰 T-0012、未修改寵物資產。尚未執行本機 git diff --check、瀏覽器測試或部署；邀請 RPC 依賴先前已套用的 Supabase migration，需在正式版驗證。交易房間及寵物交換仍未完成。

- 2026-11-06 [叉子] 追加安全交易房間前置：Supabase 新增 pet_trade_sessions，僅交易雙方可讀、客戶端不可寫；接受邀請時由 respond_pet_trade_invitation 同一資料庫交易建立 15 分鐘 session，拒絕／取消／逾期不建立房間。前端邀請清單會顯示已建立房間狀態，但不提供寵物資產選擇或交換。未建立 Realtime channel、未實作資產鎖／原子交換（仍依賴 T-0012）；未部署或瀏覽器驗收。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務

- 2026-11-06 [叉子] 追加交易房間安全關閉流程：新增 `cancel_pet_trade_session(uuid)` SECURITY DEFINER RPC，固定 search_path、驗證登入及房間參與者、使用 row lock 防止併發狀態覆寫；參與者可取消有效房間，過期房間可由參與者觸發標記為 expired，其他狀態採冪等回傳。前端已加入「取消交易房間／更新逾期狀態」，並顯示 active、cancelled、expired 等狀態。Supabase migration `add_pet_trade_session_cancellation` 已套用；查核確認 anon 無 EXECUTE、authenticated 有 EXECUTE，session table RLS 開啟，authenticated 僅 SELECT、無 INSERT／UPDATE／DELETE。GitHub commit：`6813595`（service）。靜態檢查確認新增 RPC 呼叫、狀態判斷及括號配對；未執行本機 `git diff --check`、`git status --short`、瀏覽器測試或雙帳號端到端測試。未接 Realtime、未做寵物資產鎖定或交換；T-0012 保持未觸碰，任務仍為 blocked。

- 2026-11-06 [叉子] 安全審查邀請併發時發現反向邀請競態：玩家 A 邀請 B 與 B 同時邀請 A 原本可能因各自只鎖發送者而同時通過 pending 檢查。已新增 migration `serialize_pet_trade_invites_by_player_pair`，以雙方 UUID 排序組成固定 pair key 並取得 transaction advisory lock，確保同一對玩家無論邀請方向都序列化；原有發送者頻率鎖仍保留。已查核正式 Supabase 函式定義含 pair lock，固定 search_path，anon EXECUTE=false、authenticated EXECUTE=true。未建立測試帳號或寫入測試邀請，因此併發行為尚未完成雙帳號端到端驗證。

- 2026-11-06 [叉子] 接上交易邀請與房間狀態的 Supabase Realtime：`pet_trade_invitations`、`pet_trade_sessions` 已加入 `supabase_realtime` publication；前端分別訂閱本人發出／收到的邀請，以及本人可讀取的 active session 更新，事件觸發邀請清單重載，並加入 refresh queue 避免載入中漏掉事件、清理不再需要的 channel。資料表既有 RLS 仍限制邀請雙方／房間參與者讀取，未新增 realtime.messages 廣泛權限或客戶端資產寫入。已查核兩表均列入 publication；靜態檢查確認三類訂閱、user/session filter、佇列及 channel 清理程式存在且括號配對。尚未以雙帳號實際驗證 Realtime 推播與權限隔離；未做寵物選擇、鎖定或交換。

- 2026-11-06 [叉子] 續作交易流程健壯性：前端 auth state listener 改為非同步佇列觸發刷新，避免在 Supabase auth callback 內直接回傳資料庫請求；切換帳號時清除已選交易對象，登出時立即清空邀請顯示並移除 Realtime channels。邀請超過 expires_at 後不再顯示可接受／拒絕／取消按鈕；房間清單增加短房間識別碼與建立時間，無效 expires_at 一律視為逾期，不會誤顯示有效。另新增 `docs/database/pet-trading.sql`，記錄目前邀請／session 表、RLS、索引、RPC、EXECUTE 權限及 Realtime publication 的可重建基準；該檔刻意放在 docs 而非禁止 push 的 `supabase/` 目錄，且標示為文件基準，不會由前端自動執行。GitHub commits：`a2718f0`、`6d01971`、`dad7f94`、`6fa0981`。靜態檢查確認 auth 清理、逾期按鈕抑制、Realtime 清理及括號配對；未執行本機 git diff --check／git status、瀏覽器與雙帳號端到端測試。尚未處理寵物資產權威化、鎖定、確認及交換；T-0012 未觸碰，T-0026 仍 blocked。

- 2026-11-06 [叉子] 完成這輪 Supabase 權限複查：`pet_trade_invitations`、`pet_trade_sessions` 均啟用 RLS；anon 無 SELECT，authenticated 僅有 SELECT，沒有 INSERT／UPDATE／DELETE。三個交易 RPC 均為 SECURITY DEFINER、固定 `search_path=pg_catalog, public, auth`，anon EXECUTE=false、authenticated EXECUTE=true。兩張表均確認在 `supabase_realtime` publication。GitHub 分支相較 main 為 ahead 18、behind 0；目前分支仍未合併／部署。前端靜態檢查確認發出邀請、收到邀請、active session 三類 Realtime filter，登出清理、過期邀請按鈕抑制、房間期限檢查及括號配對。上述是靜態與資料庫 ACL 查核，並非雙帳號／瀏覽器端到端驗收；本機 `git diff --check`、`git status --short` 未執行。

- 2026-11-06 [叉子] 進行交易邀請 UI／狀態處理複查並修正兩項問題：選取搜尋結果後原本會把其他搜尋候選項目整批清掉，現在保留完整結果並標示已選玩家；接受邀請後若 session 查詢失敗，原本會靜默當成「沒有房間」，現在會明確進入載入錯誤處理，避免顯示不完整狀態。另調整邀請卡片為可換行排列，避免房間資訊與多個操作按鈕擠在同一列。GitHub commits：`e6b181b`、`a8714ac`。未執行本機 git diff --check、git status、瀏覽器或雙帳號端到端測試；未碰 T-0012、未涉及寵物資產所有權，未部署，T-0026 維持 blocked。

- 2026-11-06 [叉子] 檢查正式 Supabase 邀請回應 RPC 時發現 `p_action = NULL` 會因 SQL 三值邏輯未觸發原本的 `NOT IN` 驗證，發件者可能因此把邀請意外轉成 cancelled。已在正式資料庫函式加上 `p_action IS NULL OR ...` 防護，並同步更新 `docs/database/pet-trading.sql` 基準。驗證查詢確認 null guard 存在、anon EXECUTE=false、authenticated EXECUTE=true、仍為 SECURITY DEFINER，固定 search_path 未變。沒有建立邀請或修改玩家資料；未接觸 T-0012，未部署，T-0026 維持 blocked。GitHub commit：`038eca0`。

- 2026-11-06 [叉子] 追加玩家搜尋輸入與識別資訊保護：搜尋名稱會先移除 PostgREST／ILIKE 特殊字元，並以清理後的有效字元數重新檢查最短長度，避免只輸入萬用字元就擴大成非預期搜尋；結果卡片不再顯示完整 auth UUID，改顯示前 8 碼玩家代碼。GitHub commit：`7ec3371`。未修改玩家資料，未碰 T-0012，未部署；T-0026 維持 blocked。

- 2026-11-06 [叉子] 玩家搜尋查詢再縮減資料欄位：`player_profiles` 搜尋原本一併讀取未使用的 `last_seen`，已移除，只查詢顯示及發送邀請所需的 `user_id, username`。複查目前 `player_profiles` SELECT policy 為公開可讀，因此交易搜尋只取必要欄位，避免不必要讀取上線時間資料。GitHub commit：`0448519`。未修改玩家資料或 profile RLS；未碰 T-0012，未部署。
