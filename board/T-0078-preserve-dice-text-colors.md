---
id: T-0078
title: 保留背包、自動出售與圖鑑骰子個別文字顏色
status: in_progress
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-12
updated: 2026-11-12
depends_on: [T-0077]
branch: task/T-0078-preserve-dice-text-colors
done_by:
done_at:
---

## 需求
- 背包骰子格、個別自動出售／自動存入選項保留每顆骰子原有的稀有度與天氣顏色。
- 圖鑑骰子項目保留原有個別稀有度、天氣與萬聖節文字顏色。
- 全站一般介面文字仍維持 T-0077 的高對比可讀性。
- 更新 CSS 快取版本與遊戲版本至 V1.05。

## 驗收
- [ ] 背包個別骰子名稱、圖示與機率文字恢復各自顏色。
- [ ] 自動出售／自動存入選項保留骰子個別顏色。
- [ ] 圖鑑骰子顏色維持原設定，統計次要文字仍可讀。
- [ ] CI 與 Pages 部署成功。
