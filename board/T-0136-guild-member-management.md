---
id: T-0136
title: 新增公會成員管理與安全移除功能
status: in_progress
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-25
updated: 2026-11-25
depends_on: []
branch: task/T-0136-guild-member-management
done_by:
done_at:
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

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
