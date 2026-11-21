---
id: T-0117
title: 修復寵物出售選擇摘要文字對比與快取更新
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-21
updated: 2026-11-21
depends_on: []
branch: task/T-0117-pet-sale-summary-contrast-fix
done_by:
done_at:
---

## 任務

修復「融合機 → 我的寵物 → 出售寵物」視窗底部「已選擇 0 隻寵物，合計可獲得 0$。」摘要文字顏色異常、對比不足的問題，確保不同主題及手機／桌面顯示一致清晰。

## 範圍與禁止

- 僅修改出售摘要區塊的文字顏色、文字填色、透明度／混色相關樣式，以及必要的 CSS 快取版本引用。
- 不改出售金額、稀有度價格、選取邏輯、出售 RPC、玩家寵物或貨幣資料。
- 不修改 Supabase schema、RPC、RLS、trigger 或正式玩家資料。
- 不修改其他面板的顏色或全站主題。

## 驗收條件

- [ ] 摘要文字在深色面板上清楚呈現高對比淺色，無異常深藍／透明／混色。
- [ ] 未選取及已選取寵物時，摘要文字均清晰；金額與數量更新邏輯不變。
- [ ] 手機與桌面版均套用相同樣式。
- [ ] Service Worker 與首頁 CSS 快取版本一致，舊樣式不會持續被快取。
- [ ] 相關 CSS／快取檢查及可用的自動化測試通過；未執行的真實瀏覽器驗證須明確標示。

## 紀錄

- 2026-11-21 [叉子] 依棒子要求修復出售摘要文字顏色。既有 T-0116 樣式已在 main，但玩家仍回報異常，因此本任務改以更高優先序選擇器、-webkit-text-fill-color、opacity、filter 與 mix-blend-mode 明確鎖定摘要顯示；不改動交易或玩家資產。
- 2026-11-21 [叉子] 唯讀核對玩家「想不到可以叫什麼………..(◐‿◑)」：game_saves 有 12 個寵物 UID，融合紀錄扣除 3 個出售 tombstone 後也有 12 個 UID；missing_uids 與 unexpected_saved_uids 均為 null。此刻存檔已包含全部可確認未出售寵物，因此不執行重複補發或任何玩家資料寫入。
