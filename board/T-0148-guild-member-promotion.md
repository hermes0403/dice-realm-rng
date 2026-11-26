---
id: T-0148
title: 公會晉升成員與設定分類
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-27
updated: 2026-11-27
depends_on: [T-0136, T-0147]
branch: task/T-0148-guild-member-promotion
done_by:
done_at:
---

## 任務目標
將公會職位簡化為隊長、副隊長、普通成員，並將公會設定整理成三個獨立入口。

## 功能範圍
- 公會設定入口分為「公會基本設定」「公會晉升成員」「公會專屬外觀」。
- 基本設定內包含公會名稱、公會介紹、加入方式、公會公告。
- 專屬外觀內包含公會名稱顏色、公會徽章特效、公會專屬背景。
- 隊長可任命普通成員為副隊長，亦可撤除副隊長職位。
- 每個公會最多 2 位副隊長；普通成員不可操作晉升。
- 舊幹部職位資料遷移為普通成員，移除獨立幹部階級。

## 安全與相容性
- 職位變更必須由資料庫 RPC 驗證目前操作者為同公會隊長。
- 不允許修改隊長自身或其他公會成員；不允許透過前端偽造角色。
- 保留既有副隊長可處理申請、公告及管理普通成員的權限；隊長保留最高權限。
- 不改動 XP、升級獎勵、玩家資產及其他遊戲系統。

## 驗收條件
- [x] 三種職位標籤正確，舊幹部資料轉成普通成員。
- [x] 三個設定入口與對應頁面完成，公告整合在基本設定。
- [x] 隊長可任命／撤除副隊長，最多 2 位。
- [x] 伺服器端驗證角色權限及同公會目標。
- [ ] CI 回歸測試全部通過。
- [x] Supabase migration 套用並驗證。
- [x] GitHub Pages 部署成功並確認線上版本。

## 紀錄
- 2026-11-27 叉子：依棒子補充的職位為「隊長／副隊長／普通成員」開始實作；每公會最多 2 位副隊長沿用先前設定。

- 2026-11-27 [叉子] PR #409 已合併（merge commit `c37e74637a748674349c06b1815deca8f25d58e2`）；Supabase migration `guild_member_promotion` 已套用（version `20261126222016`），確認角色限制僅含 leader／vice_leader／member，現有 5 位隊長、9 位普通成員，沒有既有資料遺失。
- 2026-11-27 [叉子] 追加 PR #410 修正私有晉升 RPC 權限，已合併（`274c1546032eae490f20e38c51f1c1fccdaa26ec`）；migration `guild_promotion_rpc_acl_fix` 已套用（version `20261126222331`）。驗證 private RPC 對 authenticated／anon 均不可直接執行；public RPC 僅 authenticated 可執行且使用 SECURITY DEFINER。
- 2026-11-27 [叉子] PWA／公會回歸測試通過，Board lifecycle 通過；GitHub Pages deployment run #45904482359 build、deploy 均成功。完整遊戲回歸仍有既存的寵物管理排序測試失敗（`tests/pet-removal-admin-counts.test.js`），與本任務無關；因此 CI 全部通過項仍保留未勾選，待既有問題另行修正。
