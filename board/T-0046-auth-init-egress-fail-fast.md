---
id: T-0046
title: 登入初始化遇 Egress 受限時立即中止後續雲端讀取
status: done
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-09
updated: 2026-11-09
depends_on: [T-0042, T-0043, T-0044, T-0045]
branch: work/chazi
done_by: 棒子
done_at: 2026-11-09
---

## 任務

登入初始化流程中的任一雲端讀取遇到 HTTP 402／Egress restriction 後，立即啟動共用斷路器並停止後續寵物融合機率、玩家心跳、排行榜、天氣召喚資料等雲端讀取。一般暫時性錯誤仍保留既有功能。

## 範圍與禁止

- 只處理登入初始化 fail-fast 與相關讀取服務的 blocked guard。
- 不修改 `main`、Supabase schema／資料／權限或 GitHub Pages 部署。
- 不清除或修改玩家既有資料。
- 使用 T-0042 共用 Egress 狀態。

## 驗收條件

- [x] 寵物融合機率讀取遇 402 會標記共用斷路器。
- [x] 排行榜與天氣召喚資料遇 402 會標記共用斷路器。
- [x] 登入初始化每完成一個雲端步驟都檢查 blocked 狀態。
- [x] 任一步驟受限後不再呼叫後續雲端初始化。
- [x] 新增回歸測試並實際執行。
- [x] `git diff --check` 通過。

## 紀錄

- 2026-11-09 [叉子] 後續 T-0049 將排行榜改為玩家開啟排行榜頁面時才讀取，因此登入初始化流程已調整為 pet odds → heartbeat → weather summon data，並在每一步後檢查 Egress blocked。排行榜不再於登入時預載；其 402 標記仍由 leaderboard service 自行處理。更新 auth 初始化測試，隔離 Node.js v22.16.0 3/3 pass。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務


- 2026-11-09 [棒子] 驗收：GitHub Actions Branch tests（commit 3ab0c024fab13dde3f23d0abb41583dadef1e875）完整測試 58/58 通過，JavaScript syntax check 與 branch whitespace check 通過；本項修改保留在 work/chazi，未部署，main 與玩家資料未修改。