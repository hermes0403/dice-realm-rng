---
id: T-0077
title: 修復翡翠綠主題全站文字可讀性
status: in_progress
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-12
updated: 2026-11-12
depends_on: [T-0076]
branch: task/T-0077-restore-text-contrast
done_by:
done_at:
---

## 需求
- 修正翡翠綠深色背景下文字與背景同樣偏暗、導致看不見的問題。
- 全站標題、一般文字、次要說明、導覽、卡片與管理面板文字改為清楚的淺色。
- 保留綠色背景、按鈕狀態辨識、輸入框淺底深字與黃色鎖定星星。
- 更新 CSS 快取版本與遊戲版本至 V1.04。

## 驗收
- [ ] 全站主要文字與說明文字清楚可讀。
- [ ] 輸入框文字及 placeholder 清楚可讀。
- [ ] 黃色鎖定星星與主要／危險按鈕辨識色保留。
- [ ] CI 與 Pages 部署成功。

- 2026-11-14 [impact][叉子] T-0088 將為各說明型面板恢復差異化背景與邊框；需保留本任務要求的高對比文字，並逐一檢查新底色上的文字可讀性。
