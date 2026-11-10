---
id: T-0056
title: 新增 Google OAuth 登入與既有帳號安全連結
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
done_by: 棒子
done_at:
---

## 任務

在骰界 RNG 登入視窗新增 Google 帳號登入，使用 Supabase Google OAuth，讓 Android 瀏覽器可顯示目前可用的 Google 帳號選擇流程；保留原 Email／密碼登入、註冊及重設密碼功能。登入後必須沿用既有玩家載入、裝置帳號限制與雲端服務限制流程，避免建立另一份遊戲存檔。

## 範圍與禁止

- 只動：`services/auth.js`、`index.html`、必要測試及本任務紀錄。
- 不要動：`main`、Supabase 玩家資料、資料表、既有 Email／密碼登入流程及任何玩家存檔。
- 不得在前端加入 Google Client Secret、Supabase service-role key 或其他秘密。
- Google OAuth Provider、Google Cloud OAuth 憑證與 redirect allow list 需由 Owner 在控制台設定；未設定前不得宣稱線上功能已啟用。

## 驗收條件

- [ ] 登入視窗顯示「使用 Google 帳號登入」按鈕，原帳密功能保留。
- [ ] 按鈕呼叫 Supabase `signInWithOAuth({ provider: 'google' })`，並帶入 `prompt=select_account` 與正確 GitHub Pages redirect。
- [ ] OAuth 回跳由既有 `onAuthStateChange` 接手，沿用 email verified、裝置帳號限制、雲端載入與初始化流程。
- [ ] 402／quota restriction 時不啟動新的 OAuth 請求，且顯示既有服務限制訊息。
- [ ] 補上 OAuth 單元測試；執行測試及 `git diff --check`（若無本機工作樹，明確說明未能執行）。
- [ ] Owner 在 Supabase／Google 控制台完成 Provider 設定並親自驗收登入及舊帳號存檔連續性。

## 紀錄

- 2026-11-10 [叉子] 棒子已同意新增 Google 登入。依 AGENTS.md，使用叉子個人分支 `work/chazi`，不使用協作者的 `work/laocha` 或 `main`。先實作前端 OAuth 入口及測試；正式 Provider 設定仍待 Owner 控制台操作。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
