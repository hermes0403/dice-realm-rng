---
id: T-0045
title: Egress 受限時停止遊戲訪問紀錄
status: done
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P0
created: 2026-11-09
updated: 2026-11-09
depends_on: [T-0042]
branch: work/chazi
done_by: 棒子
done_at: 2026-11-09
---

## 任務

當 Supabase 回傳 HTTP 402／Egress restriction 時，停止 game_visit_events 的寫入、五分鐘訪問 heartbeat 與 visibilitychange 觸發紀錄；一般暫時性錯誤仍保留原本訪問追蹤行為。

## 範圍與禁止

- 只處理訪問追蹤的 Egress circuit breaker 與回歸測試。
- 不修改 `main`、Supabase schema／資料／權限或 GitHub Pages 部署。
- 不清除或修改玩家既有資料。
- 使用 T-0042 的共用 cloud restriction state。

## 驗收條件

- [x] Egress blocked 時不再寫入 game_visit_events。
- [x] 停止 visit-tracking 定時器並移除 visibilitychange listener。
- [x] 受限後手動呼叫 recordGameVisit 不發送請求。
- [x] 一般非 402 錯誤不會觸發永久停止。
- [x] 新增回歸測試並實際執行。
- [x] `git diff --check` 通過。

## 紀錄

- 2026-11-09 [叉子] 已修改 services/visit-tracking.js：共用 Egress blocked 狀態下拒絕寫入、停止五分鐘 interval 並移除 visibilitychange listener；自身 insert 遇 402 會標記共用斷路器並立即停止追蹤；一般 503 不會停用追蹤。script.js 已注入 cloud-save 共用狀態。新增 tests/visit-egress-circuit-breaker.test.js；在隔離 Node.js v22.16.0 環境以相同 services/visit-tracking.js 與測試內容執行 node --test，2/2 pass；git diff --cached --check exit code 0。完整分支測試仍因執行環境無法解析 github.com 而未能執行。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務


- 2026-11-09 [棒子] 驗收：GitHub Actions Branch tests（commit 3ab0c024fab13dde3f23d0abb41583dadef1e875）完整測試 58/58 通過，JavaScript syntax check 與 branch whitespace check 通過；本項修改保留在 work/chazi，未部署，main 與玩家資料未修改。