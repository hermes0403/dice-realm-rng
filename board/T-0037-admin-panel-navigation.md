---
id: T-0037
title: 整理管理員面板導覽與功能分區
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-05
updated: 2026-11-05
depends_on: []
branch: task/T-0037-admin-panel-navigation-v2
done_by:
done_at:
---

## 任務
重新整理管理員面板，改善功能分區、搜尋、分類切換及手機版操作。

## 範圍與禁止
- 僅修改管理員面板相關前端結構、樣式、導覽程式、測試及本任務紀錄。
- 分為常用操作、玩家管理、經濟與獎勵、寵物管理、天氣與活動、數據監控、紀錄與安全。
- 加入功能搜尋及分類篩選。
- 保留所有既有功能、DOM ID、事件處理、權限檢查及後端呼叫契約。
- 不修改資料庫結構、RPC、Edge Functions、經濟規則或玩家存檔。
- 不修改 main、work/chazi、work/laocha；保留舊 work/chazi 及舊任務分支。

## 驗收條件
- [ ] 所有原有管理功能均可找到且正常使用。
- [ ] 常用操作入口正常呼叫原有功能。
- [ ] 搜尋、清除搜尋、分類切換及全部分類正常。
- [ ] 桌面與手機版排版正常，無水平溢出或控制項重疊。
- [ ] 既有 ID、handler、權限及後端呼叫契約不變。
- [ ] 專項測試及相關回歸測試通過。
- [ ] git diff --check 通過。

## 紀錄
- 2026-11-05 [叉子] 棒子表示 Barry 已同意建立替代角色整合分支。為保留歷史，舊 work/chazi 與舊 task/T-0037-admin-panel-navigation 均不修改；以 main 建立 work/chazi-v2，再由其建立本任務分支。
- 2026-11-05 [叉子] 接手任務，先盤點 main 的管理員面板結構及既有功能，再開始前端整理。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
