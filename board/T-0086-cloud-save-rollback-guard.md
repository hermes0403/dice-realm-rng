---
id: T-0086
title: 修復雲端存檔回滾與多分頁舊資料覆蓋
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P0
created: 2026-11-14
updated: 2026-11-14
depends_on: []
branch: task/T-0086-cloud-save-rollback-guard
done_by:
done_at:
---

## 任務

修復玩家購買手套、擴充背包後，部分帳號重新進入遊戲時金錢、手套及背包容量一起回到舊狀態的雲端存檔回滾問題。將前端完整覆寫 game_saves 的路徑改為既有的版本檢查差異同步 RPC，避免舊分頁／裝置以舊快照覆蓋較新的雲端存檔，同時保留現有本機新資料保護、寵物權威資料及骰子鎖定保存。

## 範圍與禁止

- 只動：雲端存檔服務、必要的存檔回歸測試、既有差異同步 RPC 的欄位白名單、對應 migration 文件、模組快取版本與本任務 Board 紀錄。
- 不要動：骰子機率、經濟數值、遊戲玩法、寵物交易邏輯、presence／Realtime 輪詢、其他協作者分支或 work/chazi。
- 不直接覆寫或重置 work/chazi；只從目前 main 建立本任務分支。
- 保持雲端批次同步 5 分鐘；本機存檔仍即時寫入；登出強制 flush；離頁備份仍 best-effort。
- 不新增高頻 Supabase 查詢，不新增整份存檔 upsert。
- 每次程式修改，遊戲版本遞增 0.01。

## 驗收條件

- [ ] 雲端寫入使用 sync_player_game_save_delta，傳送僅有變動的頂層欄位及預期 updated_at。
- [ ] 多分頁／裝置版本衝突時不會將舊快照直接覆蓋雲端；載入流程保留現有本機新資料保護。
- [ ] RPC 允許並保存 lockedDice，保留骰子鎖定功能。
- [ ] 購買手套、擴充背包後，gloves、equipped、bagCapacity、coins 等變更均包含在差異同步。
- [ ] 沒有資料變更時不發出 game_saves 寫入；雲端同步仍維持 5 分鐘批次。
- [ ] 登出前 flush 成功才登出；失敗時保留本機資料。
- [ ] 新增／更新測試覆蓋差異同步、版本衝突、較新本機存檔、寵物權威清單及 lockedDice。
- [ ] 完整 Node 測試、語法與差異檢查通過；GitHub Pages build/deploy 成功。
- [ ] 遊戲版本由 V1.19 更新至 V1.20。

## 紀錄

- 2026-11-14 00:33 [叉子] 狀態由 open 轉為 in_progress：Owner side 有效 in_progress／review 任務 2/5（T-0084、T-0085），Communicate 優先閘門未觸發；開單 PR #94 已合併至 main，開始移植既有 T-0040 差異同步修補。
- 2026-11-14 00:32 [叉子] 依棒子本次明確指示，將既有 T-0040 差異同步方案移植到目前 main 的獨立修補任務；開工前 owner_side 有效 in_progress／review 任務 2/5（T-0084、T-0085），未發現指派給叉子且 open／in_progress 的 communicate task，兩道啟動閘門未阻擋。分支從 main HEAD `53a51642aa878c1af23b81e5c8fa4002dd945ab3` 建立，不修改 work/chazi。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
