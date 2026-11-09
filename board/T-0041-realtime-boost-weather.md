---
id: T-0041
title: 降低全服加成與天氣狀態輪詢流量並保留即時顯示
status: review
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-09
updated: 2026-11-09
depends_on: []
branch: work/chazi
done_by:
done_at:
---

## 任務

降低全服加成與全服／個人天氣狀態的重複雲端查詢。以 Supabase Realtime 接收狀態變更，並保留低頻備援同步，確保既有遊戲觸發、運氣／速度效果、天氣種類、特殊天氣時長、管理員活動卡片、個人天氣提示及倒數顯示不變。

## 範圍與禁止

- 只修改全服加成與天氣狀態的訂閱／輪詢生命週期、必要初始化接線、回歸測試及 Board 紀錄。
- 不改動加成數值、有效期限、管理員操作、天氣機率、召喚條件、天氣效果、存檔格式或天氣投入／召喚 RPC。
- Realtime 作為即時更新來源；保留 5 分鐘備援讀取，處理漏事件、連線失敗或訂閱中斷。
- 保留倒數與活動卡片的本地畫面更新；不得以降低畫面更新頻率換取流量節省。
- 不修改 main，不部署 GitHub Pages，不清理或改寫其他分支。

## 驗收條件

- [x] 全服加成不再每 3 秒查詢；Realtime 更新後仍立即更新運氣／速度計算、擲骰自動間隔及管理員活動顯示。
- [x] 全服天氣與個人天氣不再每 12 秒查詢；Realtime 變更後立即更新原有天氣效果、公告／提示與畫面。
- [x] 全服加成與天氣均保留低頻備援讀取；Realtime 失敗時不會永久停止同步。
- [x] 原本 1 秒倒數／活動顯示、天氣場景效果、特殊天氣與個人天氣功能不變（以回歸測試確認原有更新 timer／觸發路徑仍存在；正式瀏覽器仍待 Owner 驗收）。
- [x] 新增測試涵蓋 Realtime 事件更新、輪詢間隔及連線錯誤後備援；相關回歸測試 18/18 通過。
- [x] 未修改 Supabase schema、資料或資料表權限；只將既有公開可讀的 realm_global_boost 加入 supabase_realtime publication；未部署 GitHub Pages。

## 紀錄

- 2026-11-09 09:03 [叉子] 依棒子指示接手；以既有 owner_side 個人分支 work/chazi 作業，不建立新分支、不修改 main。先盤點全服加成每 3 秒查詢、天氣與個人天氣每 12 秒查詢的程式路徑，保留原有效果與 UI 更新節奏。
- 2026-11-09 09:12 [叉子] 完成前端 Realtime 訂閱與低頻備援：全服加成改為 Realtime + 5 分鐘備援；全服天氣加入 Realtime；個人天氣沿用原有 Realtime；天氣共用備援改為 5 分鐘。倒數／活動卡片／天氣場景仍維持原本 1 秒本地更新。已將 realm_global_boost 加入 Supabase supabase_realtime publication；查核確認 realm_global_boost、realm_weather_state、player_weather_overrides 均在 publication，且全服加成既有 RLS SELECT policy 仍允許 anon／authenticated 讀取。
- 2026-11-09 09:12 [叉子] GitHub Actions run #49（run ID 42544347642）執行 `node --test tests/global-coin-boost-activity.test.js tests/admin-coin-boost-ui.test.js tests/realtime-state-refresh.test.js tests/lifecycle-regression.test.js`，18/18 pass、0 fail。另曾執行全庫 `node --test tests/*.test.js`，其中 2 個 cloud-save-pet-authority 測項失敗（本任務未修改該服務與測試）；未擴大修改範圍。未執行正式瀏覽器多人即時測試，待棒子驗收。

## 完工回報

### 改了什麼

- `systems/global-boost.js`：全服加成改由 `realm_global_boost` Realtime 事件即時更新；5 分鐘查詢作為漏事件／連線故障備援。原有狀態變更後 render、restartAutoInterval、管理員狀態顯示保留；1 秒本地倒數與活動卡片刷新保留。
- `systems/weather.js`：新增 `realm_weather_state` Realtime 訂閱；個人天氣沿用既有 Realtime 訂閱；兩者由原本每 12 秒查詢改為 5 分鐘備援。天氣種類、召喚結果、公告／提示、場景效果、1 秒倒數與天氣投入／召喚流程未改。
- `script.js`：初始化全服天氣 Realtime 訂閱。
- `tests/realtime-state-refresh.test.js`：新增 Realtime 狀態套用、輪詢頻率、斷線狀態觸發補讀測試。
- `.github/workflows/coin-boost-tests.yml`：將本次相關測試納入 work/chazi 自動回歸。
- Supabase 專案 `pkdctcfifauygnjipmab`：只將既有 `public.realm_global_boost` 加入 `supabase_realtime` publication；未修改資料、schema、RLS policy 或資料表 grants。

### 怎麼驗證的

- Supabase SQL 查核：三張表 `realm_global_boost`、`realm_weather_state`、`player_weather_overrides` 均已列於 `supabase_realtime` publication。
- Supabase SQL 查核：`realm_global_boost` 的 RLS 為 enabled，既有 SELECT policy 為 `anon, authenticated` 且條件為 true；其 singleton 欄位有 primary key，符合 Postgres Changes 訂閱需求。
- GitHub Actions run #49（ID `42544347642`）：`node --test tests/global-coin-boost-activity.test.js tests/admin-coin-boost-ui.test.js tests/realtime-state-refresh.test.js tests/lifecycle-regression.test.js`，18 tests、18 pass、0 fail。
- 全庫 `node --test tests/*.test.js` 曾執行，但有 2 個 `cloud-save-pet-authority.test.js` 測項失敗（本任務未修改該服務／測試）；相關回歸測試 18/18 通過。
- GitHub compare：work/chazi 相對本次作業起點 `8e0f0c5` 僅新增／修改本任務 7 個檔案，未修改 main。

### 沒做／做不到的

- 尚未在正式 GitHub Pages 以多個真實玩家帳號驗證 Realtime 事件端到端傳遞、實際加成效果及天氣提示；目前以單元測試與 Supabase publication／RLS 查核驗證，待棒子驗收。
- 尚未部署 GitHub Pages；玩家目前尚未使用這次前端節流更新。
- 尚未量測部署後 Egress 實際下降 MB 數；需部署後依成功請求流量比較。
- 全庫測試中 2 個 cloud-save 測項失敗，屬本任務範圍外，需另行處理。

### 衍生任務／影響任務

- 無。
