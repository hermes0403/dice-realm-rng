---
id: T-0079
title: 強制保留骰子個別顏色
status: in_progress
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-12
updated: 2026-11-12
depends_on: [T-0078]
branch: task/T-0079-force-dice-colors
done_by:
done_at:
---

## 需求
- 修正全站文字對比規則覆蓋骰子個別顏色的問題。
- 背包骰子機率、圖示與名稱依骰子原本稀有度／天氣顏色顯示。
- 自動出售與自動存入的機率粗體及名稱繼承骰子個別顏色。
- 圖鑑已發現骰子的機率、名稱與圖示恢復原色；未發現項目維持灰色，萬聖節骰子維持橘色。
- 更新 CSS 快取版本與遊戲版本至 V1.06。

## 驗收
- [ ] 背包骰子名稱、圖示與機率顯示各自顏色。
- [ ] 自動出售／自動存入的機率與名稱顯示各自顏色。
- [ ] 圖鑑骰子名稱、圖示與機率顯示各自顏色。
- [ ] CI 與 Pages 部署成功。
