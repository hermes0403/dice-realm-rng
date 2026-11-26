---
id: T-0146
title: 修正登入初始化的暫時性死區錯誤
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P0
created: 2026-11-26
updated: 2026-11-26
depends_on: [T-0145]
branch: fix/T-0146-auth-temporal-dead-zone
done_by:
done_at:
---

## 任務

T-0145 將認證服務初始化移至前段時，沒有同步移動 `let authService=null` 宣告，造成 ES Module 暫時性死區錯誤；同時在認證服務建立時直接讀取尚未初始化的 `refreshLeaderboards`。因此 script.js 在模組執行期間拋出 ReferenceError，後續所有程式（包括登入按鈕綁定）都不會執行。

## 範圍與禁止

- 只修正認證服務初始化的變數宣告順序與延遲依賴。
- 不修改玩家帳號、密碼、存檔、Supabase 正式資料或遊戲機制。
- 新增回歸測試，明確防止 TDZ 再發生。

## 驗收條件

- [ ] authService 宣告位於第一次賦值之前。
- [ ] refreshLeaderboards 以延遲函式提供，避免建立服務時提前讀取。
- [ ] 認證與既有回歸測試通過。
- [ ] GitHub Pages 部署成功。
- [ ] 使用者實際手機端登入按鈕驗收。

## 紀錄

- 2026-11-26 [叉子] 確認 T-0145 的認證服務賦值位於 let authService=null 宣告之前，並提前讀取尚未初始化的 refreshLeaderboards，造成模組執行中止。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的
