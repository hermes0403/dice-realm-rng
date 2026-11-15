---
id: T-0078
title: 保留背包、自動出售與圖鑑骰子個別文字顏色
status: done
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-12
updated: 2026-11-14
depends_on: [T-0077]
branch: task/T-0078-preserve-dice-text-colors
done_by: 棒子
done_at: 2026-11-14
---

## 需求
- 背包骰子格、個別自動出售／自動存入選項保留每顆骰子原有的稀有度與天氣顏色。
- 圖鑑骰子項目保留原有個別稀有度、天氣與萬聖節文字顏色。
- 全站一般介面文字仍維持 T-0077 的高對比可讀性。
- 更新 CSS 快取版本與遊戲版本至 V1.05。

## 驗收
- [x] 背包個別骰子名稱、圖示與機率文字恢復各自顏色。
- [x] 自動出售／自動存入選項保留骰子個別顏色。
- [x] 圖鑑骰子顏色維持原設定，統計次要文字仍可讀。
- [x] CI 與 Pages 部署成功。


## 完工回報
- **交付內容：**背包、自動出售／自動存入及圖鑑保留骰子個別稀有度、天氣與萬聖節顏色。
- **程式交付：**PR #61，merge commit `9a44f0b750a35b6af38184afe3bf063f5f99a074`。
- **驗證：**build、deploy、report-build-status、board-lifecycle、dice-roll-save 全部 success；Pages deploy workflow #43210964957 成功。
- **未完成項目：**無；棒子已於 2026-11-14 明確驗收。
- **影響任務：**T-0079、T-0080 後續補強已交付。

## 紀錄
- 2026-11-12 [叉子] in_progress → review：程式交付完成，PR #61 已合併，CI 與 Pages 部署成功。證據：merge commit `9a44f0b750a35b6af38184afe3bf063f5f99a074`；deploy workflow #43210964957。
- 2026-11-14 [棒子] review → done：棒子明確表示 T-0075～T-0080 全部驗收成功，包含本任務。來源：本對話 2026-11-14 的明確驗收指示。證據：棒子訊息「75~80全部驗收成工」。
