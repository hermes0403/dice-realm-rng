---
id: T-0073
title: 鎖定按鈕狀態、星號尺寸與融合保護
status: done
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-12
updated: 2026-11-20
depends_on: [T-0072]
branch: task/T-0073-lock-button-and-fusion-guard
done_by: 棒子
done_at: 2026-11-20
---

## 需求
- 未啟用鎖定模式時按鈕顯示「鎖定」；啟用後顯示「解除鎖定」。
- 星號尺寸與骰子右上角編號相同。
- 有星號的骰子不可出售，也不可投入寵物融合；解除鎖定後才可使用。
- 出售或融合未鎖定骰子時，鎖定骰子必須保留，且鎖定標記需跟隨原本骰子。
- 不改動其他融合機率與玩法。


## Owner 驗收結案紀錄

- 2026-11-20 [棒子] 驗收：棒子確認本任務完成並正式結案。來源：https://github.com/hermes0403/dice-realm-rng/pull/54（已於 2026-11-12 合併，涵蓋鎖定按鈕文字、星號尺寸、出售／融合保護及鎖定索引保留）；正式環境部署由 https://github.com/hermes0403/dice-realm-rng/actions/runs/44683464270（main Pages deployment success）確認。
