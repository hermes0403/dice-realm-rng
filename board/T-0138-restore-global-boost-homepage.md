---
id: T-0138
title: 修復主頁管理員全服加成活動卡片消失
status: in_progress
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-25
updated: 2026-11-25
depends_on: []
branch: task/T-0138-restore-global-boost-homepage
done_by:
done_at:
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

- [ ] 頁面沒有 `#realmHeroWelcome`、但有 `#realmAdminActivity` 時，活動面板仍能正常顯示。
- [ ] 全服運氣、速度、融合運氣、金錢倍率各卡片仍可正常渲染。
- [ ] 沒有有效加成時，活動面板隱藏並清空。
- [ ] 若頁面存在 `#realmHeroWelcome`，其原有顯示切換行為維持不變。
- [ ] 不修改加成計算、觸發、資料庫及同步行為。
- [ ] 回歸測試、語法檢查及 GitHub Pages 部署成功。

## 紀錄

- 2026-11-25 22:17 [叉子] 開工：最新 main 的 T-0136 紀錄確認 owner_side in_progress 容量為 0/5，且 Communicate 優先閘門未發現有效鎖定；T-0137 ID 已由既有公開任務分支占用，因此本任務使用 T-0138。Task branch 由 main 建立，僅處理主頁全服加成顯示回歸。
