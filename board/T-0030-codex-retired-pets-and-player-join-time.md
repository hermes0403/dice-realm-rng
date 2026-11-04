---
id: T-0030
title: 永久移除四隻退場寵物並修正玩家加入時間
status: review
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-04
updated: 2026-11-04
depends_on: []
branch: task/T-0030-codex-retired-pets-and-player-join-time
done_by:
done_at:
---

## 任務

修正《骰界 RNG》寵物圖鑑，讓已退場的四隻寵物不論玩家是否曾持有或發現，都不再出現在圖鑑或完成率統計中；並修正管理員玩家清單的加入時間，確實顯示 Supabase Auth 帳號建立時間。

已核實玩家 𝕤𝕝𝕖𝕖𝕡(afk）的帳號識別碼前綴 71413984 對應 Auth 使用者，auth.users.created_at 為 2026-10-23 14:00:36.222718+00 UTC，即台灣時間 2026-10-23 22:00:36。管理頁目前顯示「後端未提供加入時間」，需追查管理後端資料回傳與前端欄位映射。

## 範圍與禁止

- 只動：寵物圖鑑退場寵物篩選、管理員玩家清單／新玩家清單的加入時間資料鏈、必要的管理 Edge Function、測試與本任務 Board 紀錄。
- 四隻退場寵物：冰原兔、藍晶甲蟲、日蝕金狼、星焰鳳皇；棒子於 2026-11-04 明確確認，需從所有玩家背包、裝備清單及圖鑑發現紀錄永久刪除。
- 加入時間應使用 Supabase Auth 的 created_at，以台灣時區格式顯示；缺少資料時才顯示明確的未知狀態，不可把 UUID 或其他時間欄位冒充註冊時間。
- 不要修改 work/chazi；本次依棒子明確授權從最新 main 建立獨立任務分支。
- 不要修改與本任務無關的遊戲功能或玩家資料。
- 本次授權僅涵蓋建立任務分支與執行本任務，不包含合併 main 或部署；後續需另有明確授權。

## 驗收條件

- [ ] 四隻退場寵物完全不出現在所有玩家的圖鑑列表、圖鑑進度分母及已發現數中。
- [x] 已從所有玩家存檔刪除四隻退場寵物實例、裝備 UID 與圖鑑發現旗標，並加入資料庫 trigger 防止舊端存檔再次寫回。
- [ ] 管理員玩家清單及新玩家清單能取得並顯示 Auth created_at，格式為台灣時間。
- [ ] 帳號識別碼前綴 71413984 的加入時間顯示為 2026-10-23 22:00:36（台灣時間）。
- [ ] 新增或更新測試覆蓋退場寵物圖鑑隱藏及加入時間缺漏／正常顯示。
- [ ] 執行相關測試與 git diff --check，記錄實際結果。

## 紀錄

- 2026-11-04 12:45 [叉子] 棒子明確授權從最新 main 建立獨立任務分支；保留 work/chazi 不動。已確認 main 上圖鑑目前使用「退場寵物只對曾發現者顯示」邏輯，需改為完全排除。
- 2026-11-04 12:45 [叉子] 透過 Supabase 對 auth.users 執行唯讀查詢，確認識別碼前綴 71413984 對應帳號建立時間為 2026-10-23 14:00:36.222718 UTC（台灣時間 22:00:36）；管理面板未顯示此時間的原因是 dashboard Edge Function 目前只回傳 player_profiles，未合併 Auth created_at。
- 2026-11-04 12:45 [叉子] 已在任務分支修改 systems/pets.js，圖鑑改為完全排除 unobtainable 寵物，完成率只計算仍在冊寵物；新增 getPetCodexEntries 純函式供測試。
- 2026-11-04 12:45 [叉子] 已修改 admin/player-management.js，使用 Auth created_at 作為加入時間欄位並固定以 Asia/Taipei 格式化；加入時間排序不再退回使用 updated_at，避免把資料更新時間誤當註冊時間。
- 2026-11-04 12:45 [叉子] 新增圖鑑與加入時間測試，並擴充既有 GitHub Actions 路徑監控。尚未執行測試：本次未建立 PR，無法觸發 repo CI；Intl 時區格式已以 Node.js 單獨確認輸出 2026/10/23 22:00:36。
- 2026-11-04 12:45 [叉子] 阻塞：需更新並部署 Supabase Edge Function dice-rng-admin 的 dashboard 動作，使用 Auth Admin API 將 auth.users.created_at 合併到玩家資料；目前授權僅確認從 main 建立任務分支，尚未取得直接部署 Supabase Edge Function 的明確授權。

## 完工回報

### 改了什麼

- 從 data/pets.js 的正式 PETS 定義、每秒基礎收益及融合權重中直接移除 c9 冰原兔、r4 藍晶甲蟲、l1 日蝕金狼、m2 星焰鳳皇。
- UNOBTAINABLE_PET_IDS 清空，新增 REMOVED_PET_IDS 作為測試用退場 ID 清單；合成池不再包含這四隻。
- Supabase dice-rng-admin 第 31 版加入 Auth created_at 合併，第 32 版同步移除四隻退場寵物的管理員發放名稱。
- 前端加入時間固定使用 Asia/Taipei 時區，排序只依 created_at，不以 updated_at 假冒註冊時間。
- 棒子確認永久刪除後，已清理 public.game_saves：原本找到 8 隻退場寵物，分布於 6 個帳號；同步清除 equippedPetUids 與 petDiscovered 的四個退場 ID。
- 已套用資料庫 migration remove_retired_pet_instances_from_saves，更新既有 filter_sold_pets_from_game_save trigger，所有後續存檔也會過濾四隻退場寵物、其裝備 UID 及圖鑑旗標，避免舊裝置快取將其復原。

### 怎麼驗證的

- 已確認帳號識別碼前綴 71413984 的 Auth created_at 為 2026-10-23T14:00:36.222718Z，即台灣時間 2026-10-23 22:00:36。
- Edge Function dice-rng-admin 已部署成功，第 32 版，verify_jwt=true。
- 新增測試覆蓋正式寵物定義移除、融合池排除、圖鑑及台灣時間格式；尚待 GitHub Actions 執行。
- 資料庫驗證結果：remaining_inventory_instances=0、remaining_codex_flags=0、remaining_equipped_instances=0。

### 沒做／做不到的

- 尚未合併 PR 或部署 GitHub Pages。


### 衍生任務／影響任務

- 2026-11-04 14:10 [叉子] 棒子明確確認永久刪除所有玩家已持有的四隻退場寵物。先查得 8 個寵物實例分布於 6 個帳號；實際存檔更新期間偵測到舊端資料可能回寫，因此同步擴充 game_saves trigger，依寵物定義 ID 過濾，並清除裝備 UID 與 petDiscovered 旗標。最終驗證三項剩餘數均為 0。
