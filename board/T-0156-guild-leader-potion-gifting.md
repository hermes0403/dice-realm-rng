---
id: T-0156
title: 公會長贈送藥水與郵箱領取功能
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-27
updated: 2026-11-27
depends_on: []
branch: task/T-0156-guild-leader-potion-gifting
done_by:
done_at:
---

## 任務

新增公會長贈送藥水功能。公會長可從自己的藥水庫存選擇藥水、每位收件人的數量及一位或多位公會成員，寄送後每位收件人會在公會郵箱看到可領取的贈禮；收件人按下「領取」後，藥水才加入自己的庫存。

## 範圍與禁止

- 只動：公會贈禮介面、郵箱贈禮呈現、必要的資料庫表／RPC／RLS、藥水庫存同步整合及對應測試。
- 會長可選擇藥水種類、每位收件人的數量及收件成員；提供送出前總扣除量預覽。
- 每位收件人建立獨立郵件，標題／內文顯示「你的會長贈予你」及「{藥水名稱} × {數量}」，並提供「領取」按鈕。
- 領取成功後標記已領取並停用按鈕；未領取郵件持續留在收件匣。
- 送出時必須在資料庫交易中驗證目前操作者是該公會隊長、收件人仍屬該公會、藥水 ID 合法、數量為正整數且庫存足夠；扣除隊長庫存與建立全部郵件必須原子完成。
- 領取時必須在資料庫交易中鎖定贈禮與收件人存檔，確保只能領取一次，並將藥水加進正確的藥水庫存。
- 處理重複請求、併發領取、送出途中失敗、舊分頁存檔覆蓋及登入切換帳號等情況；不可產生負庫存或重複發放。
- 沿用既有藥水定義與郵箱視覺，不另造不相容的藥水 ID；不得修改 player_grants 累計發放紀錄來冒充現有庫存。
- 不要動：其他公會職位權限、玩家骰子／寵物／金錢資產、既有藥水效果與機率、其他郵件類型。
- 未完成 Board 開工准入前不得修改遊戲程式或正式資料庫。

## 委派資訊

- 關聯原任務：
- 原需求方：
- 接收方：

## 驗收條件

- [ ] 只有該公會隊長能看到並成功呼叫贈送功能；副隊長及普通成員無法透過前端或直接 RPC 越權。
- [ ] 可選擇合法藥水、數量及一位／多位公會成員；送出前總扣除量正確。
- [ ] 庫存不足、非法藥水 ID、非正整數數量、非公會成員及非隊長操作均由伺服器拒絕，且不留下部分扣款或郵件。
- [ ] 每位收件人收到獨立郵件，文字為「你的會長贈予你」及藥水名稱／數量，並可按「領取」。
- [ ] 成員領取後藥水正確增加；重複點擊、重送 RPC 及併發請求都只會增加一次。
- [ ] 未領取郵件重新登入後仍存在；已領取郵件顯示已領取且不可再次領取。
- [ ] 舊分頁／多分頁雲端存檔同步不會把交易結果回滾或覆蓋。
- [ ] RLS、RPC EXECUTE 權限及伺服器端身份／公會權限檢查完成。
- [ ] 新增送出、領取、權限、併發與存檔整合測試；相關測試及全站語法檢查通過。
- [ ] Supabase migration 套用後以正式環境唯讀查詢及授權測試驗證；GitHub Pages 部署成功並確認線上版本。

## 紀錄

- 2026-11-27 07:11 [叉子] 建立新需求。已確認 T-0149 至 T-0155 的編號均已由公開 PR 使用，因此採用下一個未使用編號 T-0156。棒子方目前有 4 張 in_progress 任務（T-0142、T-0146、T-0147、T-0148），容量閘門未滿；Communicate 優先閘門尚缺完整 Board 證據，故本任務先保持 open，尚未開始程式或資料庫修改。
- 2026-11-27 07:11 [叉子] 已建立標準任務分支 task/T-0156-guild-leader-potion-gifting，來源為 main 91cf89e60acd2e32ad0c76d9c4b715f9abb5a1af；待完成 Communicate 閘門核對後，才可依流程轉為 in_progress。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務

- 2026-11-27 07:22 [叉子] 已完成第一輪程式與資料庫實作：新增隊長贈送面板、成員多選／全選、每位成員數量預覽、獨立郵件與一次性領取；新增交易 RPC、庫存鎖定扣除／增加、請求冪等鍵及雲端存檔基準同步。修改 ui/guild.js、services/cloud-save.js、guild.css、script.js、index.html、sw.js，新增 migration docs/migrations/20261127071700_guild_leader_potion_gifting.sql 與 tests/guild-potion-gifting.test.mjs。最新程式提交：09967ee71ebd649438297a5cce402417dd765987。Supabase migration 尚未套用；GitHub Actions 與正式資料庫交易測試待執行。

- 2026-11-27 07:36 [叉子] 補完成 Board 開工閘門查核（基準：最新 main Board）：owner_side 的有效 in_progress 共 4 張，分別為 T-0142（from 棒子）、T-0146、T-0147、T-0148（from 叉子），未達 5 張容量上限；main 的完整 board/ 任務檔清單未見 communicate task 或「委派資訊」任務，因此 Communicate 優先閘門未觸發。先前 07:11 紀錄的 Communicate UNKNOWN 由本次完整查核更新；保留原紀錄，不回溯改寫。
- 2026-11-27 07:36 [叉子] Supabase migration 已套用至正式專案 dice-rng（project pkdctcfifauygnjipmab），migration history version 20261126233352。正式查核：guild_potion_gift_mail 已建立並啟用 RLS；authenticated／anon 均無直接 SELECT／INSERT 權限；新公開 RPC 僅 authenticated 可執行，anon 無執行權限；SECURITY DEFINER 函式固定 search_path。使用模擬無公會帳號驗證送出被拒絕、未知贈禮領取被拒絕，並確認無公會帳號可讀取空郵箱；未修改任何真實玩家庫存。
- 2026-11-27 07:36 [叉子] PR #412（https://github.com/hermes0403/dice-realm-rng/pull/412）已建立。T-0156 專屬 CI（贈禮／既有公會郵箱／Escape 關閉／PWA 版本測試、三個 JS 檔語法檢查、diff whitespace）通過；Cloud Save 與 PWA 回歸測試通過。全站 regression 仍有既有 pet-removal-admin-counts.test.js「sort labels should appear in the requested order」失敗，該測試及寵物排序程式不在本任務修改範圍；其餘已完成的相關工作流程通過。
