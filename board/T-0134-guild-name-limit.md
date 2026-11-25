---
id: T-0134
title: 將公會名稱限制調整為 2～16 字
status: done
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-25
updated: 2026-11-26
depends_on: []
branch: task/T-0134-guild-name-limit
done_by: 棒子
done_at: 2026-11-26
---

## 任務

將公會名稱長度限制統一調整為 2～16 字，修正目前公會設定與建立流程仍使用 2～24 字的限制，確保畫面提示、前端驗證及資料庫 RPC 一致。

## 範圍與禁止

- 只動公會名稱長度驗證、相關提示文案、必要的資料庫 RPC／migration、測試及 PWA 快取版本。
- 建立公會與修改公會名稱必須採用相同的 2～16 字限制。
- 伺服器端必須再次驗證；不得只依賴 HTML maxlength 或前端 JavaScript。
- 不得自動截斷既有超過 16 字的公會名稱；先盤點正式資料，若存在超長名稱，必須保留原資料並提出相容處理，不得擅自改名。
- 不修改公會介紹、加入方式、成員上限、職位、申請流程、XP、每日任務或排行榜。
- 不新增高頻輪詢或 Realtime，不允許客戶端直接更新 guilds 資料表，不得暴露 service-role key。

## 驗收條件

- [ ] 建立公會與設定頁的名稱提示一致顯示 2～16 字。
- [ ] 前端輸入限制與送出前驗證均為 2～16 字。
- [ ] 建立公會及修改公會名稱的伺服器 RPC 均拒絕少於 2 字或超過 16 字的名稱。
- [ ] 2 字與 16 字名稱可正常建立／修改；17 字名稱會被拒絕且不產生部分更新。
- [ ] 既有超過 16 字名稱已盤點並有安全相容方案，未經 Owner 同意不得改寫既有資料。
- [ ] 權限、RLS、RPC grants 與唯一名稱衝突處理通過測試。
- [ ] 相關單元測試、PWA 回歸測試及 GitHub Actions 通過。
- [ ] 不新增高頻輪詢／Realtime，手機與桌面版無水平溢位。

## 紀錄

- 2026-11-25 21:21 [叉子] 依棒子要求接手任務，狀態 open → in_progress。最新 main Board 為 4ead7981bae817ac8ed9cb4d81ace3b63b2ba7ed；owner_side 有效 in_progress 任務確認為 T-0132，共 1/5，T-0133 為 review 不計容量；Communicate 優先閘門未發現有效鎖定。開始前置程式與資料庫盤點。
- 2026-11-25 21:32 [叉子] 狀態轉換：in_progress → review。PR #348 已合併至 main，merge commit `76fd06ad74e3454802b3a747b54e8130dc81bc08`；正式 Supabase migration `guild_name_limit_16` 已套用，資料盤點超過 16 字名稱為 0，CHECK constraint 與建立／修改 RPC 均確認 2～16 字；交易內測試建立 16 字、修改 2 字及拒絕 17 字成功，測試交易已 rollback。17 個 GitHub Actions workflows 全數 success；Pages run `45624545706` build、deploy、report-build-status 全部 success。

- 2026-11-26 [棒子] 驗收：棒子於本次對話明確確認先前列出的八項任務「全部我驗收過了 成功」，並確認可繼續進行公會功能；本任務驗收通過。來源：棒子於 2026-11-26 本次對話的明確驗收回覆。證據：本次對話紀錄，使用者明確確認八項任務全部成功。

## 完工回報

### 改了什麼

- `ui/guild.js`：建立、設定及搜尋公會名稱輸入上限改為 16 字，加入送出前 Unicode 字元數驗證。
- `docs/migrations/20261125212100_guild_name_limit_16.sql`：將 `public.guilds.guilds_name_length` CHECK constraint 收緊至 2～16 字；同步更新 `private.guild_create` 與 `private.guild_update_settings`，保留 SECURITY DEFINER、空 search_path 及既有權限模型。
- `tests/guild-settings.test.mjs`、`tests/guild-daily-quests.test.mjs`、`tests/pwa-display-controls.test.mjs`：更新名稱限制及 PWA 快取斷言。
- `index.html`、`script.js`、`sw.js`：更新資產版本與 Service Worker cache 至 `dice-realm-shell-v2.24`。
- `.github/workflows/pwa-display-tests.yml`：加入新 migration 的測試觸發路徑。
- PR #348 已合併，merge commit `76fd06ad74e3454802b3a747b54e8130dc81bc08`。

### 怎麼驗證的

- 正式資料庫盤點：超過 16 字的既有公會名稱為 0，沒有改寫任何既有名稱。
- 正式資料庫查核：名稱 CHECK constraint 為 2～16；建立及修改 RPC 均包含 2～16 伺服器端驗證；authenticated 可執行、anon 不可執行。
- 交易內 RPC 測試：建立 16 字名稱成功、修改為 2 字成功、修改 17 字遭拒、建立 17 字遭拒；測試交易已 rollback，未留下測試公會。
- PR head `5ee9ba8c642238294a05a4e2ba5559209474ec15` 的 17 個 GitHub Actions workflows 全數 success；PWA display regression tests success，包含 JavaScript syntax check。
- GitHub Pages run `45624545706`：build、deploy、report-build-status 全部 success。
- Supabase security advisor 仍列出其他既有 RPC 的權限警告；本任務涉及的兩個公會設定 RPC 未出現在 anon 可執行警告中，未擴大修改無關函式。

### 沒做／做不到的

- 未使用真實玩家帳號進行手機與桌面實機操作；已完成自動化測試及正式資料庫交易測試，仍待棒子驗收。
- 未自動截斷或更改既有公會名稱。

### 衍生任務／影響任務

- 後續公會公告、成員管理及職位管理將另開任務，依序實作；本任務未修改這些功能。
