---
id: T-0136
title: 新增公會成員管理與安全移除功能
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
branch: task/T-0136-guild-member-management
done_by: 棒子
done_at: 2026-11-26
---

## 任務

在公會成員列表加入安全的成員移除功能，讓有管理權限的會長與副會長能移除符合權限範圍的成員，並避免誤操作或繞過前端權限。

## 規則

- 會長可移除副會長、幹部及一般成員，但不可移除自己。
- 副會長可移除幹部及一般成員；不可移除會長、其他副會長或自己。
- 幹部與一般成員只能查看成員列表，不能移除任何人。
- 移除前必須顯示目標玩家名稱並要求確認。
- 移除後重新載入公會資料，成員人數與列表立即更新。
- 沿用既有公會成員刪除 trigger，確保每日登入獎勵等成員異動邏輯仍正常執行。
- 伺服器 RPC 必須再次驗證操作者角色、目標是否同公會及角色階級；不可只靠前端隱藏按鈕。

## 範圍與禁止

- 只動公會成員資料 payload、成員列表移除按鈕、確認流程、移除 RPC、權限與相關測試。
- 客戶端不得直接 DELETE `public.guild_members`；透過受權限保護的 RPC。
- SECURITY DEFINER 必須固定空 search_path，明確限定 schema，並限制執行權限。
- 不新增角色任命／降職、會長轉讓、解散公會或退出公會規則。
- 不修改成員上限、加入申請、公告、XP、每日任務、排行榜或其他玩家資料。
- 不新增高頻輪詢或 Realtime。

## 驗收條件

- [ ] 會長可移除副會長、幹部及一般成員。
- [ ] 副會長只能移除幹部及一般成員。
- [ ] 會長、副會長、幹部、一般成員均不能移除自己。
- [ ] 幹部與一般成員看不到移除操作，且直接呼叫 RPC 也會遭拒。
- [ ] 非同公會目標、已不存在的目標及無權限角色均由伺服器拒絕。
- [ ] 移除前顯示玩家名稱並要求確認；取消確認不會呼叫 RPC。
- [ ] 移除成功後重新載入成員列表及人數。
- [ ] 既有 guild_members DELETE trigger 仍執行，公會每日登入獎勵邏輯無回歸。
- [ ] RLS、RPC grants、交易與單元／回歸測試通過。
- [ ] 不新增輪詢或 Realtime。

## 紀錄

- 2026-11-25 21:41 [叉子] 依棒子要求接續成員管理。最新 main Board 的 owner_side 有效 in_progress 任務為 0/5（目前兩張 in_progress 任務均屬 collaborator_side）；Communicate 優先閘門未發現有效鎖定。現有 role 值已確認為 leader、vice_leader、officer、member，開始檢查成員 payload、刪除 trigger 與權限。
- 2026-11-25 21:46 [叉子] 狀態轉換：in_progress → review。PR #353 已合併至 main，merge commit `d5d2f086b599586d4d82fac8651bf6f717a930ee`；正式 Supabase migration `guild_member_management` 已套用。RPC 交易測試涵蓋會長移除副會長、 副會長移除成員、禁止自我移除、禁止副會長移除會長、跨公會目標拒絕及一般成員拒絕，測試交易已 rollback。正式權限查核確認 guild_members RLS 啟用、anon/authenticated 無直接 DELETE、anon 無 RPC 權限、authenticated 僅能呼叫 public wrapper；既有每日登入 DELETE trigger 仍存在。17 個 GitHub Actions workflows 全數 success；Pages run `45626835730` build、deploy、report-build-status 全部 success。

- 2026-11-26 [棒子] 驗收：棒子於本次對話明確確認先前列出的八項任務「全部我驗收過了 成功」，並確認可繼續進行公會功能；本任務驗收通過。來源：棒子於 2026-11-26 本次對話的明確驗收回覆。證據：本次對話紀錄，使用者明確確認八項任務全部成功。

## 完工回報

### 改了什麼

- `private.guild_get_my_guild()` 僅對 leader／vice_leader 回傳成員 user_id；普通成員取得 null。
- 新增 `private.guild_remove_member(uuid)` 與 authenticated-only public wrapper，伺服器驗證同公會、操作者階級、目標階級及禁止自我移除。
- 成員列表加入依權限顯示的移除按鈕，點擊後顯示玩家名稱並要求確認；成功後重新載入公會資料。
- 更新手機版成員列樣式、PWA 資產版本與 Service Worker cache 至 `dice-realm-shell-v2.26`。
- 新增 `tests/guild-member-management.test.mjs` 並更新 PWA workflow。
- PR #353 已合併，merge commit `d5d2f086b599586d4d82fac8651bf6f717a930ee`。

### 怎麼驗證的

- 正式資料庫查核：guild_members RLS 啟用，anon/authenticated 無直接 DELETE 權限；anon 無 RPC 執行權限，authenticated 可呼叫 public wrapper，不能直接呼叫 private RPC。
- SECURITY DEFINER RPC 使用固定空 search_path。
- 正式資料庫交易測試：leader 可移除 vice_leader；vice_leader 可移除 member；leader／vice_leader 不能移除自己；vice_leader 不能移除 leader；跨公會目標與一般成員操作遭拒。
- 驗證管理者 payload 包含 user_id，普通成員 payload 不暴露 user_id。
- 交易測試已 rollback，未永久移動或移除任何玩家。
- 既有 `guild_members_daily_login_recheck_delete` trigger 仍存在。
- PR head `b10e90d26ee6a2310a827621ccd93000da16a59f` 的 17 個 GitHub Actions workflows 全數 success；PWA display regression tests success。
- GitHub Pages run `45626835730`：build、deploy、report-build-status 全部 success。

### 沒做／做不到的

- 未使用真實玩家帳號進行手機與桌面實機操作；已完成自動化及正式資料庫交易測試，仍待棒子驗收。
- 本任務不包含角色任命／降職、會長轉讓或解散公會。

### 衍生任務／影響任務

- 後續職位管理、會長轉讓及解散公會將另開任務，依序實作。
