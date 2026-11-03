---
id: T-0025
title: 修正管理員成就統計重複分支及鑽石成就顯示
status: review
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-04
updated: 2026-11-04
depends_on: [T-0024]
branch: task/T-0025-admin-achievement-counts
done_by:
done_at:
---

## 任務

修正管理員面板「所有成就獲得人數」沒有正確顯示鑽石手套成就的問題，並確認玩家端雲端成就標記仍存在。盤點統計清單與玩家端現行成就 ID，避免管理員統計漏列或顯示舊名稱。

## 範圍與禁止

- 只動：dice-rng-admin 的 achievement_counts 分支、對應的成就統計定義，以及有 g5 持有狀態與 g5 購買紀錄的玩家 craftVoid 完成標記。
- 不要動：其他玩家資產、藥水庫存、其他成就獎勵、資料庫 schema、其他管理員功能。
- 補回成就時 rewardGiven 必須為 true，避免重複發放獎勵。

## 驗收條件

- [x] 移除重複且先回傳的 achievement_counts 分支，確保正式執行的是現行成就清單。
- [x] 管理員成就清單顯示「鑽石手套」及「糖果手套」，並納入現行 collect28、舊版 collect30 與舊版 rare1。
- [x] 正式 Edge Function 部署後確認版本為 ACTIVE。
- [ ] 依 g5 持有狀態及購買紀錄補回 craftVoid，並確認標記能持續保留。
- [x] 確認其他玩家資產與藥水庫存未被修改。
- [ ] 棒子登入管理員面板確認統計顯示，當事玩家登入後確認成就顯示完成。

## 紀錄

- 2026-11-04 [叉子] 依棒子本次要求檢查管理員成就統計。發現 dice-rng-admin 有兩個同名 achievement_counts 分支；前面的舊分支先 return，導致後面正確的「鑽石手套／糖果手套」清單永遠無法執行。舊分支將 craftVoid 顯示為「虛空」，且只計算 unlockedAt。
- 2026-11-04 [叉子] 已部署修正至 dice-rng-admin，版本 29、狀態 ACTIVE；現在只剩一個 achievement_counts 分支，並新增 collect28 現行成就統計，保留 collect30 舊版資料列。
- 2026-11-04 [叉子] 唯讀複查發現先前補回的 craftVoid 標記已再次不見。重新核對後，唯一 g5 持有者有一筆 item_id=g5 購買紀錄；已只補回該玩家 craftVoid，unlockedAt 使用購買紀錄時間，rewardGiven=true，未發放任何藥水。
- 2026-11-04 [叉子] 更新後立即查詢可讀到 craftVoid，但後續再次唯讀查詢時標記已消失，代表玩家存檔仍可能被其他同步寫入覆蓋；目前不可視為資料修復完成。需先確認 T-0024 前端版本已部署並停止舊版客戶端覆寫，再重新補回並驗證持久性。正式面板與玩家端畫面仍待棒子／當事玩家實際登入驗收；GitHub Pages 部署狀態尚未確認。

- 2026-11-04 [叉子] 盤點全部雲端成就 ID 時另發現一筆未列入管理統計的舊版 rare1；該筆屬管理員本人，且已有現行 rare2048 完成紀錄。已在 dice-rng-admin 加入「舊版稀有發現者」統計列，避免舊版紀錄漏算。Edge Function 已部署為 v30 ACTIVE，achievement_counts 仍只有一個分支。

## 完工回報

### 改了什麼

- Supabase Edge Function dice-rng-admin：移除先回傳的舊版重複 achievement_counts 分支，保留現行成就清單；新增 collect28 統計，舊 collect30 保留為舊版項目。
- Supabase game_saves：曾嘗試為有 g5 持有狀態及 g5 購買紀錄的玩家補回 craftVoid，標記 rewardGiven=true；後續複查發現標記再次消失，尚未完成持久性修復。

### 怎麼驗證的

- get_edge_function：確認版本 29、ACTIVE，且只剩一個 achievement_counts 分支。
- 唯讀 SQL：確認唯一 g5 持有者與一筆購買紀錄；更新後同一查詢曾讀到 craftVoid，但後續查詢又為 null，故持久性驗證未通過。
- 尚未以管理員登入呼叫前端面板，也尚未驗證 GitHub Pages 部署。

### 沒做／做不到的

- craftVoid 標記再次消失，需先確認舊版前端是否持續覆寫雲端存檔，再補回標記並驗證持久性。
- 尚待管理員與當事玩家實際登入確認前端畫面。
- GitHub Pages 部署狀態無法透過目前可用的 GitHub API 讀取端點確認。

### 衍生任務／影響任務

- 依賴 T-0024；T-0024 仍待棒子驗收。
