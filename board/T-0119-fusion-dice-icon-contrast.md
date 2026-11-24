---
id: T-0119
title: 融合機骰子圖案對比度修正
status: in_progress
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-21
updated: 2026-11-24
depends_on: []
branch:
done_by:
done_at:
---

## 問題
融合機「合成材料」中的 DICE SLOT A / B 骰子符號顏色過暗，難以辨識。

## 修改
- 僅調整融合機兩個骰子預覽框的符號顯示。
- 提高符號亮度、尺寸與對比，增加藍色光暈及深色底板。
- 保留原本骰子符號與合成邏輯，不修改持有數量、機率或消耗行為。
- 更新 CSS 查詢版本與 Service Worker 快取版本。

## 驗收
- [ ] 手機版兩個槽位的骰子符號清楚可辨。
- [ ] 桌面版兩個槽位的骰子符號清楚可辨。
- [ ] 選擇不同骰子後，預覽符號正常更新。
- [ ] 合成機率、數量與消耗邏輯不受影響。
