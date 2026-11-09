---
id: T-0040
title: 降低 game_saves 雲端存檔傳輸量並保留完整存檔行為
status: review
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-09
updated: 2026-11-09
depends_on: []
branch: task/T-0040-game-save-delta-sync-impl
done_by:
done_at:
---

## 任務

降低 Dice Realm 的 game_saves 雲端存檔上傳量與無效請求。現行存檔集中在 save_data JSONB，每次同步會傳送整份 payload；玩家登入載入後也可能在無變更時再上傳。必須在保留既有存檔相容性、版本衝突保護、玩家資產權威性與離線保護的前提下，實作安全的差異同步。

## 範圍與禁止

- 只修改雲端存檔服務、對應 Supabase RPC migration／SQL 文件、必要測試與本任務 Board 紀錄。
- 新增經驗證的 JSONB 局部合併 RPC；不得直接以普通 upsert 繞過既有 sync_player_game_save 版本鎖與 profile projection 保護。
- 本機即時保存、5 分鐘雲端備份、手動登出強制同步、離頁 best-effort 同步及失敗保留本機資料必須維持。
- 無資料變更時不得呼叫存檔寫入 RPC；有變更時只傳送變更欄位／區塊，伺服器端原子合併到既有 save_data。
- 登入載入只建立同步基準；只有首次建立雲端存檔、待處理管理員發放實際改變資料，或其他已確認的本機差異，才執行必要上傳。
- 必須保留寵物雲端權威性、售出寵物不可被舊本機資料復活、rolls 不回退、coins/profile projection 一致、成就與獎勵不遺失。
- 不得清空、重置、批次改寫或刪除任何玩家資料；不得改動玩家既有存檔格式的讀取相容性。
- 不得把 service-role key 或任何秘密放入前端。
- 若正式 Supabase 目前受 Egress 限制而無法完成部署或線上驗證，需如實標示，不能宣稱已部署。

## 驗收條件

- [ ] 雲端存檔內容未變時，定時備份、重複 save()、登入載入後均不產生 game_saves 寫入請求。
- [ ] 變更單一欄位／區塊時，前端只傳送該差異，RPC 在交易內合併至現有 JSONB，其他欄位完整保留。
- [ ] 多個欄位同時變更時可正確合併；同一欄位為陣列／物件時採完整欄位替換，避免錯誤深層合併資產資料。
- [ ] RPC 驗證 auth.uid()、參數型別、欄位白名單、資料大小／型別、rolls／coins 合法性；固定 search_path，撤銷 public／anon 權限，只授權 authenticated。
- [ ] RPC 保留 updated_at 樂觀鎖；版本衝突不得覆蓋新存檔，應走既有重新載入／重試流程。
- [ ] 更新存檔後 profile projection 與原有 rolls／coins 保護仍一致；不得因差異同步繞過現有 trigger。
- [ ] 管理員發放、寵物出售／融合／交易、成就、藥水、背包、骰子、手套、任務、天氣與收益等存檔欄位均能被正確保存。
- [ ] 離線、請求失敗、切換帳號、兩個分頁同時修改、頁面離開等情況不會清空本機資料或把 A 玩家資料寫入 B 玩家。
- [ ] 新增／更新 mock 測試涵蓋無變更跳過、單區塊差異、多區塊差異、併發衝突、既有寵物權威性及失敗重試。
- [ ] 執行全部既有測試與新增測試；記錄實際指令及結果。正式 Supabase migration／RPC 必須部署後以真實 authenticated 測試帳號驗證；未部署不得標示通過。

## 預計檢查檔案

- services/cloud-save.js
- docs/ 內 game_saves RPC／版本鎖 SQL 文件
- tests/ 內雲端存檔、寵物權威性與同步生命週期測試
- 必要的 Board 任務索引

## 紀錄

- 2026-11-09 [叉子] 依棒子本次指示建立任務；owner_side 開工容量盤點為 4/5（T-0034、T-0035、T-0037、T-0039），未發現進行中的 owner_side communicate task，兩道啟動閘門均未阻擋。
- 2026-11-09 [叉子] 狀態由 open 轉為 in_progress；已確認 work/chazi 相對 main ahead 115、behind 160，故以 work/chazi HEAD 建立獨立任務分支，不將分歧分支合併到 main。
- 2026-11-09 [叉子] 已部署 Supabase `sync_player_game_save_delta` RPC；以交易內 rollback 測試確認只更新 coins 時，bag、pets、achievements、rolls 均保留，測試資料已 rollback。
- 2026-11-09 [叉子] GitHub Actions 完整 repository 回歸測試通過：`node --test tests/*.test.js`，34/34 pass、0 fail（run #7）。
- 2026-11-09 [叉子] Supabase migration `game_save_delta_sync` 與欄位別名修正已套用；rollback transaction 測試確認 bag、pets、achievements、rolls、coins 保留，交易已 rollback；ACL 確認僅 authenticated 可執行，anon／PUBLIC 不可執行。
- 2026-11-09 [叉子] 狀態由 in_progress 轉為 review，交棒子驗收。程式目前保留在任務分支，尚未整合回 work/chazi、未建立 PR、未合併 main、未部署 GitHub Pages。

## 完工回報

### 改了什麼

- `services/cloud-save.js`：加入穩定欄位差異比對；無變更不呼叫存檔 RPC；變更時只傳變更的頂層欄位；5 分鐘雲端批次備份；保留手動強制 flush、離頁 best-effort 備份及失敗重試；依帳號隔離同步基準。
- `services/account-actions.js`、`script.js`：個人資料登出前必須先完成雲端 flush，失敗時保留本機資料並阻止登出。
- `docs/game-save-delta-sync.sql`：新增原子 JSONB 差異合併 RPC 文件；正式 Supabase 已套用 migration。
- `tests/`、`.github/workflows/game-save-delta-sync-tests.yml`：新增差異同步、登出 flush 及完整回歸測試。

### 怎麼驗證的

- GitHub Actions run #7：執行 `node --test tests/*.test.js`，34 tests、34 pass、0 fail。
- Supabase rollback transaction：呼叫新 RPC 後確認 bag、pets、achievements、rolls、coins 均未被未變更欄位覆蓋；交易已 rollback，未保留測試資料修改。
- Supabase ACL 查核：authenticated 可執行；anon 與 PUBLIC 不可執行。
- 已確認既有 game_saves trigger 仍存在，寵物售出 tombstone、成就保留與 rolls 防回退邏輯未被移除。

### 沒做／做不到的

- 前端程式尚未整合回 `work/chazi`，也未合併 `main` 或部署 GitHub Pages；目前不會在玩家遊戲頁面生效。
- 尚未以真實玩家瀏覽器完成登入、擲骰、合成、交易、登出全流程人工驗收；34 項自動化測試及資料庫 rollback 測試不能取代正式頁面驗收。
- 尚未取得更新後的 Egress 實際用量，不能宣稱已測得節省百分比。

### 衍生任務／影響任務

- 無。
