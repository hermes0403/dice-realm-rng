---
id: T-0044
title: Egress 受限時中止 Realtime WebSocket 重連
status: in_progress
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
done_at:
---

## 任務

當任何雲端請求確認 Supabase HTTP 402／Egress restriction 時，停止 Supabase Realtime WebSocket 自動重連，並避免 weather／global boost 的 Realtime error callback 再觸發讀取請求。一般暫時性斷線仍保留原有 fallback 行為。

## 範圍與禁止

- 只處理 Egress circuit breaker 與 Realtime channel 的停止／防重連行為及測試。
- 不修改 `main`、Supabase schema／資料／權限或 GitHub Pages 部署。
- 不清除或修改玩家資料。
- 使用 T-0042 的共用 cloud restriction state。

## 驗收條件

- [ ] 進入 Egress blocked 狀態時，Realtime client disconnect 被呼叫。
- [ ] Weather／global boost 在 blocked 狀態不再建立 Realtime channel 或觸發 fallback query。
- [ ] Realtime error callback 不會在 blocked 狀態再次讀取雲端。
- [ ] 一般非 402 的 channel error 仍可使用既有 fallback。
- [ ] 新增回歸測試並實際執行。
- [ ] `git diff --check` 通過。

## 紀錄

- 2026-11-09 [叉子] 已修改 services/cloud-save.js：首次確認 Egress restriction 時呼叫 supabaseClient.realtime.disconnect()，並清除 weather-refresh／global-boost-refresh 定時器；修改 systems/weather.js 與 systems/global-boost.js，在受限時不建立 channel、不執行 fallback query，且 Realtime error callback 會辨識 402 並觸發共用斷路器；script.js 已注入共用狀態。新增 tests/realtime-egress-circuit-breaker.test.js，涵蓋 global boost 巢狀 cause 402 斷線及 weather blocked guard。依 Supabase 最新 JavaScript 文件確認 subscribe callback 可接收 status／err，Realtime disconnect 為非同步方法；依 realtime-js 近期 changelog 核對 API 版本資訊，並讓 disconnect rejection 被 catch。所有修改檔均已重新 fetch 確認 SHA／內容；完整測試尚待執行。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
