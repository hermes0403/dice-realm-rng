---
id: T-0016
title: 將前端 script.js 依功能責任拆分為模組
status: blocked
from: barry
to: any
owner: 老查
contributors: []
reviewer:
priority: P2
created: 2026-11-02
updated: 2026-11-02
depends_on: T-0001
branch: feat/server-authoritative-frontend
done_by:
done_at:
---

## 任務

T-0001 已將前端拆成 `index.html`、`style.css`、`script.js`；拆分前的 `script.js` 約 994 行、721,798 bytes，仍包含多個責任不同且彼此交錯的遊戲系統、資料存取、畫面渲染、管理功能及初始化流程。請再次依照**功能責任與模組依賴**拆分 JavaScript，不得只按行數或固定行號切割。

目標是讓每個模組具有清楚單一責任、可追蹤依賴、可獨立檢查，並保留目前遊戲行為。建議採原生 JavaScript ES Modules，以符合 GitHub Pages 靜態部署，不引入 bundler 或額外套件；若實際盤點證明原生模組不適用，必須在紀錄中提出原因與替代架構。

## 範圍與禁止

- 只動：前端 JavaScript 檔案、`index.html` 的 JavaScript 載入入口，以及本任務必要的測試／文件／Board 紀錄。
- 本任務只負責程式結構重整；產品行為、雲端／離線模式政策及存檔隔離一律以 T-0002 與其 Owner 決策為準。T-0016 不得新增、修改或自行補作離線模式、登入入口、模式切換或存檔隔離功能。
- 本任務**免做 Supabase CSV 檢查**；不得因沒有當日 CSV 而阻塞本任務，也不得執行 Supabase SQL Editor 查詢。
- 不要動：`supabase/`、任何 SQL migration、資料庫 schema、RPC 定義、RLS、grants、Edge Functions、正式環境資料或部署設定。
- 不改遊戲規則、機率、價格、獎勵、存檔格式、雲端／離線隔離策略、Supabase 呼叫契約或使用者可見功能；若發現既有缺陷，另開任務，不混入本次純結構重整。
- 不得只把原 `script.js` 切成數個仍高度互相依賴的巨大檔案；也不得為了追求檔案小而把同一責任拆得過細。
- 模組間必須使用明確 `import`／`export`；不得依賴不同 classic script 之間隱式共享的頂層 `const`／`let`。避免循環依賴；共用狀態與工具應有明確歸屬。
- 不得直接把所有函式掛到 `window` 以規避模組依賴。若 HTML 或外部整合確實需要全域介面，必須列出最小必要白名單及理由。
- 不新增第三方套件或建置工具，除非有明確技術必要、成本評估及任務紀錄。

## 初步模組責任建議

實作前先盤點函式、常數、狀態與 DOM 依賴，再依實際依賴圖調整以下分組；此表是起始架構，不是要求照抄固定檔名：

| 模組領域 | 應收納的責任／現有功能例子 |
|---|---|
| `data/` | 骰子 `D`、手套 `G`、藥水 `POTIONS`、寵物 `PETS`、稀有度／配方／設定常數 |
| `core/` | 遊戲狀態 `S`、`fresh()`、資料正規化、共用格式化／純函式工具 |
| `services/` | Supabase client、RPC 呼叫、Auth、雲端存檔、裝置鎖、Realtime／遠端資料讀取 |
| `systems/dice` | 機率權重、擲骰流程、結果副作用、揭示動畫及自動擲骰協調 |
| `systems/weather` | 天氣狀態、天氣 UI 資料、投入／召喚／轉換、自動投入偏好 |
| `systems/inventory` | 背包、骰子出售、容量升級、自動出售設定 |
| `systems/equipment` | 手套、藥水效果、合成／使用操作與效果計算 |
| `systems/pets` | 寵物資料、合成、裝備、技能、收益、出售與自動出售 |
| `systems/progression` | 成就、每日任務、每日獎勵及進度顯示資料 |
| `systems/social` | 排行榜、全服公告、投票、訪客／在線紀錄 |
| `admin/` | 管理員面板、管理 RPC 呼叫、監控、稽核與管理操作 UI |
| `ui/` | 導航、共用元件、各頁面 render、提示訊息、Modal 與事件綁定 |
| `app/` | 應用程式入口、初始化順序、事件註冊與 timer 啟停 |

