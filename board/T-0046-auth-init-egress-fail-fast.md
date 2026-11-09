---
id: T-0046
title: 登入初始化遇 Egress 受限時立即中止後續雲端讀取
status: in_progress
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
done_at:
---

## 任務

登入初始化流程中的任一雲端讀取遇到 HTTP 402／Egress restriction 後，立即啟動共用斷路器並停止後續寵物融合機率、玩家心跳、排行榜、天氣召喚資料等雲端讀取。一般暫時性錯誤仍保留既有功能。

## 範圍與禁止

- 只處理登入初始化 fail-fast 與相關讀取服務的 blocked guard。
- 不修改 `main`、Supabase schema／資料／權限或 GitHub Pages 部署。
- 不清除或修改玩家既有資料。
- 使用 T-0042 共用 Egress 狀態。

## 驗收條件

- [ ] 寵物融合機率讀取遇 402 會標記共用斷路器。
- [ ] 排行榜與天氣召喚資料遇 402 會標記共用斷路器。
- [ ] 登入初始化每完成一個雲端步驟都檢查 blocked 狀態。
- [ ] 任一步驟受限後不再呼叫後續雲端初始化。
- [ ] 新增回歸測試並實際執行。
- [ ] `git diff --check` 通過。

## 紀錄

- 2026-11-09 [叉子] 已修改 admin/pet-odds.js、systems/leaderboards.js、systems/weather.js：各讀取服務在 blocked 時不再查詢，遇 402 會標記共用斷路器；修改 services/auth.js，新增可獨立測試的 runCloudSessionInitialization，依序執行 pet odds → heartbeat → leaderboard → weather，每一步後檢查 blocked，失敗即中止；script.js 已注入共用狀態。新增 tests/auth-init-egress-fail-fast.test.js。在隔離 Node.js v22.16.0 測試目錄，以相同 helper 與測試內容執行 node --test：3/3 pass；git diff --cached --check exit code 0。完整分支測試仍因執行環境無法解析 github.com 而未能執行。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
