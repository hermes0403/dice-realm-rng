---
id: T-0077
title: 修復翡翠綠主題全站文字可讀性
status: review
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
done_by:
done_at:
---

## 需求
- 修正翡翠綠深色背景下文字與背景同樣偏暗、導致看不見的問題。
- 全站標題、一般文字、次要說明、導覽、卡片與管理面板文字改為清楚的淺色。
- 保留綠色背景、按鈕狀態辨識、輸入框淺底深字與黃色鎖定星星。
- 更新 CSS 快取版本與遊戲版本至 V1.04。

## 驗收
- [x] 全站主要文字與說明文字清楚可讀（程式變更已交付，待棒子實際畫面驗收）。
- [x] 輸入框文字及 placeholder 清楚可讀（程式變更已交付，待棒子實際畫面驗收）。
- [x] 黃色鎖定星星與主要／危險按鈕辨識色保留（程式變更已交付，待棒子實際畫面驗收）。
- [x] CI 與 Pages 部署成功。

## 完工回報
- **修改內容：** `style.css` 提升翡翠綠深色背景上的標題、一般文字、次要說明、導覽與管理面板文字對比；保留輸入框淺底深字、按鈕辨識色與黃色鎖定星星；`index.html` 更新 CSS 快取鍵與遊戲版本至 V1.04。
- **交付：** PR #60 已合併，merge commit `c357f000ad3d082c14cfb26e6552607e97d01c69`。
- **驗證：** Board lifecycle validation #43210437426 成功；Dice roll save regression tests #43210437419 成功；GitHub Pages build and deployment #43210437637 成功。
- **未完成／限制：** 尚待棒子確認實際遊戲畫面中文字對比、placeholder、管理面板及星星辨識效果；叉子未自行進行實體手機截圖驗收。
- **衍生／影響任務：** T-0078、T-0079、T-0080 為後續個別骰子／圖鑑文字顏色保留任務。

## 紀錄
- 2026-11-14 10:17 [叉子] 狀態由 in_progress 轉為 review；PR #60 已合併，程式與快取版本 V1.04 已整合至 main，Pages 部署及相關 CI 成功，等待棒子進行 Owner 視覺驗收。證據：PR #60 merge commit `c357f000ad3d082c14cfb26e6552607e97d01c69`；Pages workflow #43210437637 success；Board lifecycle #43210437426 success；Dice roll save regression #43210437419 success。