同一功能的資料、業務邏輯與 DOM 呈現若有必要分層，應以明確介面連接；不要為了符合表格而製造無意義的空模組。

## 驗收條件

- [ ] 完成現有 `script.js` 的責任盤點及模組依賴圖，列出主要常數、狀態、函式、DOM 依賴與 Supabase 呼叫歸屬。
- [x] 完成第一輪模組檔案樹及入口載入設計；模組之間採明確 import/export，抽出的系統／UI 以依賴注入連接，未新增循環匯入。
- [x] `index.html` 改為載入單一原生 ES Module 應用入口；相對引用路徑已通過本機模組匯入檢查，GitHub Pages 實際部署仍待驗證。
- [ ] 原 `script.js` 不再承載整個應用程式；若保留同名檔，只能作為精簡相容入口，且不得重複載入模組。
- [x] 各模組按功能責任拆分；除資料目錄或有明確理由的模組外，單一程式檔原則上不超過 300 行。超過時須在任務紀錄說明為何仍維持單一責任、不宜再拆。`systems/dice.js` 與 `systems/pets.js` 的共享狀態邊界及保留理由已記錄於模組地圖。
- [ ] 不改變遊戲功能、抽取機率、經濟數值、資產流程、雲端／離線行為、RPC 名稱／參數／回傳契約或任何資料格式。
- [ ] 不存在重複事件監聽、重複初始化、重複 timer、重複載入或因 ES Module 執行時機改變而造成的功能差異。
- [ ] 完成靜態語法檢查及瀏覽器回歸測試，至少涵蓋登入／登出、雲端模式、手動／自動擲骰、背包與出售、手套、藥水、天氣、寵物、成就／每日任務、排行榜及管理員頁面載入。離線模式回歸屬於 T-0002／相關子任務的產品功能驗收；只有在該功能已實作且可供測試後，才於本任務做不改變行為的相容性回歸。若離線入口尚不存在或功能尚未完成，記錄為外部依賴未就緒，不得在 T-0016 中自行實作或解除登入限制。
- [x] 確認所有 JS import 路徑大小寫與相對路徑正確，靜態主機可直接載入；不依賴本機開發伺服器的特殊路由。40 個 JS 檔案、43 個相對匯入通過路徑存在與循環檢查。
- [x] `git diff --check` exit 0；列出實際測試命令及 exit code。未執行的測試明確標示未驗證。

## 紀錄

<!-- 只增不改。格式：- YYYY-MM-DD HH:MM [棒子|叉子|barry|老查] 內容 -->
- 2026-11-02 [barry] 開單。指定再次依功能責任拆分 `script.js`；本任務免做 Supabase CSV 檢查。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務

