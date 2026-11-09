---
id: T-0043
title: Egress 受限時停止玩家心跳請求
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

當 Supabase 回傳 HTTP 402／Egress restriction 時，立即停止玩家 presence heartbeat 的後續雲端請求與 30 秒定時器；本機遊戲狀態不受影響。一般網路錯誤不應永久停用 heartbeat。

## 範圍與禁止

- 只處理玩家 heartbeat 的 Egress circuit breaker 與回歸測試。
- 不修改 `main`、Supabase schema／資料／權限或 GitHub Pages 部署。
- 不清除或修改玩家既有資料。
- T-0042 的 cloud-save circuit breaker 作為共同限制狀態來源。

## 驗收條件

- [x] heartbeat 發生 HTTP 402／Egress restriction 後，標記共用雲端受限狀態。
- [x] 停止 `presence-heartbeat` 定時器。
- [x] 後續 heartbeat 呼叫不再發出 Supabase 請求。
- [x] 一般非 402 錯誤不會觸發永久停止。
- [x] 新增回歸測試並實際執行。
- [x] `git diff --check` 通過。

## 紀錄

- 2026-11-09 [叉子] 接續 T-0042；檢查發現 script.js 的 30 秒 heartbeat 在雲端受限後仍會持續呼叫 player_profiles。已修改 services/cloud-save.js 暴露共用受限狀態與標記函式、services/presence.js 在 402 後清除 presence-heartbeat timer 並拒絕後續請求、script.js 注入共用閘門；新增 tests/presence-egress-failure.test.js（涵蓋 402 與一般 503）。逐檔寫入後均重新 fetch，SHA 與內容確認成功。已在隔離的 Node.js v22.16.0 測試目錄，以與 GitHub 版本逐字相同的 services/presence.js 和 tests/presence-egress-failure.test.js 執行 node --test：2/2 pass；同一隔離目錄執行 git diff --cached --check，exit code 0。因執行環境無法解析 github.com，尚未能 clone 完整分支執行 node --test tests/*.test.js；完整 repo 測試仍待驗證。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務


- 2026-11-09 [棒子] 驗收：GitHub Actions Branch tests（commit 3ab0c024fab13dde3f23d0abb41583dadef1e875）完整測試 58/58 通過，JavaScript syntax check 與 branch whitespace check 通過；本項修改保留在 work/chazi，未部署，main 與玩家資料未修改。