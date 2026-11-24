---
id: T-0128
title: 修復雲端存檔拒收 dailyShop 欄位並恢復交易前同步
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-23
updated: 2026-11-24
depends_on: [T-0126, T-0018]
branch: task/T-0127-save-patch-daily-shop
done_by:
done_at:
---

## 任務

修復正式環境 `sync_player_game_save_delta` 將前端目前合法的 `dailyShop` 存檔欄位誤判為不支援，導致雲端同步失敗，進而阻斷依賴 `flushCloudSave()` 的寵物出售及時序結晶材料投入。

## 範圍

- 將 `dailyShop` 加入雲端存檔 RPC 的允許欄位清單。
- 保留原有使用者驗證、存檔版本衝突檢查、欄位大小限制、資料驗證及交易流程。
- 新增測試，確保前端 `savePayload()` 所有欄位都被資料庫允許清單涵蓋，且未知欄位仍被拒絕。
- 不修改任何玩家存檔、寵物、金錢或材料資料。

## 驗收條件

- [x] 正式資料庫函式已更新並確認包含 `dailyShop`。
- [x] 純 SQL 檢查確認 `dailyShop` 可通過允許清單、未知欄位仍不被允許。
- [x] Node 回歸測試與 cloud-save GitHub Actions 通過。
- [ ] 以正式遊戲玩家實際驗證時序結晶投入及寵物出售，確認交易 RPC 成功、資料正確保存。
- [ ] GitHub Pages 部署成功並確認線上版本。

## 調查證據

- 正式資料庫 `sync_player_game_save_delta` 的原始允許欄位清單缺少 `dailyShop`；前端 `services/cloud-save.js` 的 `savePayload()` 自 2026-11-23 main 已包含 `dailyShop: S.dailyShop || null`。
- 正式 Supabase 最近 24 小時 edge log 有 1,169 次 `sync_player_game_save_delta` 呼叫，其中 346 次回應 HTTP 400；錯誤 SQLSTATE 為 `22023`。這些錯誤會令 `flushCloudSave()` 回傳失敗，造成交易流程在呼叫 `sell_owned_pets` 或 `deposit_time_crystal_material` 前就中止。
- 最近 24 小時 logs 中未找到 `sell_owned_pets` 或 `deposit_time_crystal_material` 的呼叫紀錄，與交易在前置存檔同步階段中止的判斷一致。

## 紀錄

- 2026-11-24 [叉子] 依棒子在本對話「解決」的授權，處理已公開的 T-0127 編號衝突：AI 模擬任務保留 T-0127；本存檔修補任務改編為 T-0128。為保留既有開放 PR #315 的 head 與提交歷史，暫保留原分支名稱 `task/T-0127-save-patch-daily-shop` 作為歷史分支；任務 ID 以本檔 frontmatter 的 T-0128 為準。未改動本任務程式／資料庫修復內容。

- 2026-11-23 19:40 [叉子] 從正式 Supabase 讀取 `sync_player_game_save_delta` 函式定義，逐欄比對前端 `savePayload()`。確認唯一缺漏欄位為 `dailyShop`；正式環境 24 小時內觀察到 346 次存檔 RPC HTTP 400（SQLSTATE 22023），另有 1,169 次總呼叫。未讀取或修改任何玩家存檔內容。
- 2026-11-23 19:45 [叉子] 已在正式 Supabase 套用向後相容的函式更新，僅將 `dailyShop` 加入允許清單；保留原本函式其餘邏輯。純 SQL 驗證結果：`daily_shop_allowed=true`、`unexpected_field_allowed=false`、正式函式定義含 `dailyShop`。
- 2026-11-23 19:48 [叉子] 修復後觀察正式 edge logs：從 11:46 UTC 起有 2 次 `sync_player_game_save_delta` HTTP 200、0 次 HTTP 400；表示存檔同步已能成功通過此欄位檢查。尚未觀察到玩家觸發 `sell_owned_pets` 或 `deposit_time_crystal_material`，因此仍待棒子實機驗收兩筆交易。
- 2026-11-23 19:49 [叉子] GitHub Actions 的 `cloud-save-regression` 通過，新增測試已執行成功；`weather-announcement-display`、`coin-boost` 亦通過。`board-lifecycle` 仍因 main 原有 T-0119 任務檔 frontmatter 缺欄位及舊紀錄格式錯誤而失敗；最新輸出未再列出 T-0127 的索引缺漏或時間格式警告。未修改 T-0119。
