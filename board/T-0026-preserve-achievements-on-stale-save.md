---
id: T-0026
title: 防止舊版雲端存檔覆蓋永久成就
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P0
created: 2026-11-04
updated: 2026-11-04
depends_on: [T-0024, T-0025]
branch: task/T-0026-preserve-achievements-on-stale-save
done_by:
done_at:
---

## 任務

修復玩家仍開啟舊版遊戲或多個分頁時，整份 game_saves 存檔上傳會覆蓋管理員剛補發的成就。永久成就應採單調合併策略，避免舊快照刪除已解鎖標記；並確保管理員成就統計能讀到保存後的標記。

## 範圍與禁止

- 只動：雲端存檔同步的 achievements 合併、game_saves 成就保留 trigger、對應回歸測試與文件、當事玩家 craftVoid 補正。
- 不要動：其他玩家資產、其他成就資料、藥水庫存、其他存檔欄位、既有寵物出售 trigger、管理員其他功能。
- 成就只允許保留／新增，不透過一般存檔同步刪除既有解鎖。
- 補回 craftVoid 時 rewardGiven=true，不重複發放速度藥水。

## 驗收條件

- [x] 確認根因：舊客戶端每次以完整 save_data upsert，會把缺少 craftVoid 的快照覆蓋至雲端。
- [x] 在正式 game_saves 加入 BEFORE UPDATE trigger，合併 OLD 與 NEW achievements，保留已存在成就。
- [x] 在前端同步前讀取最新雲端 achievements，合併進本次 payload。
- [x] 新增舊客戶端缺少 craftVoid 時仍保留雲端標記的回歸測試。
- [x] 保存 trigger SQL 文件，避免正式資料庫設定只存在於手動操作紀錄。
- [x] 為唯一持有 g5 且有購買紀錄的玩家補回 craftVoid，rewardGiven=true。
- [ ] 以管理員登入確認成就統計列出「鑽石手套」且人數包含當事玩家。
- [ ] 當事玩家重新載入遊戲，確認成就頁顯示完成。
- [ ] 完成 CI 測試、diff check 與正式環境持久性複查。

## 紀錄

- 2026-11-04 [叉子] 查核 Supabase logs 發現當事玩家仍有有效登入 session，且遊戲端持續對 game_saves 執行完整快照 upsert。直接更新 craftVoid 後，舊快照會再次覆蓋，因此先前補發未能持久保存。
- 2026-11-04 [叉子] 正式資料庫已建立 public.preserve_game_save_achievements() 與 trg_preserve_game_save_achievements。trigger 以 OLD achievements || NEW achievements 合併，讓新快照不能刪除已存在的永久成就；未使用 SECURITY DEFINER。
- 2026-11-04 [叉子] 已為當事玩家補回 craftVoid，沿用 g5 購買紀錄時間，rewardGiven=true，未重複發放藥水。獨立 SQL 查詢確認標記仍存在。
- 2026-11-04 [叉子] 已在 task branch 加入前端雲端成就合併、回歸測試與 trigger SQL 文件；尚待 CI 及實際玩家端／管理員面板驗收。

## 完工回報

### 改了什麼

- 正式 Supabase：新增成就保留 trigger，避免舊版／多分頁完整快照覆蓋永久成就。
- services/cloud-save.js：雲端同步前先合併最新伺服器成就。
- tests/cloud-save-pet-authority.test.js：新增舊快照不能移除雲端成就的回歸測試。
- docs/preserve-game-save-achievements.sql：保存正式 trigger 定義。

### 怎麼驗證的

- Supabase SQL：確認 trigger 已掛載於 public.game_saves。
- Supabase SQL：確認當事玩家仍持有 g5，且 craftVoid 已存在、rewardGiven=true。
- GitHub CI 與 diff check：待執行。

### 沒做／做不到的

- 尚未以管理員帳號實際呼叫面板，亦未由當事玩家重新登入驗收。
- GitHub Pages 部署尚未確認；本分支尚未合併至共同基準。

### 衍生任務／影響任務

- 依賴 T-0024、T-0025。
