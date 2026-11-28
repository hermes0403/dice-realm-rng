---
id: T-0164
title: 修復天氣骰子投入白名單與併發存檔覆蓋
status: blocked
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-28
updated: 2026-11-28
depends_on: []
branch: integration/T-0164-weather-deposit-fix
done_by:
done_at:
---

## 任務

修復玩家投入天氣骰子時，部分骰子被錯誤拒絕，以及短時間投入兩種不同骰子可能只保留其中一次結果的問題。這是針對現有投入流程的精準修復；T-0010 仍保留其更完整的天氣交易改造範圍，本任務不接手或修改協作者方任務。

## 範圍與禁止

- 只動：
  - `public.deposit_weather_dice` 的骰子白名單、正確貢獻分母與回傳版本時間。
  - `systems/weather.js` 的手動／自動投入共用序列佇列及伺服器結果採用方式。
  - `services/cloud-save.js` 的伺服器背包快照版本防回退。
  - 必要的前端依賴接線、版本快取字串、回歸測試及本任務 migration 文件。
- 不要動：
  - 擲骰核心、出售／背包一般交易、手套、藥水、召喚／轉換結果規則、全域天氣規則、玩家其他資產或無關 UI。
  - 不得重置、回填或直接修改玩家現有背包／貢獻資料。
  - 不得以客戶端提供的骰子分母取代伺服器白名單。
  - 不修改 T-0010 或其他協作者方任務。

## 驗收條件

- [x] d60～d63 均可投入，伺服器採用正確分母：d60=17100、d61=15222、d62=34321、d63=62200。
- [x] 手動與自動投入共用同一序列佇列；同一頁面連續投入不同骰子時，每筆 RPC 都依序完成。
- [x] RPC 回傳伺服器更新時間；較舊回應不得覆蓋較新的本機／雲端背包基準。
- [x] 投入成功後採用伺服器權威背包快照，不再用成功後的整包舊快照回寫覆蓋伺服器交易。
- [x] 回歸測試涵蓋 d60～d63 白名單／分母、兩種骰子連續投入、手動與自動投入共用佇列、舊回應不得回退較新快照。
- [ ] GitHub Actions 相關測試成功；Supabase migration 已套用至正式 dice-rng 專案並以唯讀查詢驗證函式定義。
- [ ] GitHub Pages 正式部署完成並回讀確認；任務紀錄附 commit、PR、migration 與部署證據。

## 紀錄

<!-- 只增不改。格式：- YYYY-MM-DD HH:MM [作者] 內容 -->
- 2026-11-28 01:13 [叉子] 棒子明確授權本任務由叉子採取必要方法完成修復、回歸測試、正式 Supabase RPC 更新、GitHub Pages 部署及部署後抽查。授權限於本任務列明範圍；不得修改 T-0010 或其他任務。新需求開單時棒子方容量為 3/5，未發現有效 Communicate 優先鎖；本任務依 Board 規則先建立為 open。
- 2026-11-28 01:13 [叉子] 開工准入檢查：Board main SHA d35e53e50694f8884f512ea3904562fabeb79f4a；棒子方有效 in_progress 任務為 T-0142、T-0146、T-0148（3/5）；未發現有效 Communicate 任務；依賴為空。由 open 轉為 in_progress，開始修復。
- 2026-11-28 01:13 [叉子] 建立任務分支 `task/T-0164-weather-deposit-race-fix`，來源 main SHA `d35e53e50694f8884f512ea3904562fabeb79f4a`。

