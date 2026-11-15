---
id: T-0077
title: 修復翡翠綠主題全站文字可讀性
status: done
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-12
updated: 2026-11-14
depends_on: [T-0076]
branch: task/T-0077-restore-text-contrast
done_by: 棒子
done_at: 2026-11-14
---

## 需求
- 修正翡翠綠深色背景下文字與背景同樣偏暗、導致看不見的問題。
- 全站標題、一般文字、次要說明、導覽、卡片與管理面板文字改為清楚的淺色。
- 保留綠色背景、按鈕狀態辨識、輸入框淺底深字與黃色鎖定星星。
- 更新 CSS 快取版本與遊戲版本至 V1.04。

## 驗收
- [x] 全站主要文字與說明文字清楚可讀（棒子已驗收）。
- [x] 輸入框文字及 placeholder 清楚可讀（棒子已驗收）。
- [x] 黃色鎖定星星與主要／危險按鈕辨識色保留（棒子已驗收）。
- [x] CI 與 Pages 部署成功（PR #60 checks 全數成功）。

- 2026-11-14 [impact][叉子] T-0088 將為各說明型面板恢復差異化背景與邊框；需保留本任務要求的高對比文字，並逐一檢查新底色上的文字可讀性。


## 完工回報
- **交付內容：**翡翠綠主題全站文字對比修正，保留輸入框淺底深字、按鈕辨識色及黃色鎖定星星。
- **程式交付：**PR #60，merge commit `c357f000ad3d082c14cfb26e6552607e97d01c69`。
- **驗證：**deploy、report-build-status、build、board-lifecycle、dice-roll-save 全部 success；GitHub Pages 部署 workflow #43210437637 成功。
- **未完成項目：**無；棒子已於 2026-11-14 明確驗收。
- **影響任務：**T-0078、T-0079、T-0080 已接續完成。

## 紀錄
- 2026-11-14 [叉子] in_progress → review：程式交付與部署完成，等待 Owner 驗收。來源：PR #60。證據：merge commit `c357f000ad3d082c14cfb26e6552607e97d01c69`，Pages workflow #43210437637 success。
- 2026-11-14 [棒子] review → done：棒子明確表示 T-0075～T-0080 全部驗收成功，包含本任務。來源：本對話 2026-11-14 的明確驗收指示。證據：棒子訊息「75~80全部驗收成工」。