- 2026-11-02 14:30 [老查] 依 barry 指示接手 T-0016，依原任務建議按功能責任拆分；已確認本任務免做 Supabase CSV 檢查。branch: feat/server-authoritative-frontend。
- 2026-11-02 14:48 [老查] 完成第一輪原生 ES Module 拆分：新增 `config.js`、`data/{dice,equipment,pets,progression}.js`、`core/format.js`、`services/{supabase,device-lock,visit-tracking}.js`、`systems/{pet-income,progression}.js`、`admin/{grants,pet-odds}.js`、`ui/{navigation,inventory,pet-selling}.js`；`index.html` 改用 `type="module"`。新增 `docs/FRONTEND_MODULE_MAP.md` 記錄實際模組樹及尚未拆分的責任。`script.js` 現為 747 行、172,358 bytes，仍高於 300 行原則，天氣、Auth／雲端存檔、擲骰、手套／藥水、寵物其餘流程、排行榜及大部分管理面板仍待拆分，因此任務維持 `in_progress`。驗證：所有 JS 檔 `node --check` 通過；16 個 ES module import smoke test 通過；`git diff --check` exit 0。尚未執行瀏覽器回歸或 GitHub Pages 線上驗證；未執行 Supabase SQL／CSV 檢查。
- 2026-11-02 13:01 [老查] 完成第二階段天氣與雲端存檔責任抽離：新增 `systems/weather.js`、`services/cloud-save.js`，並在 `script.js` 以 factory／依賴注入整合；天氣模組補齊 `announceWeatherSummon`、`triggerWeatherSurge` 注入，避免特殊天氣路徑引用未定義識別字。雲端存檔逐段對照 HEAD 原始邏輯，保留 grant 累計差額、game_saves/player_profiles upsert 欄位、寵物合併與裝備、petIncomePending、藥水材料上限、auto-sell 偏好、貨幣／手套遷移及停權錯誤處理；以 wrapper 保留 `userSaveKey`、`savePayload`、`achievementStats`、`applyPendingGrants`、`syncCloudSave`、`loadCloudSave`、`flushCloudSave` 原呼叫名稱，`save()` 改由服務的 `scheduleSync(700)` 排程。新增雲端請求完成後的使用者 ID 核對，避免登入切換後套用舊帳號回應。模組圖已更新；目前 `script.js` 576 行、`systems/weather.js` 166 行、`services/cloud-save.js` 253 行。驗證：全部 JS `node --check` 通過；18 個 ES Module import smoke test 通過（提供最小 browser-global stub）；`script.js` 18 個 named imports 對應檢查通過；19 個 JS 檔案的本地 import graph cycle check 通過；`git diff --check` exit 0。尚未執行瀏覽器功能回歸或 GitHub Pages 線上驗證；未執行 Supabase SQL／CSV 檢查。T-0016 維持 `in_progress`。
- 2026-11-02 13:05 [老查] 追加靜態檢查：確認 `save()` 與七個雲端存檔相容 wrapper 均保留，並確認初始化時序中 `createProgressionSystem` 只接收 `save` 函式參照，不會在雲端服務建立前呼叫；目前 `script.js` 實際 598 行（前筆紀錄的 576 行為檢查中間值，已更正模組圖），`weather.js` 166 行、`cloud-save.js` 253 行。重跑全部 JS `node --check`、18 個 named import 綁定、19 檔 import graph cycle check、相容 wrapper 靜態檢查及 `git diff --check`，全部通過。瀏覽器功能回歸與 GitHub Pages 實際載入仍未驗證；任務維持 `in_progress`。
- 2026-11-02 [老查] 依 T-0002 的 Owner 決策釐清任務邊界：T-0016 僅進行 `script.js` 功能模組拆分與行為保留，不負責新增／實作離線模式、模式入口或雲端／離線存檔隔離；上述產品行為及架構一律以 T-0002 與其子任務為準。修正驗收條件：離線模式只在 T-0002 相關功能完成後做相容性回歸；若功能尚未就緒，記錄外部依賴未完成，不得為通過 T-0016 而改動產品行為。此次僅修正 T-0016 任務文件，未修改遊戲程式碼、未變更任務狀態或操作 Supabase。

