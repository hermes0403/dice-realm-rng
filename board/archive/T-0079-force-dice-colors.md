---
id: T-0079
title: 強制保留骰子個別顏色
status: done
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-12
updated: 2026-11-14
depends_on: [T-0078]
branch: task/T-0079-force-dice-colors
done_by: 棒子
done_at: 2026-11-14
---

## 需求
- 修正全站文字對比規則覆蓋骰子個別顏色的問題。
- 背包骰子機率、圖示與名稱依骰子原本稀有度／天氣顏色顯示。
- 自動出售與自動存入的機率粗體及名稱繼承骰子個別顏色。
- 圖鑑已發現骰子的機率、名稱與圖示恢復原色；未發現項目維持灰色，萬聖節骰子維持橘色。
- 更新 CSS 快取版本與遊戲版本至 V1.06。

## 驗收
- [x] 背包骰子名稱、圖示與機率顯示各自顏色。
- [x] 自動出售／自動存入的機率與名稱顯示各自顏色。
- [x] 圖鑑骰子名稱、圖示與機率顯示各自顏色。
- [x] CI 與 Pages 部署成功。


## 完工回報
- **交付內容：**背包骰子、圖鑑、自動出售與自動存入的名稱、圖示及機率文字依骰子個別稀有度／天氣顏色顯示；未發現項目維持灰色，萬聖節骰子維持橘色。
- **程式交付：**PR #62，merge commit `1bba26c81b65867a88259087bbcdeae5686549ba`。
- **驗證：**build、deploy、report-build-status、board-lifecycle、dice-roll-save 全部 success；Pages deploy workflow #43212272774 成功。
- **未完成項目：**無；棒子已於 2026-11-14 明確驗收。
- **影響任務：**T-0080 延續恢復天氣、萬聖節與寵物品質色彩。

## 紀錄
- 2026-11-12 [叉子] in_progress → review：程式交付完成，PR #62 已合併，CI 與 Pages 部署成功。證據：merge commit `1bba26c81b65867a88259087bbcdeae5686549ba`；deploy workflow #43212272774。
- 2026-11-14 [棒子] review → done：棒子明確表示 T-0075～T-0080 全部驗收成功，包含本任務。來源：本對話 2026-11-14 的明確驗收指示。證據：棒子訊息「75~80全部驗收成工」。
