---
id: T-0147
title: 實作公會名稱顏色、徽章特效與專屬背景
status: review
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-27
updated: 2026-11-27
depends_on: [T-0141]
branch: task/T-0147-guild-cosmetics-rebalance
done_by:
done_at:
---

## 任務

將公會升級獎勵中已設定、但尚未實際提供使用方式的三項外觀解鎖，實作成可保存、可切換、可在公會介面中正確呈現的功能：

- Lv.9「專屬公會名稱顏色」：解鎖公會名稱配色選擇與顯示。
- Lv.15「公會徽章特效」：解鎖徽章特效選擇與顯示。
- Lv.19「專屬公會背景」：解鎖公會資料頁背景選擇與顯示。

T-0141 已將這三項設為對應等級的 cosmetic 獎勵；本任務補上解鎖判定、管理介面、持久化及各公會顯示位置。

## 範圍與禁止

- 只動：公會相關 UI、樣式、必要的公會 RPC／SQL migration、對應測試與本任務 Board 紀錄。
- 不要動：公會 XP 門檻、獎勵等級與獎勵內容、既有玩家 XP／獎勵郵件、其他公會功能、玩家資產及非公會系統。
- 外觀解鎖以伺服器的公會升級獎勵紀錄為唯一依據；不可相信前端傳入的等級或解鎖清單。
- 外觀選擇必須由伺服器驗證公會成員身份、角色權限及已解鎖項目；僅會長與副會長可修改。
- 公會名稱顏色、徽章特效與背景均為純外觀，不影響遊戲機率、收益、XP、交易或玩家存檔。
- 不新增輪詢、Realtime 或高頻查詢；沿用既有公會資料載入／更新流程。
- 不清空、reset、rebase、改寫或刪除 work/chazi。

## 預期功能

1. Lv.9 解鎖名稱顏色後，公會設定頁提供有限且安全的預設配色選擇；在公會主頁、搜尋結果及排行榜等有顯示公會名稱的位置一致套用。
2. Lv.15 解鎖徽章特效後，公會設定頁提供預設徽章效果選擇；徽章在公會主頁及其他有顯示徽章的位置一致呈現。效果以 CSS 為主，避免高負載動畫。
3. Lv.19 解鎖背景後，公會設定頁提供預設背景選擇；套用於公會主頁主要資料區，確保文字對比及手機版可讀性。
4. 尚未解鎖的項目顯示鎖定狀態及所需等級，不顯示可使用的選項。
5. 解鎖為公會永久共享權益；會長／副會長可切換外觀，一般成員只能觀看目前設定。
6. 切換外觀後重新載入、重新登入及其他成員查看時，顯示結果一致。
7. 不存在或未解鎖的外觀 ID 必須由後端拒絕；空值代表使用預設外觀。

## 驗收條件

- [x] Lv.9、Lv.15、Lv.19 的解鎖狀態由伺服器獎勵紀錄判定。
- [x] 會長及副會長可以修改已解鎖的三類外觀；幹部與一般成員無法修改。
- [x] 未解鎖或偽造外觀 ID 的 RPC 請求會被伺服器拒絕。
- [x] 公會名稱顏色在公會主頁、搜尋結果、排行榜及其他公會名稱顯示處一致套用。
- [x] 徽章特效與專屬背景在公會主頁正確顯示，手機與桌面版均可讀。
- [x] 外觀設定保存於伺服器，重新載入及不同成員查看時一致。
- [x] 不新增輪詢、Realtime 或高頻資料庫請求。
- [x] 不改變 XP、獎勵發放、玩家資產與其他公會功能。
- [x] 新增解鎖、權限、偽造輸入、持久化及 UI 回歸測試；相關測試通過。
- [x] GitHub Pages 部署成功，並完成程式碼與線上部署版本核對。
- [x] Lv.9 僅提供預設、星雲紫、冰晶藍；其餘顏色保留供未來等級使用。
- [x] Lv.15 僅提供預設、星環環繞；星環具明顯雙層環繞與發光效果。
- [x] Lv.19 僅提供預設、極光幻境；其他背景保留供未來等級使用。
- [x] 前端選項與正式資料庫 RPC／CHECK constraint 使用相同白名單，偽造 ID 會被拒絕。

## 紀錄

