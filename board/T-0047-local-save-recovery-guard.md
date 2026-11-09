---
id: T-0047
title: 保護未同步本機進度避免被舊雲端存檔覆蓋
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-09
updated: 2026-11-09
depends_on: [T-0042]
branch: work/chazi
done_by: 棒子
done_at:
---

## 任務

持久化每位玩家尚未同步的本機進度標記。重新登入或重新載入時，若本機有未同步進度，不得直接套用舊雲端存檔覆蓋本機；若有已知的雲端基準版本，使用既有樂觀版本檢查嘗試同步，遇到版本衝突時保留本機資料。

## 範圍與禁止

- 只處理 cloud-save 本機 dirty marker、恢復與版本衝突保護。
- 不修改 `main`、Supabase schema／資料／權限或 GitHub Pages 部署。
- 不清除或修改玩家既有資料。
- 不在無法確認雲端基準版本時強制覆蓋雲端資料。

## 驗收條件

- [ ] 玩家有未同步進度時，寫入持久化 per-user dirty marker。
- [ ] 雲端載入期間發生本機變更時，不以舊雲端快照覆蓋。
- [ ] 重新載入後偵測 dirty marker，先恢復本機存檔。
- [ ] 已知基準版本時以樂觀版本檢查同步；衝突時保留本機。
- [ ] 新增回歸測試並實際執行。
- [ ] `git diff --check` 通過。

## 紀錄

- 2026-11-09 [叉子] 已修改 services/cloud-save.js：每位玩家新增持久化 dirty marker，保存未同步本機進度及最後確認的雲端版本；save() 在雲端不同步／載入期間或與已同步快照不同時建立 marker；loadCloudSave 偵測 marker 時先恢復本機存檔，不再直接套用雲端快照；有已知基準版本時排程既有版本檢查 RPC，版本衝突則保留本機；沒有基準版本但雲端已有存檔時不自動上傳；無雲端存檔時才允許建立新存檔；成功同步後才清除 marker。另修正同步期間本機再次變更時，lastSyncedPayload 只記錄實際送出的快照，避免誤認未送出的變更已同步。新增 4 項 recovery 測試（dirty reload、無基準且遠端存在、無遠端存檔、載入中本機變更）及 1 項版本衝突測試；測試已寫入 tests/cloud-save-pet-authority.test.js，尚未能在完整 repo 執行。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
