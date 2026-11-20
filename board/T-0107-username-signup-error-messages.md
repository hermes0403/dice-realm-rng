---
id: T-0107
title: 修正玩家名稱註冊錯誤訊息顯示
status: review
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

- [x] 409 顯示玩家名稱已被使用的中文訊息。
- [x] 400 顯示後端提供的輸入驗證中文訊息；沒有本文時顯示通用輸入錯誤。
- [x] 429 顯示請求過於頻繁的中文訊息。
- [x] 500／503 顯示暫時無法完成操作的中文訊息。
- [x] 401 登入失敗不洩漏帳號是否存在，顯示帳號或密碼不正確。
- [x] 能解析 FunctionsHttpError.context 的 Response JSON，且 Response body 可安全重複讀取。
- [x] 新增回歸測試，驗證上述狀態碼與中文訊息。
- [x] 更新首頁模組 URL 與 Service Worker 快取版本，避免已安裝 PWA 持續載入舊程式。
- [x] 不修改任何玩家資料或帳號。
- [x] 相關測試通過，PR 合併後確認 GitHub Pages 部署成功。

## 紀錄

- 2026-11-20 17:29 [叉子] 開工；已確認 dice-rng-auth 後端已回傳中文 JSON 錯誤，根因是前端在 functions.invoke 出錯時只讀取 error.message，沒有解析 error.context 的 Response body。容量閘門：owner_side 目前 2/5（T-0002、T-0085）；未發現本次開工受 Communicate 優先閘門阻擋。

- 2026-11-20 17:32 [叉子] 程式交付與部署完成，提交 Owner 驗收；PR #232 已合併至 main（merge commit 7a506ccb1875a42d8e8020438020d539417d333e），GitHub Pages deployment run 44711503137 成功。Auth flow、PWA display、Board lifecycle 及其他 PR 回歸工作流程均成功。未建立測試玩家、未修改帳號或任何玩家資料。

## 完工回報

### 改了什麼
- services/auth.js 新增 Edge Function 錯誤解析，讀取 FunctionsHttpError.context 的 Response JSON，使用 clone() 保留原始 response body。
- 保留後端中文錯誤；回應本文缺失時，依 400／401／403／409／429／500／502／503 提供繁體中文備援訊息。
- tests/auth-flow.test.js 新增重複名稱、輸入驗證、請求過頻、狀態碼備援及 Response body 可重複讀取測試。
- tests/pwa-display-controls.test.mjs 更新快取版本回歸斷言；同步更新 script.js、index.html 與 sw.js 的模組版本及 PWA cache v1.72。

### 怎麼驗證的
- PR #232 Auth flow regression tests：成功（run 44711399232）。
- PR #232 PWA display regression tests：成功（run 44711399251）。
- PR #232 Board lifecycle validation：成功（run 44711398990）。
- PR #232 其他相關回歸工作流程：成功。
- main commit 7a506ccb1875a42d8e8020438020d539417d333e 的 GitHub Pages build 與 deploy：成功（run 44711503137）。

### 沒做／做不到的
- 未使用真實玩家帳號進行註冊，不會讀取或要求任何玩家密碼；正式玩家實際註冊流程仍需玩家自行操作驗證。
- 未修改 Edge Function、Supabase 資料、玩家帳號、密碼或存檔。

### 衍生任務／影響任務
- 無。