- 2026-11-27 05:37 [叉子] 開單：依棒子要求，將三項公會外觀獎勵建立為獨立開發任務。確認目前 owner_side 有效 in_progress 任務為 T-0142、T-0146，共 2/5；T-0002（barry）及 T-0038（老查）不計入本方容量。已讀取 Board 最新 main（aa644f722d65d281f81e79df0c86e31a4177ca88）；尚待完成開單 PR、開工 PR 及再次確認兩道啟動閘門後，才能進入實作。

- 2026-11-27 05:43 [叉子] 開單 PR #405 已合併至 main（merge commit 443749ced158e64b896faf10a5d6d16774ebb400）；任務分支已以非強制快轉方式同步 main。重新檢查最新 main：owner_side in_progress 任務 T-0142、T-0146 共 2/5；檢查所有 open 任務未發現有效 communicate task，兩道啟動閘門未阻擋。狀態轉換：open → in_progress，開始實作。
- 2026-11-27 05:50 [叉子] 實作 PR #407 已合併至 main，合併 commit：822db106dc8804c0ad59cbc939de76ccb76925c6。Supabase migration `guild_cosmetics` 套用成功，migration version `20261126214906`；欄位、函式權限及既有公會資料已驗證。GitHub Pages deployment run #45900691950 成功。PWA／公會回歸 workflow 通過；全遊戲回歸仍有一項既有、與本任務無關的寵物管理排序測試失敗（`tests/pet-removal-admin-counts.test.js`）。本任務功能驗收完成。

- 2026-11-27 20:14 [叉子] 依棒子最新要求補強 T-0147：Lv.9 限制為星雲紫／冰晶藍兩種名稱色；Lv.15 限制為星環環繞一種徽章特效，並改為高對比雙層旋轉光環與紫藍發光；Lv.19 限制為極光幻境一種背景並提高色彩辨識度。其他既有外觀 ID 保留於程式樣式及選項定義，暫不開放，供未來等級使用。原任務分支與 main 比較為 DIVERGED（原分支 ahead 23、behind 130），故保留舊分支不覆寫，改由最新 main 建立後續任務分支 task/T-0147-guild-cosmetics-rebalance；本分支已更新 UI、CSS、回歸測試及 migration。正式 Supabase 專案已套用 migration guild_cosmetics_level_option_limits，回讀確認三項 CHECK constraint 與 RPC 白名單一致；現有 5 個公會的外觀設定皆為預設值，未變更玩家資料。尚待 GitHub Actions、PR 整合及 Pages 部署驗證。

## 完工回報

### 改了什麼

- `ui/guild.js`：Lv.9、Lv.15、Lv.19 只顯示各自指定的外觀選項；其餘既有外觀仍保留供未來等級使用。
- `guild.css`：星環特效改為雙層高對比旋轉環與紫藍光暈；極光背景提高色彩辨識度。
- `docs/migrations/20261127121441_guild_cosmetics_level_option_limits.sql`：正式資料庫限制三類外觀白名單，並同步 RPC 驗證。
- `tests/guild-cosmetics.test.mjs`：補上外觀選項限制、資料庫白名單及特效回歸測試。
- PR #433 已合併，merge commit：`198d128fb5aba634adf7a137fefaa69f23c0ba58`。

### 怎麼驗證的

- Supabase 正式專案 `pkdctcfifauygnjipmab`：migration `20261127121441` 套用成功；回讀三項 CHECK constraint 與 `private.guild_update_cosmetics`，白名單一致。套用前 5 個公會的外觀欄位皆為預設值。
- GitHub Actions Full game regression audit：`node --test tests/*.test.js tests/*.test.mjs`，457/457 通過，exit code 0；JavaScript syntax 與 `git diff --check` 步驟亦通過。
- PWA display regression：117/117 通過，exit code 0。
- Board lifecycle validation、Cloud save rollback、Guild potion gifting、Coin boost workflows 均通過。
- GitHub Pages deployment run `45997378809`：build、report-build-status、deploy 全部成功。

### 沒做／做不到的

- 目前正式資料最高公會等級為 Lv.8，尚無公會觸發 Lv.9／15／19；因此已驗證程式、資料庫限制與回歸測試，尚未有實際升級到該等級的玩家畫面可供核對。
- 其餘外觀仍保留於程式，尚未分配到未來等級。

### 衍生任務／影響任務

- 無新增衍生任務；無其他任務需追加 impact。

- 2026-11-27 20:18 [叉子] 完成 T-0147 外觀選項限制與視覺強化，PR #433 已合併至 main；正式 Supabase migration、回歸測試及 GitHub Pages 部署均有成功證據。依完工回報提交 review，等待棒子驗收。
