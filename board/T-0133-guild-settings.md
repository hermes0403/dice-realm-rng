---
id: T-0133
title: 開放公會設定：修改名稱、介紹與加入方式
status: review
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-25
updated: 2026-11-25
depends_on: [T-0128, T-0129]
branch: task/T-0133-guild-settings
done_by:
done_at:
---

## 任務

開放公會「設定」子頁，讓有權限的公會管理者修改公會名稱、公會介紹及加入方式。移除目前「公會設定功能尚未開放」的佔位提示，改成可實際操作、儲存及重新載入的設定介面。

## 設定範圍與規則

- 公會名稱：沿用建立公會時既有的 2～24 字限制及伺服器端驗證。
- 公會介紹：沿用既有最多 160 字限制；允許清空介紹。
- 加入方式：沿用資料庫目前支援的加入模式，提供「公開直接加入」及「需審核申請」兩種選項；不得自行新增第三種模式。
- 預設只有會長（leader）可修改設定；副會長、幹部及一般成員可查看目前設定，但不可儲存修改。所有權限必須由伺服器 RPC 再次驗證，不得只靠前端隱藏按鈕。
- 儲存成功後更新畫面及目前公會資料；重新進入頁面或重新登入後仍須讀取到最新設定。
- 儲存期間防止重複送出，並清楚顯示成功、驗證錯誤及網路錯誤。
- 名稱、介紹等使用者輸入內容必須安全轉義，不得當成 HTML 執行。

## 範圍與禁止

- 只動公會設定頁、設定所需的伺服器 RPC／資料庫權限與必要 migration、相關樣式及測試。
- 不修改公會成員上限、職位配置、加入／退出流程、申請審核流程、每日任務、XP、排行榜或玩家其他資料。
- 不新增高頻輪詢或 Realtime；進入設定頁時載入，儲存後更新本地畫面即可。
- 不允許客戶端直接更新 guilds 資料表，也不允許修改公會 ID、會長或其他管理欄位。
- 不得將 service-role key 或其他秘密放入前端。

## 委派資訊

- 關聯原任務：
- 原需求方：
- 接收方：

## 驗收條件

- [ ] 有公會的玩家可開啟公會設定頁，不再顯示「尚未開放」佔位文案。
- [ ] 會長可修改名稱、介紹及加入方式，儲存後立即顯示新資料。
- [ ] 名稱 2～24 字、介紹最多 160 字及加入模式均由伺服器端驗證。
- [ ] 重新載入頁面／重新登入後，設定仍與資料庫一致。
- [ ] 非會長角色可查看設定但不能修改；直接呼叫 RPC 也會被拒絕。
- [ ] 客戶端沒有 guilds 直接寫入權限；RPC EXECUTE、RLS 及授權檢查通過。
- [ ] 重複送出、錯誤輸入及網路失敗有正確處理，不產生部分更新。
- [ ] 手機與桌面版版面正常，沒有水平溢位。
- [ ] 不新增高頻輪詢／Realtime；專項測試及既有回歸測試通過。

## 紀錄

- 2026-11-25 21:11 [叉子] 狀態轉換：in_progress → review。T-0133 程式與資料庫交付已合併 PR #346，merge commit `33727bb3c8e9e3dfbe59787e44c95175855fc00b`；PR head `a85592cb278d8f99aeea032360081d2d4355c2b1` 的 17/17 GitHub Actions 全部 success，其中 PWA 專項 61/61 通過；main 的 Pages workflow `45620849164` build、deploy、report-build-status 全部 success。正式 Supabase 已套用 `20261125210321_guild_settings.sql`；唯讀權限查核確認 private RPC 為 SECURITY DEFINER、固定空 search_path，anon 無 EXECUTE、authenticated 有 EXECUTE，public wrapper 同樣只允許 authenticated；anon/authenticated 均無 public.guilds UPDATE 權限。會長 RPC 在 authenticated 角色下以交易執行後 rollback，回傳預期設定；無公會成員的登入身分呼叫被拒絕 `guild_settings_permission_denied`。尚未完成真實手機／桌面登入操作與不同職位的前端實機驗證，交由棒子驗收，不宣稱通過。

- 2026-11-25 21:03 [叉子] 狀態轉換：open → in_progress。依最新 main `67c242acb7f44c6d17cf7fad0af8b44769d1f5cd` 重新盤點 owner_side 有效 in_progress 任務：僅 T-0132，共 1/5；T-0002、T-0038 屬 collaborator_side，不計入本方容量。board/ 與 board/archive/ 未發現有效 Communicate task，亦未發現有效 COMMUNICATE_LOCK。兩道啟動閘門均未阻擋；開始 T-0133 實作。

- 2026-11-25 21:03 [叉子] 依棒子新需求建立 T-0133，先以 open 狀態開單。工作範圍限定公會名稱、介紹及加入方式；暫定僅會長可修改，其他角色可查看。開工前須依 Board §15.3 重新確認容量及 Communicate 優先閘門。

## 完工回報

### 改了什麼

- `ui/guild.js`：公會設定頁改為可編輯表單，提供名稱、介紹及加入方式；會長可儲存，其他角色為唯讀。
- `guild.css`：新增手機與桌面響應式設定表單樣式。
- `docs/migrations/20261125210321_guild_settings.sql`：新增會長限定的 `guild_update_settings` RPC，伺服器端驗證名稱 2～24 字、介紹最多 160 字及 `application`／`open` 加入模式；`guild_get_my_guild` 新增回傳 `join_mode`。
- 新增 `tests/guild-settings.test.mjs`，更新公會介面、每日任務快取斷言、PWA 版本及 workflow 測試清單；PWA cache 升至 `dice-realm-shell-v2.23`。
- PR #346 已合併，merge commit `33727bb3c8e9e3dfbe59787e44c95175855fc00b`。

### 怎麼驗證的

- PR head `a85592cb278d8f99aeea032360081d2d4355c2b1`：17/17 GitHub Actions checks success；PWA run `45620721784`：61/61 tests pass，JavaScript syntax checks pass；Board lifecycle validation pass。
- GitHub Pages run `45620849164`：build、deploy、report-build-status 全部 success。
- Supabase project `pkdctcfifauygnjipmab`：migration 已套用；private RPC 為 SECURITY DEFINER 且固定空 search_path；anon EXECUTE denied、authenticated EXECUTE granted；public wrapper 僅 authenticated 可執行；anon/authenticated 直接 UPDATE `public.guilds` 均 denied。
- authenticated 會長 RPC 在交易內測試成功並 rollback；無公會成員的登入身分呼叫遭 `guild_settings_permission_denied` 拒絕，未留下測試資料。

### 沒做／做不到的

- 尚未完成真實手機／桌面登入操作及不同職位帳號的前端實機驗證，待棒子驗收。
- 尚未取得棒子對 T-0133 的最終驗收；目前維持 review，不標記 done。

### 衍生任務／影響任務

- 未修改公會成員上限、職位配置、每日任務、XP、排行榜或其他玩家資料；未新增輪詢或 Realtime。