- 2026-11-02 14:20 [老查] 完成第三階段責任抽離：將全服公告、稀有擲骰廣播、寵物融合紀錄、realm 訊息／投票接回 systems/realm-social.js；將手套與藥水功能接回 ui/equipment.js；新增 admin/player-management.js（玩家名單、稀有紀錄、可疑紀錄分析）及 admin/monitoring.js（天氣紀錄、線上統計、成就／藥水紀錄、收益監控、停權）。上述函式本體由原 script.js 搬移，入口改為依賴注入及相容 wrapper；原事件監聽保留在原初始化位置。setupAdminPetOddsUI 改在 petSystem 建立後初始化，以符合 renderPetChance、dicePairTier 的依賴來源。script.js 現為 299 行、54,255 bytes；管理模組分別 47 行及 29 行。驗證：全部 JS node --check exit 0；四個新接線模組的 ES Module import smoke test 通過；抽離函式在 script.js 無重複實作；git diff --check exit 0。仍有 systems/dice.js 392 行、systems/pets.js 484 行、systems/realm-social.js 352 行、ui/equipment.js 458 行超過 300 行原則，入口亦仍保留狀態／存檔、Auth、render 及部分事件綁定；T-0016 維持 in_progress。尚未執行瀏覽器回歸、GitHub Pages 線上驗證或 Supabase 操作；依任務規定免做 CSV 檢查。本輪未呼叫任何子代理。

