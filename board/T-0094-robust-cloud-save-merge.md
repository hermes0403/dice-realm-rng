---
id: T-0094
title: 強化多分頁／多裝置存檔衝突合併與防止玩家進度倒退
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P0
created: 2026-11-14
updated: 2026-11-14
depends_on: [T-0086]
branch: task/T-0094-robust-cloud-save-merge
done_by:
done_at:
---

## 任務

修復 T-0086 上線後仍可能發生的存檔回滾：目前前端以本機保存時間或擲骰總數判斷本機快照是否較新，可能將舊分頁／舊裝置的完整舊狀態誤判為較新，並在版本衝突後重新寫回雲端。需建立可驗證的基準快照與衝突合併策略，優先保護玩家擲骰成果、背包、首次發現與最佳紀錄，避免以單一總擲骰數或本機時鐘決定整份存檔勝負。

## 範圍與禁止

- 只修改：雲端存檔服務、presence profile 寫入路徑、存檔衝突／生命週期／擲骰存檔回歸測試、必要的 Supabase 寫入權限與保護函式、必要的 SQL 變更紀錄、前端版本與 PWA 快取版本、必要的 Board 紀錄。
- 不修改：骰子機率、經濟數值、道具配方、遊戲玩法、presence／Realtime 輪詢頻率、其他玩家正式存檔資料。
- 不新增每次擲骰的 Supabase 請求；維持本機即時保存與既有 5 分鐘雲端批次。
- 遊戲存檔與玩家統計不得再由客戶端直接整列 INSERT／UPDATE；改由已驗證的 RPC 寫入，presence 只能更新 last_seen／updated_at。
- 不以客戶端時間戳或總擲骰數單獨判定整份本機快照較新。
- 必須保留寵物交易／出售的伺服器權威資料，避免衝突合併復活已出售寵物；交易型貨幣、藥水、手套及道具欄位不得盲目相加造成重複發放。
- 合併策略必須以可比較的共同基準快照計算雙方變更；對無共同基準的舊版本機資料採明確且安全的相容策略，不能將不可信舊快照直接覆蓋雲端。
- 版本衝突時，必須保留尚未成功同步的本機進度，合併後再以最新雲端版本鎖同步；若無法安全合併，停止覆寫、保留本機副本並明確提示玩家。
- 不直接覆寫 main、work/chazi 或其他任務分支；從最新 main 建立本任務分支。
- 每次程式修改，遊戲版本遞增 0.01。

## 驗收條件

- [ ] 本機保存可追蹤其所依據的雲端版本與共同基準快照；重新登入及版本衝突時可執行三方差異合併。
- [ ] 移除「本機時間較晚」或「本機 rolls 較大」即可直接讓整份本機存檔勝出的不安全判斷。
- [ ] 兩個分頁／裝置各自擲骰後發生版本衝突，合併後不遺失 bag、rollCounts、rolls、first、best 的有效變更。
- [ ] bag 的增加與減少都能依共同基準計算差異；不會因簡單 max／union 復活已出售或已消耗的骰子。
- [ ] first 保留最早有效發現時間；best 保留最高稀有度紀錄。
- [ ] 寵物清單及伺服器交易欄位仍採權威資料策略，不因合併復活已出售寵物或重複發放金錢／道具。
- [ ] 舊版本機資料缺少基準快照時採安全降級；無法判定的本機變更不覆蓋雲端，並保留可恢復資料及提示。
- [ ] 版本衝突重試不會無限迴圈、不會丟棄待同步變更；多次衝突後仍能安全收斂。
- [ ] game_saves 的客戶端直接 INSERT／UPDATE 被 RLS／權限阻擋；purchase_glove 已改由驗證 auth.uid 的 SECURITY DEFINER RPC 安全執行。
- [ ] player_profiles 不允許客戶端直接 INSERT／UPDATE 統計欄位；presence 專用 RPC 只更新 last_seen／updated_at。
- [ ] 玩家統計的 unique_dice、rarest_den、achievement_count、achievement_reached_at 及存檔累積 rollCounts／first／best 不會被較舊資料降低。
- [ ] 本機存檔仍即時；雲端仍 5 分鐘批次；不增加每次擲骰網路請求。
- [ ] 新增自動化測試覆蓋雙裝置衝突、相同骰子併發增加、背包出售／消耗與擲骰併發、雲端交易更新、本機時鐘偏差、缺少基準快照及重複衝突。
- [ ] Node 測試、語法檢查及差異檢查通過；Supabase 權限／RPC／trigger 查核通過；GitHub Pages build/deploy 成功。
- [ ] 遊戲版本與 PWA cache 版本同步遞增 0.01。

## 紀錄

- 2026-11-14 [叉子] 開單前依最新 main Board 核對：owner_side 有效 in_progress 任務為 T-0085、T-0092、T-0093，共 3/5；T-0086、T-0089 為 review，不計入容量。最新 main Board 未發現 communicate task 檔案，Communicate 優先閘門未觸發。依棒子本次明確要求建立 P0 後續修補任務；本階段只開單，尚未開始實作。
- 2026-11-14 [叉子] 開單 PR #156 已合併至 main（merge commit `f3bb4647a0cc4cbd23e694ed0fb282d49a230fe2`）。任務分支原先僅落後 main 1 個 merge commit，已以非強制 fast-forward 更新至該 main HEAD。開工前重新核對容量仍為 3/5；未發現 communicate task，兩道閘門均未阻擋，任務轉為 in_progress。
