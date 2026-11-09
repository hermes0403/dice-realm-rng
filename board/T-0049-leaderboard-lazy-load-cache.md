---
id: T-0049
title: 排行榜改為開啟時載入並加入快取
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-09
updated: 2026-11-09
depends_on: [T-0042, T-0046]
branch: work/chazi
done_by: 棒子
done_at:
---

## 任務

取消遊戲啟動與雲端存檔載入時的重複排行榜查詢，改由玩家開啟排行榜頁面時載入；加入 in-flight 去重與短期快取，避免連續切頁反覆讀取。

## 範圍與禁止

- 只處理排行榜讀取時機、去重、快取與回歸測試。
- 不修改 `main`、Supabase schema／資料／權限或 GitHub Pages 部署。
- 不清除或修改玩家既有資料。
- 管理員明確要求強制刷新時仍保留 force refresh 能力。

## 驗收條件

- [ ] 移除 app startup 的排行榜讀取。
- [ ] 移除登入初始化與 cloud-save load 的重複排行榜讀取。
- [ ] 開啟排行榜頁面時才讀取。
- [ ] 同時請求合併，30 秒快取內不重複讀取。
- [ ] Egress blocked 時不發送排行榜查詢。
- [ ] 新增回歸測試並實際執行。
- [ ] `git diff --check` 通過。

## 紀錄

- 2026-11-09 [叉子] 盤點發現排行榜在 app startup、cloud-save load、auth initialization、使用者開啟排行榜頁面等多個位置重複觸發；navigation.js 已有 leaderboard page 的 on-open refresh，可作為唯一正常讀取入口。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