- 2026-11-02 14:26 [老查] 完成第四階段細分：將原 equipment 模組拆成 ui/gloves.js（204 行）與 ui/potions.js（234 行），ui/equipment.js 改為相容 facade；將原 realm-social 模組拆成 systems/global-announcements.js（170 行）與 systems/realm-polls.js（181 行），systems/realm-social.js 改為 facade。拆分後手套與藥水各自註冊專屬事件監聽，原 selector、處理函式及觸發順序均沿用既有程式。模組地圖同步更新。`script.js` 維持 299 行；目前僅 systems/dice.js（392 行）與 systems/pets.js（484 行）超過 300 行，兩者保留同一 factory 是因擲骰流程共用 rolling／autoTimer 狀態與結果時序，寵物流程共用寵物持有狀態、技能、變異、合成及畫面更新；再拆需先設計跨模組狀態介面，避免重複狀態及 timer，已在模組地圖記錄理由。驗證：全部 JS node --check exit 0；8 個新／facade 模組 factory smoke test 通過；34 個 JS 檔案的 37 個相對 import 路徑存在且無循環；git diff --check exit 0。瀏覽器回歸與 GitHub Pages 線上載入尚未驗證。工作分支 feat/server-authoritative-frontend ahead 2，工作區仍有既存修改及未追蹤檔案，因此未執行 pull；本輪未呼叫任何子代理、未操作 Supabase，依任務規定免做 CSV 檢查。
- 2026-11-02 14:34 [老查] 完成第五階段抽離：新增 core/game-state.js，搬移 fresh、normalizeGloves、migrateCurrency、load，以及自動出售偏好讀寫；script.js 改由 createGameStateService 建立初始狀態並取得相同函式。偏好儲存函式改透過 getState/getCurrentUser 取得當前狀態與帳號，保留原本 key、資料格式、骰子篩選條件與錯誤處理。原本在 petSystem 初始化完成後的 ensurePetData(S.pets) 呼叫保留，確保載入期 wrapper 尚未就緒時，寵物資料仍會在 UI 初始化前完成正規化。script.js 降至 271 行、48,611 bytes；core/game-state.js 38 行。驗證：全部 JS node --check exit 0；game-state factory smoke test（load、偏好 restore/persist）通過；git diff --check exit 0。任務仍有主畫面 render、Auth、雲端存檔接線及部分事件綁定待抽離，瀏覽器回歸尚未執行。
- 2026-11-02 14:47 [老查] 完成第七階段抽離：新增 services/presence.js、services/activity-logs.js、ui/pet-notices.js、ui/codex.js、ui/main-render.js；將 heartbeat、craft／potion activity logs、寵物自動出售提示、圖鑑分類與渲染、主畫面 render 搬離 script.js。將 sellMany、bagUpgradeCost 收入 ui/inventory.js；將 local save 收入 services/cloud-save.js，script.js 僅保留 save wrapper。為保持原渲染狀態，systems/dice.js 新增 isRolling／isAutoRolling getter，render module 使用 getter 讀取 dice factory 內部狀態；同時補上 weatherSystem 的 updateWeatherUI 解構。script.js 現為 274 行、41,458 bytes。檢查時發現並修正原 render 中直接讀取 dice module 私有 rolling／autoTimer 變數，以及漏解構 updateWeatherUI 的接線問題。驗證：全部 JS node --check exit 0；game-state、cloud-save、presence、activity logs、inventory、codex、main-render 等 factory smoke tests 通過；git diff --check exit 0。尚待最終 import graph 重跑及瀏覽器回歸。
- 2026-11-02 14:49 [老查] 完成第八階段抽離與回歸靜態檢查：新增 ui/main-render.js，將主畫面 render 編排移出入口；render 改由 dice factory 的 isRolling／isAutoRolling getter 讀取狀態，避免直接引用模組私有的 rolling／autoTimer；weatherSystem 的 updateWeatherUI 亦已正確解構。script.js 目前 274 行、41,458 bytes，index.html 已確認以 type=module 載入。驗證：40 個 JS 檔案、43 個相對 import 全部存在且無循環；全部 JS node --check exit 0；main-render、codex、inventory、game-state、cloud-save、presence、activity logs、equipment、realm-social 及 admin factory smoke tests 通過；git diff --check exit 0。未能執行真實瀏覽器互動回歸，故 T-0016 保持 in_progress；目前入口仍有帳號操作、管理員事件綁定與部分共用 helper 待整理。
- 2026-11-02 15:26 [老查] 完成原始函式歸屬核對：以 `fea25bf:script.js`（995 行、720,804 bytes）作為 T-0016 拆分前基準，盤點 212 個具名 function／arrow 宣告（211 個唯一名稱；`categoryOrder` 在兩個區域作用域各宣告一次），全部對應至現行模組、`script.js` 共用 helper，或明確記錄的改名／私有 helper，未解決名稱 0。新增 `docs/FRONTEND_FUNCTION_OWNERSHIP.md`，並在 `docs/FRONTEND_MODULE_MAP.md` 加入索引；`stopDeviceHeartbeat`／`scheduleDeviceUnlock` 分別改名為 `stopHeartbeat`／`scheduleUnlock`，`grantAchievementReward` 保留為 progression factory 私有 helper。全部 42 個 JS 檔案 `node --check` exit 0；文件名稱覆蓋比對 212/212；`git diff --check` exit 0，兩份文件另做尾端空白檢查均無問題。此為靜態歸屬核對，不代表瀏覽器回歸或線上部署已驗證；任務狀態維持 `in_progress`。
- 2026-11-02 16:05 [老查] 完成固定週期 Timer 遷移：`script.js` 建立單一 `createTimerManager()`，並注入裝置鎖、造訪追蹤、天氣、寵物收益、全服加成、realm 投票及擲骰系統；入口的登入 heartbeat 與藥水到期檢查亦改由管理器註冊。所有固定／週期 `setInterval` 呼叫點改用具名 scope，原有間隔、callback 與啟動時機保留；裝置鎖 heartbeat、投票倒數及自動擲骰清除改走管理器，scope 名稱與管理器統計介面補入模組地圖。單次 `setTimeout` 暫不屬本階段。驗證結果見本次交付回報。
- 2026-11-02 16:12 [老查] Timer 遷移驗證完成：43 個 JavaScript 檔案 `node --check` 全數通過；43 個檔案、46 個相對 import 通過路徑存在與循環檢查；8 個模組 scope 的 timer integration smoke test 通過，涵蓋重複 setup 不重複建立 interval、模組清除、`clearScope` 與 `clearAll`；靜態搜尋確認 14 個應用 interval 註冊點均經 timer manager，無直接原生 `setInterval`／`clearInterval` 呼叫；`git diff --check` exit 0。瀏覽器互動回歸尚未執行，T-0016 維持 `in_progress`。
- 2026-11-02 16:12 [老查] 完成動態 Timer 遷移：將 toast、登入流程（延後登出／訪客紀錄／session 初始化／雲端載入逾時）、裝置鎖閒置釋放與 RPC 逾時、雲端同步 debounce／flush 等待、擲骰流程與揭示動畫、成就提示佇列、寵物自動出售提示、天氣特效及 realm 公告隱藏等一次性 Timer 全部改由共用 `timerManager` 管理；可重設提示保留 handle 並使用 `clearTimeout`，Auth／裝置鎖 Promise.race timeout 在競爭操作先完成時主動取消。固定週期 Timer 與動態 Timer 現已共用單一 registry，scope 已補入模組地圖。瀏覽器互動回歸仍未執行，T-0016 維持 `in_progress`。
- 2026-11-02 16:13 [老查] 動態 Timer 階段驗證完成：43 個 JS 檔案 `node --check` 全數通過；43 個檔案、46 個相對 import 通過路徑存在與循環檢查；Timer manager fake-clock smoke test 通過 timeout 自動註銷、明確取消、scope 清理及 `clearAll`；模組整合 smoke test 通過雲端同步 debounce 重設、寵物提示重設、realm 公告重設與集中清理。20 個應用 `timerManager.setTimeout` 註冊呼叫點均使用集中管理器，靜態搜尋確認應用程式無原生 `setTimeout`／`clearTimeout`／`setInterval`／`clearInterval` 直接呼叫；`git diff --check` exit 0。瀏覽器互動回歸尚未執行；工作區仍含既存修改，未 pull、commit 或 push；未呼叫子代理、未操作 Supabase，依任務規定免做 CSV 檢查。T-0016 維持 `in_progress`。
- 2026-11-02 16:20 [老查] 完成第四階段一次性 Timeout 生命週期整理：成就提示佇列加入 pending handoff handle，避免延遲切換期間新成就到達時舊 callback 再次消耗佇列；天氣特效被替換時同步取消舊 overlay 的移除 Timeout；cloud-save debounce 在觸發後立即清空 handle，直接執行同步前亦先取消待執行 debounce，避免重複同步；裝置鎖閒置 Timeout、Toast、寵物提示與 Realm 公告 Timeout 在 callback 執行後清空所持 handle。保留原延遲值、顯示行為及雲端呼叫契約，未改產品規則。
- 2026-11-02 16:20 [老查] 第四階段驗證：43 個 JS 檔案 `node --check` 全數通過；43 個檔案、46 個相對 import 路徑存在且無循環；fake timer 整合測試通過成就佇列競態、天氣特效替換、雲端 debounce 替換與觸發、寵物提示 handle 清理及 Realm 公告 handle 清理；`git diff --check` exit 0。原生 Timer 靜態搜尋與瀏覽器回歸將於最終檢查再次確認；T-0016 維持 `in_progress`。
- 2026-11-02 16:21 [老查] 最終檢查：43 個 JS 檔案 `node --check` 全數通過；43 個檔案、46 個相對 import 路徑存在且無循環；19 個 `timerManager.setTimeout` 註冊呼叫點，原生 `setTimeout`／`clearTimeout`／`setInterval`／`clearInterval` 應用程式直接呼叫 0；cloud-save 額外驗證 debounce 替換及直接同步前取消待執行 timeout；`git diff --check` exit 0。模組地圖已補充生命週期規則與測試結果。真實瀏覽器互動回歸仍未執行；T-0016 維持 `in_progress`。
- 2026-11-02 16:42 [老查] 完成第五階段生命週期防重入與回歸測試：Auth state listener 加入單次註冊保護並提供 unsubscribe；visit tracking、auto-roll、global boost、realm poll、codex、glove、potion 與 pet UI 的 setup/start 加入重複呼叫保護，避免重複掛載事件監聽或週期工作；visit tracking 另提供 stop，能移除 visibility listener 並清除 heartbeat scope。新增 `tests/lifecycle-regression.test.js`，使用 Node 內建 `node:test` 與 fake DOM/timer，涵蓋 Auth listener 註冊／解除、造訪追蹤啟停重啟、上述 UI 重複 setup、玩家天氣頻道隨帳號切換替換、全服公告頻道防重複，以及 timeout 觸發與 Timer manager `clearAll`。驗證：7/7 tests 通過；44 個 JS 檔案 `node --check` 全數通過；44 個檔案、58 個相對 import 路徑存在且無循環；原生 Timer 直接呼叫 0；`git diff --check` exit 0。此為 Node 假環境生命週期回歸，尚非真實瀏覽器、Supabase 登入／登出或 Realtime 實測；T-0016 維持 `in_progress`。
- 2026-11-02 16:47 [老查] 第五階段最終複核：重新執行 `node --test tests/lifecycle-regression.test.js`，7/7 通過；44 個 JS `node --check` 通過；import graph 44 檔／58 條相對 import、0 循環；原生 Timer 直接呼叫 0；`git diff --check` exit 0。工作分支仍為 `feat/server-authoritative-frontend`、HEAD `40d660c8743e5a98fbd363763098e9a98feb131b`、upstream `origin/main`；工作區有大量既存修改及未追蹤檔案，未 pull、commit、push。沒有瀏覽器自動化環境可供本輪執行，真實瀏覽器功能回歸及 GitHub Pages 驗證仍待執行，故不勾選瀏覽器驗收項，T-0016 維持 `in_progress`。
- 2026-11-02 17:18 [老查] 完成使用者主導的真實瀏覽器回歸：第一階段首頁初始化／模組載入 PASS；第二階段登入／登出與雲端模式 PASS；第三階段手動／自動擲骰及背包出售 PASS；第四階段手套、藥水與天氣 PASS；第五階段寵物、成就／每日任務及排行榜 PASS。管理員頁面因測試帳號沒有管理員權限，未能進入驗證，明確記為權限阻擋／未驗收，不列為 PASS。更新 `docs/FRONTEND_MODULE_MAP.md` 的實際行數及瀏覽器驗收狀態。最終驗證：44 個 JS 檔案 `node --check` 全數通過；import graph 44 檔／58 條相對 import，missing 0、cycles 0；`node --test tests/lifecycle-regression.test.js` 7/7 PASS；應用程式原生 Timer 直接呼叫 0；首頁、`script.js`、`favicon.ico` 本機 HTTP 200；`git diff --check` exit 0。Git 工作區仍含使用者既存修改與大量 untracked 檔案，未 pull、commit、push；未操作 Supabase、依任務規定免做 CSV 檢查。GitHub Pages、即時 Realtime 投遞及管理員頁面仍未驗證；T-0016 維持 `in_progress`，不代替 barry 送審或結案。
- 2026-11-02 17:28 [老查] 依 barry 指示將任務改為 `blocked`：管理員頁面需要管理員帳號權限才能驗收；GitHub Pages 線上部署版本尚未驗證；Supabase Realtime 實際事件投遞尚未驗證。這三項需棒子方權限或正式環境條件的驗證，依 `board/README.md` §1.4 交由棒子方開立 T-0017、由叉子實作並由棒子驗收。T-0016 須等待 T-0017 完成及棒子確認後，才由 barry 方恢復並進行最終驗收。老查無權代表叉子建立 owner_side 任務；目前尚待棒子方建立 T-0017。工作分支 `feat/server-authoritative-frontend`；本次未操作 Supabase，依任務規定免做 CSV 檢查。
- 2026-11-02 17:29 [老查] 將前端模組與 Board 文件提交為 `1575b19`（`refactor(frontend): split script into feature modules`），並成功推送至 `origin/feat/server-authoritative-frontend`。提交包含 `index.html`、`script.js`、前端模組、測試、文件及 Board；`style.css` 本次沒有內容差異，已由既有版本保留。staged 檔案檢查未包含 `supabase/` 或 CSV。此 push 只更新功能分支，沒有觸發或證明 GitHub Pages 部署；Pages 發佈來源及線上版本仍待確認，因此本任務維持 `blocked`。