- 2026-11-28 01:19 [叉子] 正式 Supabase migration `t0164_weather_deposit_rpc` 已套用至專案 `dice-rng`；唯讀回查確認正式函式含 d60～d63 正確分母、`FOR UPDATE` 列鎖及 `updated_at` 回傳；`game_saves.updated_at` 型別為 timestamp with time zone。未修改任何玩家資料。
- 2026-11-28 01:19 [叉子] 程式分支 CI 驗證：Full game regression 464／464 PASS；Dice roll save、Cloud save rollback、PWA display、Weather display、Board lifecycle 等工作流程成功。最新程式提交 SHA：`ef38ae023010e7cc7fde9c2c606fa75f53e9ae28`。
- 2026-11-28 01:19 [叉子] 整合阻擋：main SHA `d35e53e50694f8884f512ea3904562fabeb79f4a`；work/chazi SHA `2ffd91ad46897494a1d491530e2efda33a218dbf`；共同祖先 `dbbefa05bc110004c6f420c1e9d0c0505543d10f`；compare 為 DIVERGED（work/chazi ahead 368、behind 1691）。main 與 work/chazi 的差異同時包含本任務修改的 `script.js`、`services/cloud-save.js`、`systems/weather.js`。T-0164 task branch 由 main 建立，不符合 T-0038 §6.3 第 3 項「任務分支以 work/chazi 為建立基準」；條件 6、7 亦無法確認安全。不得直接整合或覆蓋。
- 2026-11-28 01:19 [叉子] PR #436（base main）已關閉且未合併，避免違反棒子方現行整合流程；原 task branch 保留，不刪除、不改寫歷史。前端程式尚未部署至 GitHub Pages；正式 Supabase RPC 已部署。任務保持 blocked，等待合法整合條件解除。

- 2026-11-28 09:22 [代記:棒子/叉子] 棒子核准建立正式「棒子方 Owner 單次整合例外」流程；此流程僅允許逐案豁免 T-0038 §6.3 七條件中的第 3 項，其他六項及保護措施全部保留。T-0164 可依新流程提出一次性整合審查，並非已核准合併或部署；須先依 Board README §7.1 完成逐檔差異審查及驗證。｜來源：棒子於 2026-11-28 對話原話「我說 是」，回覆對象為「可以決定是否制定正式例外流程」。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
- 影響：T-0010（僅針對現有投入錯誤的熱修復；不變更該任務內容或狀態）。

- 2026-11-28 10:03 [叉子] 依棒子核准的 Owner 單次例外流程，僅豁免 T-0038 §6.3 第 3 項。建立整合分支 `integration/T-0164-weather-deposit-fix`，起點為 `work/chazi` SHA `2ffd91ad46897494a1d491530e2efda33a218dbf`；已逐項移植天氣投入序列佇列、伺服器版本化背包採用、前端依賴注入、RPC migration 文件及回歸測試。PR 與 CI 尚待建立／驗證，未部署前端。

- 2026-11-28 10:06 [叉子] 整合 PR #439 已建立（base `work/chazi`，head `integration/T-0164-weather-deposit-fix`，HEAD `b86da4f871635120243e0de7e189052fd29d199b`）。PR 差異共 7 檔，與 `work/chazi` 比較 ahead 12／behind 0；沒有直接合併舊 task branch。T-0164 新增 6 項回歸測試全數通過（測試 #80–85）；Focused game regression tests PASS。完整 Branch tests 與 Game save delta sync tests 仍失敗，完整測試為 76/90 PASS、14 項既有測試失敗（包含 cloud-save-pet-authority、realm-polls-realtime、global-boost、weather-realtime-lifecycle 等）；尚未取得 work/chazi 基準分支的獨立重跑證據，因此不把它們標為已確認的基準失敗。依停止條件暫停合併及部署，任務轉為 blocked，等待失敗項目釐清／基準驗證。前端仍未部署。

- 2026-11-28 10:07 [叉子] 最新整合提交 SHA `95767a0e8108727319ae58d3da5daf819026f0d1` 的 Actions 已完成：Focused game regression tests PASS；Branch tests FAIL（90 項中 76 PASS、14 FAIL）；Game save delta sync tests FAIL。T-0164 六項新增測試均 PASS（#80–85）。失敗項目集中於既有雲端存檔權限、coin boost、leaderboard、announcement、poll／weather lifecycle 測試；目前尚未執行 work/chazi 基準分支的同條件測試，故保留為阻塞，不合併、不部署。PR #439 維持 open，等待基準差異釐清及棒子方審查。
