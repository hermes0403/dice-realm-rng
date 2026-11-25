---
id: T-0140
title: 公會設定依角色隱藏並加入退出二次確認
status: review
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-26
updated: 2026-11-26
depends_on: []
branch: task/T-0140-guild-member-settings-exit
done_by:
done_at:
---

## 任務

調整公會設定頁的角色可見內容，避免一般成員看到幹部專用設定／公告管理面板；將「退出公會」移入設定頁，並加入兩階段確認，避免誤觸或重複送出。

## 角色顯示與權限

- 會長：可看見並編輯 GUILD SETTINGS（公會名稱、介紹、加入方式）及 GUILD ANNOUNCEMENT（公告）。
- 副會長：可看見設定唯讀面板；可編輯公告；不得修改公會名稱、介紹或加入方式。
- 幹部：維持既有唯讀設定與公告面板，不擴張編輯權限。
- 一般成員（member）：設定頁完全隱藏 GUILD SETTINGS 與 GUILD ANNOUNCEMENT 兩個管理面板及其內容；設定頁只保留退出公會區塊。
- 公會首頁已發布的公告仍供所有公會成員閱讀，不因隱藏管理面板而消失。
- 前端隱藏只負責介面；所有既有 RPC 的伺服器權限檢查必須保留。

## 退出公會流程

- 將「退出公會」按鈕從公會首頁移至「公會設定」頁，所有非會長成員都能從設定頁找到。
- 會長不可直接退出；維持「需先轉讓會長或解散公會」的限制，不得留下沒有會長的公會。
- 非會長點擊退出後，先顯示第一階段確認；玩家選擇下一步後，再顯示最終確認，只有最終確認才呼叫既有 `guild_leave` RPC。
- 任一階段選擇取消都不得呼叫 RPC，也不得改變公會成員資料。
- 最終確認按鈕在請求期間停用；同一玩家的重複點擊不得重複送出離會請求。
- 成功退出後重新載入公會資料並導向尋找公會畫面；失敗時保留原公會狀態並顯示錯誤。
- 沿用既有資料庫鎖定、會長限制及 authenticated RPC，不新增輪詢、Realtime 或不必要的資料庫讀取。

## 驗收條件

- [x] 會長可編輯設定及公告。
- [x] 副會長只能編輯公告，不能修改基本設定。
- [x] 幹部維持唯讀面板。
- [x] 一般成員看不到 GUILD SETTINGS 與 GUILD ANNOUNCEMENT 管理面板，但首頁仍能閱讀已發布公告。
- [x] 退出公會按鈕只出現在設定頁，不再出現在公會首頁。
- [x] 非會長必須完成兩階段確認才會呼叫 `guild_leave`；取消任一步驟都不呼叫 RPC。
- [x] 最終確認期間重複點擊不會產生第二次 RPC。
- [x] 會長無法直接退出；伺服器仍拒絕會長離會。
- [x] 成功退出後回到尋找公會畫面，重新載入後成員狀態正確。
- [x] 既有公會設定、公告、成員管理、任務、排行榜及手機版 UI 回歸測試通過。
- [x] JavaScript 語法檢查、`git diff --check` 及相關 Node 測試通過。

## 紀錄

- 2026-11-26 [叉子] 依棒子先前確認的角色矩陣建立任務。開工前重新檢查最新 main：owner_side 有效 in_progress 任務 0/5；目前 in_progress 任務只有 collaborator_side 的 T-0002、T-0038；Communicate 優先搜尋未發現有效任務。開單 PR #363 已合併，狀態由 open 轉為 in_progress。T-0133、T-0135 已在 review，本任務只調整前端角色可見性與離會互動，不重做既有設定／公告 RPC。
- 2026-11-26 [叉子] 交付 PR #364 已合併，merge commit `69bf4d3df00bba6a418b7f70ddcf7c01ff5a44f7`；GitHub Pages 部署 run #45714114034 成功，版本 V1.58。

## 完工回報

### 改了什麼

- 一般成員設定頁隱藏 GUILD SETTINGS 與 GUILD ANNOUNCEMENT 管理面板，僅顯示退出公會區塊；公會首頁公告仍對所有成員可見。
- 會長保留基本設定及公告編輯權；副會長只可編輯公告；幹部維持唯讀。
- 退出公會按鈕移至設定頁；非會長需經兩階段確認，最終送出期間停用按鈕並以 busy guard 阻擋重複 RPC；會長仍由既有資料庫函式拒絕直接退出。
- 沿用既有 `guild_leave` RPC 和資料庫鎖定，沒有新增 migration、輪詢、Realtime 或額外資料讀取。
- 更新 guild 模組、CSS、Service Worker 與 PWA shell 快取版本至 V1.58／v2.29。

### 怎麼驗證的

- 交付 PR #364 合併成功，merge commit：`69bf4d3df00bba6a418b7f70ddcf7c01ff5a44f7`。
- 最新 head 的 18 項 GitHub Actions 檢查全部成功。
- PWA display tests 確認三項新案例已執行：一般成員面板隱藏、首頁公告仍可見、退出按鈕位置與兩階段確認。
- Cloud Save regression workflow 完整 Node 測試：182 passed、0 failed。
- `node --check`、`git diff --check` 及 Board lifecycle validation 均通過。
- GitHub Pages 部署 run `45714114034` 成功；版本 V1.58。

### 沒做／做不到的

- 尚未在實際瀏覽器以不同公會角色帳號逐一手動點擊驗收；目前以角色矩陣靜態測試、既有權限測試及完整回歸測試驗證。請 Owner 驗收正式頁面顯示與實際離會流程；若有差異退回 `in_progress`。

### 衍生任務

- 無。
