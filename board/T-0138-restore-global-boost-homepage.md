---
id: T-0138
title: 修復主頁管理員全服加成活動卡片消失
status: done
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-25
updated: 2026-11-26
depends_on: []
branch: task/T-0138-restore-global-boost-homepage
done_by: 棒子
done_at: 2026-11-26
---

## 任務

修復管理員啟用全服加成後，主頁未顯示管理員活動卡片的問題。保留現有全服運氣、速度、融合運氣及金錢倍率的計算、同步、觸發與卡片內容。

## 根因

目前 `index.html` 已沒有 `#realmHeroWelcome`，但 `systems/global-boost.js` 的 `renderRealmActivity()` 在同時找不到 `#realmHeroWelcome` 或 `#realmAdminActivity` 時直接 return，造成管理員活動面板完全不更新。

## 範圍與禁止

- 只修正主頁活動卡片渲染對已移除 welcome 元素的依賴。
- 保留 `#realmAdminActivity` 作為必要渲染容器。
- 若舊版頁面仍有 `#realmHeroWelcome`，保留其隱藏／顯示行為；元素不存在時不應阻止活動面板渲染。
- 不修改全服加成計算、資料庫、RPC、Realtime、輪詢頻率或管理員權限。
- 更新前端快取版本，避免玩家持續載入舊模組。

## 驗收條件

- [x] 頁面沒有 `#realmHeroWelcome`、但有 `#realmAdminActivity` 時，活動面板仍能正常顯示。
- [x] 全服運氣、速度、融合運氣、金錢倍率各卡片仍可正常渲染。
- [x] 沒有有效加成時，活動面板隱藏並清空。
- [x] 若頁面存在 `#realmHeroWelcome`，其原有顯示切換行為維持不變。
- [x] 不修改加成計算、觸發、資料庫及同步行為。
- [x] 回歸測試、語法檢查及 GitHub Pages 部署成功。

## 紀錄

- 2026-11-25 22:17 [叉子] 開工：最新 main 的 T-0136 紀錄確認 owner_side in_progress 容量為 0/5，且 Communicate 優先閘門未發現有效鎖定；T-0137 ID 已由既有公開任務分支占用，因此本任務使用 T-0138。Task branch 由 main 建立，僅處理主頁全服加成顯示回歸。

- 2026-11-26 [棒子] 驗收：棒子於本次對話明確確認先前列出的八項任務「全部我驗收過了 成功」，並確認可繼續進行公會功能；本任務驗收通過。來源：棒子於 2026-11-26 本次對話的明確驗收回覆。證據：本次對話紀錄，使用者明確確認八項任務全部成功。

## 完工回報

### 改了什麼
- `systems/global-boost.js`：只要求 `#realmAdminActivity` 存在；`#realmHeroWelcome` 改為可選節點，若存在仍維持原本隱藏／顯示行為。
- `index.html`、`sw.js`：將 script.js 查詢版本更新為 `20261125-t0138-global-boost-homepage`，Service Worker cache 更新為 `dice-realm-shell-v2.27`。
- 新增 `tests/global-boost-homepage-render.test.mjs`，並讓 PWA workflow 執行此回歸測試。
- 更新既有 PWA／公會資產版本測試，分別檢查 script.js 與 guild assets 的版本，避免版本號互相綁定。
- PR #356（程式修正）及 PR #357（測試與 Board 修正）均已合併。

### 怎麼驗證的
- 全服加成首頁回歸測試：PWA display workflow run `45633777863` 成功；新增測試納入該 workflow 的 node --test 指令。
- PWA display、Board lifecycle、Dice roll save、Cloud save rollback、Coin boost、Achievement persistence、Weather and announcement workflows 均成功；最新主線 push 的 Board、Dice roll save、Cloud save rollback workflows 分別為 `45633879613`、`45633879616`、`45633879589`，均 success。
- GitHub Pages run `45633878040`：build、deploy、report-build-status 全部 success。
- 未修改 Supabase、RPC、Realtime、全服加成計算或觸發邏輯。

### 沒做／做不到的
- 尚未使用管理員正式帳號在實際手機瀏覽器確認加成卡片畫面；自動化回歸與 Pages 部署已通過，仍待棒子實機驗收。

### 衍生任務／影響任務
- 無。
