---
id: T-0057
title: 改善註冊與驗證信寄送額度錯誤提示
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-10
updated: 2026-11-10
depends_on: []
branch: work/chazi
done_by:
done_at:
---

## 任務
改善玩家註冊／密碼重設遇到 Supabase Auth 郵件寄送 429 時的提示，避免玩家誤以為註冊成功或反覆重按；盤點正式環境寄信錯誤並提出真正解除全專案寄信上限的必要條件。

## 範圍與禁止
- 只修改 Auth 前端錯誤分類、提示及相關測試／Board 紀錄。
- 不得在前端偽造註冊成功、跳過信箱驗證或自動登入未驗證帳號。
- 不得為了繞過寄信限制而降低帳號安全性。
- 自訂 SMTP／Send Email Hook 需要外部服務帳號與秘密憑證；未取得合法授權設定前，不得自行假設或填入憑證。
- 不得將 Supabase service-role key、SMTP 密碼或其他秘密寫入前端或 repository。

## 驗收條件
- [ ] 註冊及密碼重設遇到郵件 rate limit 時，清楚告知該次信件未寄出及伺服器拒絕原因。
- [ ] 若伺服器回傳個別冷卻秒數，提示使用者等待指定時間，不鼓勵連續重試。
- [ ] 不影響一般登入、Google OAuth、Egress 402 錯誤處理及既有信箱驗證流程。
- [ ] 以實際測試或可重現的單元測試驗證錯誤分類與訊息。

## 正式環境查核
- 2026-11-10 Supabase Auth logs 在 /signup 多次回傳 HTTP 429、over_email_send_rate_limit；錯誤包含 email rate limit exceeded，另有同一使用者短時間重送所觸發的 19～55 秒冷卻訊息。
- Supabase 官方文件指出內建郵件服務全專案預設每小時 2 封；要提高寄送上限並寄送至一般玩家信箱，需設定自訂 SMTP 或 Send Email Auth Hook。尚未透過專案設定 API 確認此專案目前 SMTP 設定狀態，故不可宣稱已確認使用哪家郵件服務。

## 紀錄
- 2026-11-10 [叉子] 接手：棒子回報多位玩家註冊後沒有收到驗證信，並希望處理；已在正式 Auth logs 確認多個 /signup 請求回傳 429、over_email_send_rate_limit，確定為伺服器郵件寄送限制。

- 2026-11-10 [叉子] 修改 services/auth.js：註冊與密碼重設遇到郵件 429 時，明確提示該次信件未寄出、全專案共用寄信額度及不要連續重試；伺服器若回傳個別冷卻秒數，直接顯示應等待秒數。保留 402 Egress 限制、Google OAuth、一般登入及信箱驗證流程。
- 2026-11-10 [叉子] 新增 tests/auth-email-rate-limit.test.js，涵蓋專案郵件額度、個別秒數冷卻與密碼重設信件類型；GitHub Branch tests workflow 已會執行 tests/*.test.js，services/auth.js 也在語法檢查清單內。相關 commit：cce3f0c4、d817ed96、ee97c622、d50e3c6f、6a571702。
- 2026-11-10 [叉子] 驗證狀態：已確認遠端原始碼與 Board 寫入；目前尚未取得 GitHub Actions 執行結果，單元測試與瀏覽器端驗證尚未在實際 repository runner 執行，不宣稱已通過。
- 2026-11-10 [叉子] 真正提高寄信額度仍需管理員設定自訂郵件服務或 Send Email Auth Hook；需要外部服務帳號及秘密設定，未取得授權前不修改正式設定。尚未確認 dice-rng 現行 SMTP provider 的具體配置。
