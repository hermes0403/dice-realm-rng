---
id: T-0107
title: 修正玩家名稱註冊錯誤訊息顯示
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-20
updated: 2026-11-20
depends_on: []
branch: task/T-0107-username-signup-error-messages
done_by:
done_at:
---

## 任務

修正玩家使用「玩家名稱＋密碼」註冊或登入時，Edge Function 回傳非 2xx 狀態碼後，前端只顯示英文通用訊息 Edge Function returned a non-2xx status code 的問題。前端必須解析 Edge Function 的 JSON 錯誤回應，向玩家顯示安全、明確的繁體中文原因。

## 範圍與禁止

- 只動：services/auth.js、tests/auth-flow.test.js、tests/pwa-display-controls.test.mjs、必要的首頁模組版本引用、Service Worker 快取版本，以及本任務 Board 紀錄。
- 保留後端既有中文錯誤訊息；若回應本文缺失，依 HTTP 狀態碼提供安全的繁體中文備援訊息。
- 不讀取或顯示密碼、token、service-role key、內部堆疊或資料庫細節。
- 不修改玩家帳號、密碼、玩家存檔、貨幣、道具或其他正式資料。
- 不改動 Edge Function 商業邏輯；除非驗證發現其回應格式與前端解析需求不相容，否則不部署 Edge Function。

## 驗收條件

- [ ] 409 顯示玩家名稱已被使用的中文訊息。
- [ ] 400 顯示後端提供的輸入驗證中文訊息；沒有本文時顯示通用輸入錯誤。
- [ ] 429 顯示請求過於頻繁的中文訊息。
- [ ] 500／503 顯示暫時無法完成操作的中文訊息。
- [ ] 401 登入失敗不洩漏帳號是否存在，顯示帳號或密碼不正確。
- [ ] 能解析 FunctionsHttpError.context 的 Response JSON，且 Response body 可安全重複讀取。
- [ ] 新增回歸測試，驗證上述狀態碼與中文訊息。
- [ ] 更新首頁模組 URL 與 Service Worker 快取版本，避免已安裝 PWA 持續載入舊程式。
- [ ] 不修改任何玩家資料或帳號。
- [ ] 相關測試通過，PR 合併後確認 GitHub Pages 部署成功。

## 紀錄

- 2026-11-20 17:29 [叉子] 開工；已確認 dice-rng-auth 後端已回傳中文 JSON 錯誤，根因是前端在 functions.invoke 出錯時只讀取 error.message，沒有解析 error.context 的 Response body。容量閘門：owner_side 目前 2/5（T-0002、T-0085）；未發現本次開工受 Communicate 優先閘門阻擋。
