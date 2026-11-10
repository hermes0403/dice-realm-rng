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
