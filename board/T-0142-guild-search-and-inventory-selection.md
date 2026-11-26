---
id: T-0142
title: 公會搜尋彈窗與骰子出售選取狀態
status: open
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-26
updated: 2026-11-26
depends_on: []
branch: task/T-0142-guild-search-and-inventory-selection
done_by:
done_at:
---

## 任務

完成三項前端介面調整，保留既有遊戲資料、伺服器權限及交易行為。

## 範圍

1. 點擊「尋找公會」後，顯示獨立置中彈窗，樣式與公會郵箱一致；背景公會主頁保持原狀。可透過關閉按鈕、遮罩及 Escape 關閉，手機版彈窗可獨立捲動。
2. 不論玩家目前是否已加入公會，皆可搜尋並瀏覽公開公會。已加入 A 公會的玩家搜尋 B 公會時，B 必須正常出現在結果中；點擊加入時顯示「你目前已加入其他公會，請先退出目前公會後再加入。」並阻止送出加入 RPC。未加入公會者沿用原本直接加入／申請加入流程。伺服器端既有單一公會成員限制不得移除。
3. 主頁「背包與自動出售」標題只改為「自動出售」，保留容量數字及說明文字。
4. 出售骰子模式下，逐顆選取的骰子必須有明顯選取外框、背景及勾選標記；取消勾選後立即恢復。重新 render 時保留正確的逐顆選取狀態，不可只依骰子種類而錯誤選中同類全部骰子。

## 禁止事項

- 不修改 Supabase schema、migration、RPC、RLS、Edge Function 或玩家資料。
- 不新增輪詢、Realtime、額外資料庫查詢或雲端存檔欄位。
- 不修改自動出售設定本身、出售金額、骰子鎖定規則或伺服器權威交易。
- 不清空、reset、rebase、改寫或刪除 work/chazi。

## 驗收條件

- [ ] 公會搜尋從 nav 開啟置中 modal，背景公會主頁不被替換；關閉後回到原狀態。
- [ ] 無公會玩家可搜尋並沿用原本加入流程。
- [ ] 已加入 A 公會的玩家可搜尋到 B 公會；點擊 B 加入時顯示明確提示，且不呼叫 guild_apply。
- [ ] 搜尋結果仍由既有 guild_search RPC 回傳公開公會，不因前端 current guild 狀態隱藏搜尋結果。
- [ ] 主頁標題為「自動出售」，容量及說明文字完全保留。
- [ ] 出售模式下每顆骰子選取狀態清楚可辨；取消選取即時更新；重新 render 後只恢復原本被選取的個別顆數。
- [ ] 新增／更新自動化測試，涵蓋公會 modal、已加入玩家搜尋與加入阻擋、逐顆選取視覺及選取狀態恢復。
- [ ] 不新增 Supabase 請求；現有公會搜尋仍只在玩家主動搜尋時呼叫一次 guild_search。

## Git 基準例外紀錄

目前 main 為 `79cc9ec6e7d903f3a187f52872b20687334e3761`，work/chazi 為 `2ffd91ad46897494a1d491530e2efda33a218dbf`；兩者在 `dbbefa05bc110004c6f420c1e9d0c0505543d10f` 分歧，work/chazi 相對 main 有 368 個獨有提交，main 相對 work/chazi 有 1,488 個獨有提交。直接從 work/chazi 建立對 main 的交付 PR 會夾帶大量未整合歷史，無法安全部署。

因此本任務採一次性隔離方式：任務分支直接從最新正式 main 建立，只交付本任務差異；work/chazi 完整保留且不作任何寫入或重設。此例外只適用本任務，不改變未來 Git 流程規則。

## 紀錄

- 2026-11-26 12:36 [叉子] 新需求開單。以最新正式 main 建立隔離任務分支；work/chazi 與 main 已知分歧，為避免把 368 個未整合提交帶入正式版，本任務不以 work/chazi 作為交付來源。owner_side 有效 in_progress 任務 0/5；未發現有效 in_progress communicate task，兩道啟動閘門未阻擋。待 Board 開單 PR 合併後再轉 in_progress。
