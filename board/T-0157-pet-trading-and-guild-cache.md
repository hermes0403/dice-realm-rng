---
id: T-0157
title: 修復寵物交易版面、流程與公會舊快取錯誤
status: review
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-27
updated: 2026-11-27
depends_on: [T-0026]
branch: task/T-0157-pet-trading-and-guild-cache
done_by:
done_at:
---

## 任務

整理現有寵物交易系統的桌面／手機版面，修正玩家選擇及交易內容編輯的不便，檢查邀請、交易房間、雙方確認、取消、逾時及伺服器交換流程的資料安全與狀態一致性。同時修正公會頁面持續出現 `syncPotionGiftSettingsEntry is not defined` 的舊腳本／快取載入問題。

## 範圍與禁止

- 只動：
  - 寵物交易 UI、交易前端 service、相關 CSS、交易回歸測試。
  - 公會模組載入網址、index／script／Service Worker 快取版本與必要回歸測試。
- 不要動：
  - 不更動交易雙方真實寵物、玩家存檔或正式玩家資料。
  - 不修改融合機率、寵物屬性、收益公式或其他無關遊戲機制。
  - 不新增高頻輪詢或不必要的資料表／Realtime 訂閱。
  - 不重跑既有 Supabase migration；若發現確實需要資料庫變更，先另行提出範圍與安全方案。
- 交易測試使用隔離資料、靜態／模擬測試或 BEGIN／ROLLBACK；不得用真實玩家資產測試。

## 驗收條件

- [ ] 桌面交易版面比例清楚，玩家列表與邀請區不會無限制拉長；手機版堆疊且不造成橫向溢出。
- [ ] 玩家列表維持緊湊可捲動視窗，選取狀態清楚。
- [ ] 玩家可新增、替換及移除自己尚未送出的寵物選擇；送出後雙方確認狀態依伺服器 revision 正確重置。
- [ ] 送出失敗可重試；不會因按鈕卡住而無法再次送出。
- [ ] 重新檢查邀請接受／拒絕／取消、交易房間取消／逾時、雙方同時確認、重複請求及斷線重連；修正發現的確定性 bug。
- [ ] 交易交換仍由伺服器原子執行；未成功前不顯示完成，不因重複請求重複轉移寵物。
- [ ] 所有交易與公會相關程式引用不再要求不存在的 `syncPotionGiftSettingsEntry`；模組網址及 Service Worker cache version 全面更新，舊快取可被新版本替換。
- [ ] 新增／更新回歸測試，涵蓋版面最終 CSS 規則、移除選擇、交易狀態與公會快取版本；相關測試及語法檢查通過。
- [ ] GitHub Pages 部署成功；部署 commit 與正式資源版本可回查。
- [ ] 不使用真實玩家資料做端到端交易；限制與未執行項目需清楚記錄。

## 紀錄

- 2026-11-27 09:17 [叉子] 開單。依最新 main 的 Board 索引，owner_side 有效 in_progress 任務為 T-0142、T-0146、T-0147、T-0148，共 4/5；T-0156 為 review，不計入容量。未發現有效 communicate task，兩道啟動閘門目前未阻擋。任務先保持 open，待開單紀錄整合及開工閘門再次確認後才開始修改。
- 2026-11-27 09:18 [叉子] 開單 PR #417 已合併至 main（merge commit `31869a90fd064ee671f8b2ec647a3fc381821852`）。重新檢查最新 main：owner_side 有效 in_progress 任務仍為 T-0142、T-0146、T-0147、T-0148，共 4/5；未發現有效 communicate task，兩道啟動閘門未阻擋。狀態轉換：open → in_progress，開始實作。
- 2026-11-27 09:22 [叉子] T-0157 內容 PR #419 已合併至 main，merge commit `b4f7fe4bdab6d16882a0d9bf00f86bfa459c5c10`。GitHub Pages 部署 run `45922082249` build／deploy 均成功。交易專屬回歸、PWA display、公會贈禮、Board lifecycle、Auth、Cloud Save、Dice Roll Save、Realtime、天氣、藥水、手套及其他相關測試通過；全站 regression 與寵物管理測試仍因既有 `tests/pet-removal-admin-counts.test.js` 排序標籤斷言失敗，與 T-0157 修改範圍無關。正式 Pages 網址未能透過目前可用的外部頁面讀取工具完成瀏覽器端點擊驗證，因此只記錄 GitHub Pages 部署成功，不宣稱已完成實際手機端驗收。

## 完工回報

### 改了什麼
- `services/pet-trading-search.js`：交易內容草稿新增「移除」選項；移除只修改本地草稿，必須再次送出才更新伺服器交易內容，並沿用 revision 機制重置雙方確認。
- `style.css`：移除過時的 390px／330px 玩家列表高度規則，保留三列左右的緊湊捲動視窗；新增移除操作按鈕樣式。
- `index.html`、`script.js`、`sw.js`：同步更新 CSS、主程式及公會模組版本識別碼；Service Worker cache 升至 `dice-realm-shell-v2.47`，啟用新快取並淘汰舊快取。
- `tests/pet-trading-multi-offer.test.js`、`tests/pwa-display-controls.test.mjs`、`tests/guild-potion-gifting.test.mjs`：新增／更新移除寵物、有效列表高度、模組版本一致及舊函式引用檢查。

### 怎麼驗證的
- PR #419 已合併：`b4f7fe4bdab6d16882a0d9bf00f86bfa459c5c10`。
- Pet trading multi-offer regression：PASS。
- PWA display regression：PASS。
- Guild potion gifting regression：PASS。
- Board lifecycle validation：PASS。
- Auth flow、Cloud Save rollback、Dice roll save、Realtime polling、Weather／announcement、Heaven potion odds、Time Crystal、Coin boost、Pet backpack、glove 及 pet fusion 相關回歸：PASS。
- GitHub Pages deployment run `45922082249`：build 與 deploy 均成功。
- Full-game regression 與 pet removal/admin count 測試仍失敗於既有排序標籤斷言 `sort labels should appear in the requested order`；本任務未修改該排序程式。
- 未執行真實玩家雙帳號交易，也未修改 Supabase schema 或任何玩家資產。

### 沒做／做不到的
- 未能透過目前可用的外部頁面讀取工具完成正式網站的瀏覽器端點擊與手機實測；部署狀態以 GitHub Pages workflow 成功為證。
- 寵物排序既有測試失敗留待獨立任務處理。

### 衍生任務／影響任務
- 既有寵物管理排序標籤測試失敗與本任務無關，未擴大範圍修改。
