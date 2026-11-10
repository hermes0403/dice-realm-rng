---
id: T-0056
title: 新增 Google OAuth 登入與既有帳號安全連結
status: review
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

- 2026-11-10 [叉子] 棒子同意新增 Google 登入。依 AGENTS.md 使用叉子個人分支 `work/chazi`，未使用協作者的 `work/laocha` 或 `main`。
- 2026-11-10 [叉子] 已完成前端 OAuth 入口、帳號選擇參數、登入按鈕、事件綁定及兩項單元測試；新增獨立 CI workflow。Supabase Google Provider、Google OAuth 憑證與 redirect allow list 尚待 Owner 控制台設定。

## 完工回報

### 改了什麼

- `services/auth.js`：新增 `googleSignIn()`，呼叫 Supabase Google OAuth，使用 `prompt=select_account`，回跳到 GitHub Pages；沿用既有 `onAuthStateChange`、裝置帳號限制與雲端載入流程，並處理 quota restriction 及 Provider 未啟用訊息。
- `index.html`、`script.js`：新增 Google 登入按鈕及事件綁定，保留 Email／密碼、註冊與忘記密碼。
- `tests/google-oauth.test.js`：新增三項測試，驗證 redirect／帳號選擇參數、登入後遇到 402 阻止 OAuth，以及共用 cloud restriction 已啟動時阻止 OAuth。
- `.github/workflows/google-oauth-tests.yml`：新增獨立 Node 語法檢查與 Google OAuth 測試工作流程。

### 怎麼驗證的

- GitHub Actions `Google OAuth focused tests`，run `42792523386`：成功；`node --check services/auth.js`、`node --check script.js`、完整任務差異 `git diff --check` 及 `node --test tests/google-oauth.test.js` 全部通過（三項測試）。
- 完整回歸測試在修改後為 77 項、63 pass、14 fail；修改前基準 commit `3b1d1bccde3f986a87f5baa87988cbed9784b20a` 為 75 項、61 pass、14 fail，失敗項目相同。新增的兩項 OAuth 測試均通過。


### 沒做／做不到的

- 尚未在 Supabase Dashboard 啟用 Google Provider，也未設定 Google OAuth Client ID／Secret 與 redirect allow list；這些設定需由 Owner 在控制台完成，憑證不得寫入前端或 repository。
- 尚未用實際 Android 裝置完成 Google 帳號選擇、OAuth 回跳及舊玩家存檔連續性測試。
- 未部署 GitHub Pages、未合併至 `main`，玩家資料與 Supabase 資料均未修改。

### 衍生任務／影響任務

- 待棒子完成 Supabase／Google 控制台設定後，親自驗收 Google 登入與既有 Email 帳號的存檔連續性。
