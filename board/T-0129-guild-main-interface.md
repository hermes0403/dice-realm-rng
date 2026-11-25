---
id: T-0129
title: 公會主介面依示意圖重製
status: in_progress
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-25
updated: 2026-11-25
depends_on: [T-0128]
branch: task/T-0129-guild-main-interface
done_by:
done_at:
---

## 任務

依棒子提供的公會介面配置示意，重製《骰界 RNG》的公會主頁。現有 T-0128 僅提供基礎公會操作，不符合原示意圖；本任務以示意圖列出的導覽與資訊層級為 UI 驗收基準。

## 範圍與禁止

- 公會頁頂部導覽需包含：返回主頁、今日任務、公會排行榜、尋找公會、公會設定。
- 公會主資訊區需呈現公會識別與基本資訊。
- 公會成員區需呈現「公會成員 · N 人」及成員名單、玩家名稱與職位；視覺層級以示意圖中的 Hermes、玩家 A、玩家 B 名單呈現方式為準，實際內容必須來自登入玩家所屬公會資料。
- 保留 T-0128 已完成的建立公會、搜尋公會、加入／申請、申請審核、成員讀取及退出能力，並整合至新介面。
- 今日任務、公會排行榜、公會設定需建立清楚的頁面入口與版面。若對應資料表／RPC／規則尚不存在，先標示尚未開放或尚未設定，不得使用假資料冒充正式功能；需新增後端功能時另列依賴或後續任務。
- 手機與桌面均需符合遊戲既有深色科幻紫藍風格及響應式版面。

## 不要動

- 不修改既有玩家帳號、存檔、骰子、寵物、貨幣、成就及既有排行榜。
- 不更動 T-0128 已建立的公會資料、成員及權限規則。
- 不新增高頻輪詢或不必要的 Realtime 訂閱。
- 不將未完成的任務、排行榜或設定操作做成可提交但實際無效的按鈕。

## 驗收條件

- [ ] 公會頁資訊架構與棒子提供的示意圖一致，五個頂部入口完整可見。
- [ ] 已加入公會的玩家可看到正確公會資訊、成員總數、成員名稱及職位。
- [ ] 未加入公會的玩家仍可建立或尋找公會，且不會看到不適用的成員管理內容。
- [ ] 尋找公會、加入／申請、審核及退出功能維持正常。
- [ ] 今日任務、公會排行榜、公會設定的未完成狀態有明確提示，不顯示虛構資料或假成功回饋。
- [ ] 手機版與桌面版版面正常，無水平溢位或操作遮擋。
- [ ] 相關語法、單元及既有回歸測試通過；真實雙帳號瀏覽器驗證另行記錄。
- [ ] 未修改公會以外的遊戲資料或系統。

## 紀錄

- 2026-11-25 [叉子] 依棒子明確要求建立 T-0129。開工閘門依 main 的 Board 檔案盤點：owner_side 有效 in_progress 任務僅 T-0128（1/5）；目前有效的 owner_side 任務中未發現符合 §15.9 條件的 communicate task 或 COMMUNICATE_LOCK，Communicate 優先閘門未觸發。由 main commit e13b4a418032d70c04104ef318a13cf4aec65737 建立 task/T-0129-guild-main-interface，任務轉為 in_progress。
- 2026-11-25 [叉子] 已重製公會前端資訊架構：新增五項導覽入口、已加入公會的主資訊與成員名單、尋找公會檢視，以及今日任務／排行榜／設定的明確未開放狀態；保留既有建立、搜尋、加入／申請、幹部審核及退出 RPC。同步更新 guild CSS、HTML／JS 資產版本與 Service Worker 快取殼至 v2.15。新增公會介面靜態回歸測試並接入 PWA workflow；PR #323 的 CI 已完成：本任務最新程式提交 e629d317ee76a6aeb6008bbcbf5c8aab3ac19a61 對應的 16 個 GitHub Actions workflow 全部 success；其中 PWA display workflow 已執行新增的公會 UI 測試及 ui/guild.js 語法檢查。真實雙帳號瀏覽器驗證尚未執行。

## 完工回報

### 改了什麼

- `ui/guild.js`：公會頁導覽、主資訊、成員名單、尋找公會及未開放功能提示。
- `guild.css`：深色科幻風格導覽、資訊卡、成員列表與手機響應式版面。
- `index.html`、`script.js`、`sw.js`：更新公會資產版本與 PWA 快取殼。
- `tests/guild-main-interface.test.mjs`、`.github/workflows/pwa-display-tests.yml`、`tests/pwa-display-controls.test.mjs`：新增公會 UI 回歸測試並更新快取版本斷言。

### 怎麼驗證的

- GitHub Actions commit `e629d317ee76a6aeb6008bbcbf5c8aab3ac19a61`：16 個 workflow 全部 success（包含 PWA display、Dice roll save、Cloud save rollback、Board lifecycle 等）。
- PWA display workflow 已通過公會 UI 測試及 `node --check ui/guild.js`。
- PR #323：`https://github.com/hermes0403/dice-realm-rng/pull/323`。

### 沒做／做不到的

- 尚未完成真實登入雙帳號瀏覽器測試及手機實機驗證。
- 今日任務、公會排行榜、公會設定目前只有明確的未開放提示，尚無對應後端功能。

### 衍生任務／影響任務
