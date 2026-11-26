---
id: T-0145
title: 將登入初始化移至遊戲介面初始化之前
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-26
updated: 2026-11-26
depends_on: []
branch: fix/T-0145-auth-bootstrap-before-ui
done_by:
done_at:
---

## 任務

登入視窗能正常顯示，但登入、註冊按鈕完全沒有反應。前一版雖將事件綁定提前，仍放在多個遊戲 UI 初始化之後；若其中任何初始化拋出錯誤，登入按鈕事件仍不會安裝。本任務將認證服務建立、按鈕事件綁定及登入狀態監聽移至核心狀態初始化後、其他可選遊戲 UI 初始化前，並修正 Service Worker 預載的腳本版本。

## 範圍與禁止

- 只動：`script.js`、`index.html`、`sw.js`、必要的認證回歸測試。
- 不要動：玩家存檔、帳號資料、Supabase 資料表、RLS、Edge Function、玩家密碼及其他遊戲機制。
- 延遲依賴以安全包裝器呼叫，避免認證服務建立時讀取尚未初始化的 UI 模組。
- 登入按鈕綁定使用可空安全的事件註冊，避免單一缺少元素造成整段初始化中止。

## 驗收條件

- [ ] 認證服務及登入控制事件在可選遊戲 UI 初始化之前完成建立。
- [ ] 登入、建立帳號、帳號建立返回、密碼復原及重試雲端載入按鈕都有事件處理器。
- [ ] 後續非認證 UI 初始化失敗時，認證控制仍可操作。
- [ ] index.html 與 sw.js 的 script.js 版本完全一致，Service Worker cache 版本同步更新。
- [ ] 認證流程既有測試通過，新增啟動順序回歸測試。
- [ ] 不修改任何玩家資料或 Supabase 正式環境。

## 紀錄

- 2026-11-26 16:11 [叉子] 開始修正。確認 T-0144 只把事件綁定移到 authService 建立後，仍位於多個 UI 初始化之後；另發現 sw.js 預載仍指向 T-0142 的 script.js query，與 index.html 不一致。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
