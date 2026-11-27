---
id: T-0163
title: 調整公會 Lv.2～Lv.20 升級獎勵藥水配置
status: review
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-27
updated: 2026-11-27
depends_on: [T-0141]
branch: task/T-0163-guild-level-reward-potion-rebalance
done_by:
done_at:
---

## 任務

依棒子指定，調整公會升級時的藥水獎勵。只修改 Lv.2、3、4、5、7、8、12、16 的獎勵內容與數量；其餘等級維持現行設定。

## 範圍與禁止

- 只動：公會升級獎勵後端函式、對應 Supabase migration、獎勵回歸測試及 Board 紀錄。
- 不要動：公會 XP 門檻、既有公會等級、既有獎勵事件、已發放藥水、其他等級獎勵及其他遊戲系統。
- 不追溯修改已建立的獎勵事件或已發放的玩家藥水；新設定只套用在 migration 生效後新觸發的升級獎勵。

## 指定獎勵

- Lv.2：幸運藥水 I ×1
- Lv.3：幸運藥水 II ×1
- Lv.4：幸運藥水 III ×1
- Lv.5：速度藥水 II ×1
- Lv.7：幸運藥水 III ×2
- Lv.8：天堂藥水 I ×1
- Lv.12：速度藥水 II ×5
- Lv.16：幸運藥水 III ×5

## 驗收條件

- [x] 後端函式的八級獎勵名稱、reward_key、數量與指定完全一致。
- [x] 其他等級獎勵、XP 門檻及 XP 加成計算不變。
- [x] 藥水數量依 v_reward_amount 寫入玩家庫存，郵箱獎勵文字與實際數量一致。
- [x] 回歸測試通過：PR #431 的 8/8 GitHub Actions checks 全數成功。
- [x] 正式 Supabase 函式已更新並經 SQL 回讀驗證。
- [x] 不追溯變更既有獎勵事件與玩家庫存。

## 紀錄

- 2026-11-27 19:53 [叉子] 依棒子明確指定建立任務。已更新正式 Supabase `private.add_guild_xp(uuid,bigint)`，並回讀函式確認八級獎勵設定。既有獎勵事件與庫存不追溯修改；GitHub migration、測試及 Board 紀錄待交付。
- 2026-11-27 19:59 [叉子] PR #431 已合併，merge commit `da4bb4d6e39635005ac5240c535f612f5880bc65`；8/8 checks 全數成功。GitHub Pages run `45994791389` 的 build、deploy、report-build-status 全部 success。正式 Supabase migration 已套用並回讀確認。

## 完工回報

### 改了什麼

- 更新 Lv.3、4、5、7、8、12、16 的指定藥水與數量；Lv.2 維持幸運藥水 I ×1。
- 正式 Supabase 函式、版本化 migration、獎勵回歸測試及 Board 任務紀錄同步更新。
- 舊公會獎勵事件、郵箱紀錄與已發放庫存均保留，不追溯重算。

### 怎麼驗證的

- SQL 回讀 `private.add_guild_xp(uuid,bigint)`，確認八級獎勵 key、文字與數量。
- PR #431：8/8 GitHub Actions checks 全數 success。
- Pages run `45994791389`：build、deploy、report-build-status 全部 success。

### 沒做／做不到的

- 未對真實公會進行升級實際發放測試；以 SQL 函式回讀與完整自動化回歸測試驗證，避免修改正式玩家資料。

### 衍生任務／影響任務
