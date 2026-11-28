---
id: T-0166
title: 交易雙方準備倒數的伺服器權威 RPC 與安全驗證
status: open
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-28
updated: 2026-11-28
depends_on: [T-0157]
branch: task/T-0166-server-trade-countdown
done_by:
done_at:
---

## 任務

為 T-0165 的寵物交易新增真正由伺服器控制的 3 秒雙方準備倒數。現有 `confirm_pet_trade` 在雙方 confirmed 後會於同一個 RPC 立即完成原子交換，前端倒數無法阻止舊 RPC 提前交換。必須先將準備與最終交換拆開，並確保所有舊版／重複／延遲請求都不能繞過倒數或交換不同版本的交易內容。

本任務由棒子明確授權，允許在此任務範圍內修改交易相關資料表欄位、migration、RPC 及交易倒數必要的前端串接；不得修改其他遊戲資料或玩家資產。

## 範圍與禁止

- 只修改寵物交易所需的 migration、交易 SQL 文件、交易 RPC、交易 service 與對應回歸測試。
- 新增伺服器準備狀態與倒數版本紀錄；最少能辨識雙方各自 ready 時間、倒數開始時間、倒數所屬 revision，以及短效連線／準備租約。
- 將「準備」與「最終交換」拆成不同伺服器操作。準備 RPC 只更新該玩家的 ready 狀態；最終 RPC 必須在資料庫端確認雙方 ready、同一 revision、倒數已完整經過 3 秒、租約仍有效後，才執行既有的原子交換。
- 任一方取消準備時立即清除倒數起點與倒數 revision；另一方重新準備後必須重新開始完整 3 秒。交易內容修改時必須重設雙方 ready、倒數欄位及租約，並遞增 revision。
- 離開／取消交易房間、交易逾期或任一方連線失效時，不得完成舊倒數。連線狀態以 Realtime 連線事件加短效 heartbeat lease 作雙重保護；heartbeat 僅在倒數期間使用，不新增常駐高頻輪詢。最終 RPC 必須拒絕過期租約。
- 保留既有參與者身份、寵物所有權、重複 UID、tombstone、存檔鎖、revision 及原子交換驗證；不可將寵物交換移到前端。
- 舊版 `confirm_pet_trade` 不得再保留可立即交換的路徑；需安全相容地降級為「只設置 ready」或明確拒絕舊流程，確保舊快取客戶端也無法繞過 3 秒倒數。
- 新增 RPC 必須檢查 `auth.uid()`、交易參與者、session 狀態與期限、revision；檢查 `SECURITY DEFINER` 的固定 `search_path`、執行權限與匿名角色不可呼叫。
- 最終交換必須在單一資料庫交易內完成，並具備併發鎖定與重複請求冪等性；倒數未滿、ready 被取消、revision 改變、租約逾期或 session 取消時一律拒絕。
- 不新增常駐輪詢、全站 Realtime 訂閱或無關資料表；不得變更非交易玩家資料。
- Supabase migration 部署前先完成 SQL／權限審查、隔離測試與回復方案；部署後查核正式 migration history、函式定義及權限，並執行 Supabase advisors。不可只以 migration 命令成功視為驗收。

## 驗收條件

- [ ] 資料庫能記錄雙方 ready、倒數開始時間、倒數 revision 及短效 heartbeat lease。
- [ ] 只有雙方 ready 且 revision 一致時才會建立倒數；伺服器時間未滿 3 秒時，最終交換 RPC 必須拒絕。
- [ ] 任一方取消 ready、修改交易內容、離開房間、session 逾期或 heartbeat lease 失效時，舊倒數不能完成交易。
- [ ] 舊版 `confirm_pet_trade` 無法直接完成交換；重複與延遲 RPC 不會重複轉移寵物。
- [ ] 最終 RPC 保留原有寵物所有權、tombstone、存檔鎖、revision 與原子交換檢查。
- [ ] RLS／函式 EXECUTE 權限正確；未登入者及非交易參與者無法操作；`SECURITY DEFINER` 固定 search_path 並經安全檢查。
- [ ] 新增隔離測試：雙方 ready、3 秒未滿、3 秒已滿、任一方取消、內容修改／revision 改變、房間取消／逾期、連線租約失效、舊 RPC、重複 finalize、併發 finalize。
- [ ] 前端倒數與新 RPC 契約一致；倒數期間雙方可取消，Realtime 斷線時立即停止倒數並送出取消準備請求（伺服器租約仍是最後防線）。
- [ ] GitHub Actions、SQL 驗證、Supabase advisors 全部通過；正式 migration 已部署並回讀驗證；GitHub Pages 部署成功。
- [ ] 真實雙帳號流程由棒子驗收；未執行的項目明確標示。

## 紀錄

- 2026-11-28 14:00 [叉子] 棒子明確授權另開後端任務，修改交易資料庫與 RPC，完成真正的伺服器權威 3 秒倒數。已確認 T-0157 的多寵物交易基礎與現有 `confirm_pet_trade(p_session_id, p_expected_revision)`：雙方 confirmed 後會立即於同一 RPC 執行原子交換，故必須拆分 ready 與 finalize，並封鎖舊 RPC 的即時交換路徑。
- 2026-11-28 14:00 [叉子] 依最新 main `afa107b4557514024db0712d22309e3d6571a88e` 建立任務分支。容量閘門：owner_side 有效任務 T-0146（in_progress）、T-0148（in_progress）、T-0147（review）、T-0165（in_progress），共 4/5；T-0164 為 blocked 且 from: 棒子，不計入本方。Communicate 優先閘門：檢查 Board 搜尋未發現有效 `to: 叉子` 且 open／in_progress，或 `from: 叉子` 且 returned 的委派單。新任務先保持 open，不開始實作；待開單 PR 合併後再重新檢查啟動閘門。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務／影響任務
