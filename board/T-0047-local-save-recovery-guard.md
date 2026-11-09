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

- 2026-11-09 [叉子] 開始處理第五項；目前 loadCloudSave 會先讀 localSaveBeforeCloud，再無條件將 cloud save 套入 state，僅保留少數欄位，可能覆蓋離線期間的新進度。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
