---
id: T-0024
title: 新增管理員限定鯊鯊天氣與全服擲骰速度加成
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-06
updated: 2026-11-06
depends_on: []
branch: work/chazi
done_by: 棒子
done_at:
---

## 任務

新增「🦈鯊鯊天氣」，由管理員透過全服天氣控制施放；天氣生效期間所有玩家擲骰速度增加 100%，天氣結束後恢復原本速度。

## 範圍與禁止

- 只動：天氣設定、全服天氣資料庫允許值、管理員全服天氣選單與確認文字、擲骰速度計算。
- 不要動：指定玩家天氣權限、其他天氣效果、玩家存檔與既有天氣召喚機率。
- 前端只提交至 work/chazi；不得直接修改 main 或宣稱 GitHub Pages 已部署。

## 驗收條件

- [x] 管理員全服天氣選單可選擇 🦈鯊鯊天氣。
- [x] 資料庫全服天氣欄位與管理員 RPC 接受 shark。
- [x] 鯊鯊天氣期間所有玩家速度增加 100%，包含原有速度已達 500% 上限者仍額外獲得 100%。
- [x] 天氣到期後速度加成自動消失。
- [x] 指定玩家天氣介面不提供鯊鯊天氣。
- [ ] 在正式 GitHub Pages 版本完成整合及實際遊戲驗收。

## 紀錄

- 2026-11-06 06:53 [叉子] 接手棒子提出的鯊鯊天氣需求，確認沿用既有全服管理員天氣 RPC 與 1–1440 分鐘時長控制。
- 2026-11-06 07:10 [叉子] 已修改 config.js、systems/weather.js、systems/dice.js、index.html、admin/ui-bindings.js、script.js；全服天氣狀態加入 shark，速度計算固定額外增加 100 個百分點。修改提交於 work/chazi。
- 2026-11-06 07:10 [叉子] 已更新正式 Supabase realm_weather_state 天氣類型 CHECK constraint，並更新 admin_set_realm_weather_pair RPC 的允許清單；SQL 查詢確認 constraint 包含 shark，RPC 定義包含 shark。
- 2026-11-06 07:10 [叉子] 尚未部署 GitHub Pages。main 與 work/chazi 分歧，禁止直接整支合併；等待棒子決定後續整合與驗收。

## 完工回報

### 改了什麼

- config.js：新增 🦈鯊鯊天氣定義。
- systems/weather.js：全服天氣同步可識別 shark，並在到期時清除狀態樣式。
- systems/dice.js、script.js：鯊鯊天氣期間全體玩家擲骰速度額外 +100%。
- index.html、admin/ui-bindings.js：管理員全服天氣控制加入選項與顯示名稱。
- Supabase：更新全服天氣 CHECK constraint 與管理員 RPC 允許清單。

### 怎麼驗證的

- Supabase 查詢確認 realm_weather_state_weather_type_check 包含 shark。
- Supabase 查詢確認 admin_set_realm_weather_pair 函式定義包含 shark。
- GitHub work/chazi 檔案回讀確認天氣識別、速度計算及管理員標籤。
- 未執行瀏覽器端實際擲骰測試；GitHub Pages 尚未部署。

### 沒做／做不到的

- 尚未整合至正式網站；main 與 work/chazi 分歧，work/chazi 領先 93、落後 140 commits，不能直接合併整支分支。
- 尚未進行管理員帳號實際施放與一般玩家速度驗收。

### 衍生任務／影響任務

- 無。
