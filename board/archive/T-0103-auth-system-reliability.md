---
id: T-0103
title: 修復 Email 登入、註冊驗證與密碼復原流程
status: done
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-17
updated: 2026-11-20
depends_on: []
branch: task/T-0103-auth-system-reliability
done_by: 棒子
done_at: 2026-11-20
---

## 任務

完整檢查並修復骰界 RNG 的 Email／密碼登入、註冊驗證、忘記密碼、驗證信回跳及登入後雲端初始化流程。維持 Email／密碼為唯一登入方式；Google 登入按鈕與流程維持移除狀態。

## 範圍與禁止

- 只修改登入／註冊／密碼復原所需的 services/auth.js、services/cloud-save.js、必要的 index.html／script.js 綁定、services/supabase.js（僅在驗證發現設定錯誤時）、Auth 專項測試，以及可供 Owner 貼入 Supabase Dashboard 的繁體中文驗證信／重設密碼信範本文件。
- 保留 Supabase persistSession、autoRefreshToken、detectSessionInUrl 與現有 Email／密碼帳號，不重新加入 Google OAuth。
- 保留每日裝置帳號限制、未驗證帳號禁止進入遊戲、既有玩家存檔及帳號資料；不得重設、刪除或合併玩家資料。
- 修復註冊驗證信的清楚提示、驗證成功／失效回跳處理、必要時重新寄送驗證信，以及密碼重設連結後設定新密碼的完整流程。
- 登入初始化必須避免重複執行、避免在 Supabase onAuthStateChange 回呼內等待其他 Supabase 請求，並明確處理雲端存檔載入成功、失敗與重試；不得讓未完成雲端載入的帳號誤以為已可正常遊玩。
- 改善登入錯誤與郵件 429 提示，明確區分「這次郵件沒有寄出」、「伺服器要求等待秒數」及「專案服務受限」；不得偽造註冊成功、跳過信箱驗證或洩漏帳號是否存在。
- 驗證信與重設密碼信的文字範本可在 repository 提供；Supabase Dashboard 的實際郵件範本、SMTP 或 Send Email Hook 設定若無可用的安全管理介面，必須標示為待 Owner 操作，不得假稱已修改。
- 不修改 Supabase schema、資料表、玩家資料、遊戲經濟、骰子機率或其他無關功能；不讀取或提交任何秘密憑證。
- 完成隔離測試、語法檢查及相關回歸測試後，依授權流程交付並部署 GitHub Pages。

## 驗收條件

- [ ] 登入介面只提供 Email／密碼登入、建立帳號及忘記密碼，沒有 Google 登入入口或失效事件綁定。
- [ ] 新帳號註冊後清楚說明驗證信是否成功寄出、下一步如何操作；點擊有效驗證連結後可回到骰界並完成登入初始化。
- [ ] 驗證連結失效、已使用或格式錯誤時，顯示可理解的訊息及安全的重新寄送方式。
- [ ] 忘記密碼信回跳後能輸入並保存新密碼，成功後可正常登入。
- [ ] 重新整理或切換分頁後，已驗證帳號可透過既有 Supabase session 持續登入；不會重複初始化、重複釋放裝置鎖或造成登入卡住。
- [ ] 雲端存檔載入成功前不開放遊戲操作；載入失敗時保留帳號狀態並提供明確重試，不覆蓋或清除玩家資料。
- [ ] 登入失敗、註冊／重設郵件 429、Egress 402 及其他錯誤均有正確提示，且不進行無意義的連續重試。
- [ ] 新增 Auth 專項回歸測試；完整測試、JavaScript 語法檢查及 git diff --check 通過。
- [ ] GitHub Pages 部署成功；Supabase Dashboard 郵件範本若仍需 Owner 操作，須提供明確待辦及可直接貼上的繁體中文範本。

## 紀錄

- 2026-11-17 21:27 [叉子] 建立任務，先保持 open；依 Board 規範完成准入閘門檢查後再接手。
- 2026-11-17 21:28 [叉子] 狀態轉換：open → in_progress。重新檢查最新 main Board：owner_side 有效 in_progress 任務為 T-0085、T-0102，共 2/5；Communicate 優先閘門未觸發。登入相關的 T-0057 僅存在於已知分歧的 work/chazi 歷史分支，保留其成果並在本任務選擇性參考，不覆蓋該分支。開始 T-0103 實作。


## Owner 驗收結案紀錄

- 2026-11-20 [棒子] 驗收：棒子確認本任務完成並正式結案。來源：https://github.com/hermes0403/dice-realm-rng/pull/201（已合併，含 Email 登入、驗證信重寄、密碼復原、雲端載入初始化及專項回歸測試）；正式環境部署由 https://github.com/hermes0403/dice-realm-rng/actions/runs/44683464270（main Pages deployment success）確認。限制：實際寄信送達及 Supabase Dashboard 郵件範本套用未由程式測試證實；繁體中文範本與設定指引交付於 docs/supabase-auth-email-templates.md，Dashboard 操作仍由 Owner 依文件處理。
