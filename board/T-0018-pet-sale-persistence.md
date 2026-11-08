---
id: T-0018
title: 修復寵物出售後重新登入可能復原
status: done
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-03
updated: 2026-11-09
depends_on: []
branch: work/chazi
done_by: 棒子
done_at: 2026-11-09
---

## 任務

調查並修復玩家出售寵物後，退出遊戲並經過一段時間重新登入，已出售寵物可能重新出現在持有清單的問題。使用者表示曾遇過約兩次，目前尚未確認是否可穩定重現。此問題可能涉及雲端存檔競態、舊資料回寫、交易成功後的同步時序或多端狀態覆蓋。

## 範圍與禁止

- 只動：寵物出售流程、寵物持有資料的同步／載入／儲存路徑，以及必要的回歸測試。
- 不要動：其他玩家資產、既有存檔資料、無關的寵物收益或融合規則。
- 先追查目前寵物出售是否已採伺服器權威交易；若與 T-0012 或其他後端任務重疊，先記錄 impact 與責任邊界，不得另建互相衝突的資產寫入路徑。
- 不得以清空玩家存檔或重置資料作為修復方式。

## 驗收條件

- [ ] 找出可能造成出售寵物復原的實際程式路徑，附上檔案／函式及原因分析。
- [ ] 出售成功後，伺服器權威持有資料不再包含該寵物；重新載入不得從舊快照復原。
- [ ] 覆蓋出售後立即登出、延遲重新登入、重新整理及重複請求等情境。
- [ ] 測試確認貨幣只增加一次，寵物只出售一次，重複請求不會重複付款。
- [ ] 不影響其他寵物、裝備寵物及收益計算；完成相關自動化測試與瀏覽器回歸。
- [ ] 若無法重現，提供可驗證的競態分析與防護測試，不得宣稱已重現。

## 紀錄

- 2026-11-03 [叉子] 已依棒子授權，選擇性整合至 `integrate/chazi-t0018-t0020`，提交 PR 送棒子 review；此狀態為送審，不代表已部署或驗收。

<!-- 只增不改。格式：- YYYY-MM-DD HH:MM [作者] 內容 -->
- 2026-11-03 [叉子] 接手於 work/chazi。確認根因是 loadCloudSave 將本機舊寵物與雲端寵物合併；已加入伺服器原子出售 RPC、售出 UID 防復原紀錄與雲端寵物權威載入，正在完成回歸測試。
- 2026-11-03 [叉子] 完成 Supabase 交易與前端接線：sell_owned_pets 以 user_id 鎖定自己的 game_saves，依寵物定義 ID 對應品質計價，讀取目前有效的全服／個人金錢倍率，原子更新寵物、裝備清單及貨幣；pet_sale_tombstones 與 game_saves trigger 阻止舊分頁／舊快照重新寫回已售 UID。
- 2026-11-03 [叉子] 回歸驗證：Supabase rollback-only SQL 測試結果 first_sale_count=1、second_sale_count=0、first_payout=expected_payout=10000、stale_snapshot_restored=false；V8 執行實際 cloud-save.js 的測試確認本機舊寵物不會合併回雲端清單；V8 執行實際 pet-selling.js 的測試確認登入出售會呼叫 RPC、快速連點只送出一次請求，並套用伺服器回傳的寵物與貨幣狀態。SQL 測試全程 rollback，未保留測試玩家資料變更。
- 2026-11-03 [叉子] 尚未完成：未部署 work/chazi 至 GitHub Pages，故未執行真實瀏覽器的立即登出、延遲登入及重新整理回歸；也無法執行本機 git diff --check／Node test runner（執行環境無法連線 GitHub 取得 clone）。目前不合併、不部署，等待後續瀏覽器驗證。

## 完工回報

### 改了什麼

- `services/cloud-save.js`：登入時以雲端寵物清單為權威，不再把本機舊寵物合併回雲端。
- `ui/pet-selling.js`：登入玩家出售寵物改走 `sell_owned_pets` RPC，防止快速連點重複交易，並採用伺服器回傳的寵物、裝備及貨幣狀態。
- `docs/pet-sale-persistence.sql`：提供原子出售 RPC、售出 UID tombstone 與舊快照防回寫 trigger 的 SQL 草案。
- `tests/cloud-save-pet-authority.test.js`：新增雲端寵物權威載入與出售流程測試。

### 怎麼驗證的

- Supabase rollback-only SQL 測試紀錄：首次出售數量 1、第二次 0、付款 10000 與預期一致、舊快照未能復原已售寵物；測試全程 rollback。
- V8 執行實際 `cloud-save.js`／`pet-selling.js` 的測試：本機舊寵物不合併回雲端、登入出售呼叫 RPC、快速連點只送出一次請求、套用伺服器回傳狀態。
- 以上為工作分支已記錄的測試證據；本次整合分支未重新執行 Node test runner 或瀏覽器測試。

### 沒做／做不到的

- 尚未將 `docs/pet-sale-persistence.sql` 部署至 Supabase；正式環境 RPC、trigger、RLS／grants 尚待棒子確認與部署驗證。登入玩家在 SQL 部署前無法完成雲端出售交易。
- 尚未執行真實瀏覽器立即登出、延遲登入及重新整理回歸，也未部署 GitHub Pages。
- `git diff --check` 與 Node test runner 未在本次整合環境執行。

### 衍生任務／影響任務

- 影響 T-0012：本任務只處理出售交易及寵物清單防復原；其餘寵物資產、技能與被動收益權威化仍由 T-0012 負責。

 
## 補充驗收紀錄

- 2026-11-04 16:00 [叉子] 重新查核 Supabase 正式專案：migration `20261103060728 pet_sale_persistence_and_idempotency` 與 `20261103060918 fix_pet_sale_rarity_lookup` 均已存在；`public.sell_owned_pets(text[])`、`public.pet_sale_tombstones` 及 `trg_filter_sold_pets_from_game_save` 均存在。RPC 僅授權 authenticated／service_role，anon 無法執行；trigger function 僅 postgres／service_role 可執行，tombstone 表已啟用 RLS 且未授予 anon／authenticated 存取。
- 2026-11-04 16:00 [叉子] PR #2 已合併至 main（`2ff19db25266f32c4f8a67a4232e4d9826e170cd`），GitHub Pages 部署 run `41604124888` success。先前 rollback-only SQL 與 V8 測試紀錄仍可作為交易冪等及舊快照防復原證據；正式資料庫物件已再次確認。
- 2026-11-04 16:00 [叉子] 尚缺真實玩家瀏覽器的立即登出、延遲登入及重新整理回歸；未以真實玩家資料執行出售測試，因此維持 review，不宣稱完整驗收。
- 2026-11-05 [叉子] 棒子以正式玩家帳號出售一隻「灰狼幼崽」（普通、14 kg、10$/秒）作實機驗收；玩家確認出售後寵物從背包消失、重新整理後未復原、登出並重新登入後仍未復原，且金錢已正常增加。此測試確認實際出售、刷新、重新登入及付款結果；未進行同一 UID 的手動重複請求測試，重複請求防重仍以既有 rollback-only SQL 與 V8 自動化測試為證。因延遲登入時間間隔未獨立量測，狀態維持 review，待其他驗收條件一併確認。

- 2026-11-09 [棒子] 使用者明確確認此任務先前已由其完成實際驗收，並指示直接驗收成功；本任務依 reviewer 的人工驗收確認結案。未實際執行的自動化測試或額外測量仍以既有紀錄為準，不另行宣稱已執行。
