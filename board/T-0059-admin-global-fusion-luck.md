---
id: T-0059
title: 新增管理員全服寵物融合運氣限時活動
status: review
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-11
updated: 2026-11-11
depends_on: []
branch: task/T-0058-shark-event-integration
done_by: 棒子
done_at:
---

## 任務

新增管理員可施放的全服「融合運氣」活動。管理員可設定品質機率相對增加百分比及持續秒數；活動期間所有玩家合成寵物時，神話與秘密品質機率按相同比例提高，增加的總機率由其餘品質中原始機率最高者扣除，總機率維持 100%。活動到期後自動恢復原始品質機率。

## 範圍與禁止

- 只動：全服融合運氣狀態欄位與管理員 RPC、管理員施放介面、全服狀態同步／活動卡片、寵物合成機率預覽與抽樣、對應測試及文件。
- 不要動：骰子擲出機率、一般運氣／速度加成、金錢倍率、寵物變異機率、各區原始寵物合成機率設定。
- 加成只乘在 mythic、secret 原始機率上；增加量由 common／rare／legendary 中原始機率最高者扣除。若扣除來源不足，按可扣除量等比例縮減本次實際加成，不得產生負機率。
- 保留現有全服運氣／速度加成的獨立設定與到期時間，不得互相覆蓋。
- 管理員權限必須由資料庫 RPC 驗證，不得只依賴前端 isAdmin。
- T-0012 寵物合成伺服器權威化尚未完成；本任務沿用目前前端合成流程，必須明確保留此依賴風險，不得宣稱已具伺服器權威防作弊能力。

## 驗收條件

- [ ] 管理員可設定融合運氣增加百分比與持續秒數，非管理員呼叫 RPC 會被拒絕。
- [ ] 例如神話 1%、秘密 0.1%，設定 +50% 後成為 1.5%、0.15%，增加的 0.55 個百分點由其餘品質中原始機率最高者扣除。
- [ ] 各區調整後機率總和維持 100%，任何品質機率不得小於 0。
- [ ] 所有玩家的預覽與合成抽樣使用相同調整後機率；活動到期後恢復原始機率。
- [ ] 融合運氣與現有全服運氣／速度加成可同時存在，彼此不覆蓋倒數。
- [ ] Realtime 更新可同步；斷線後使用既有低頻 fallback，不新增高頻輪詢。
- [ ] 補上純函式機率計算、抽樣／預覽一致性及管理員 UI 測試；語法檢查與 `git diff --check` 通過。

## 紀錄

- 2026-11-11 20:04 [叉子] 依棒子指示建立。以現有 realm_global_boost 單例資料列擴充獨立融合運氣欄位，沿用既有全服加成 Realtime 通道，避免新增額外輪詢；實作期間不改 T-0012 任務狀態或其伺服器權威範圍。
- 2026-11-11 20:14 [叉子] 完成管理員施放介面、資料庫欄位與 admin_set_realm_fusion_luck RPC、全服 Realtime／5 分鐘 fallback 同步、活動卡片、合成預覽與 weightedPetRarity 抽樣。加成獨立於骰子運氣／速度及原有全服加成；結束後依時間自動恢復。機率計算按 mythic／secret 同比提高，從 common／rare／legendary 中原始機率最高者扣除，來源不足時按可扣除量縮減實際加成。
- 2026-11-11 20:14 [叉子] 正式 Supabase migration 已套用；確認 fusion_luck_* 四欄存在、anon 無 RPC EXECUTE、authenticated 可呼叫且函式固定 search_path 為空字串並在函式內驗證登入身份與管理員 email。
- 2026-11-11 20:14 [叉子] GitHub Actions 最新 head 816626c：focused regression、Game save delta sync、Branch tests 均成功；完整 Node 測試 94/94 通過（新增 +100% 機率案例：神話 1%→2%、秘密 0.1%→0.2%，扣除 1.1 個百分點），語法檢查及 git diff --check 通過。

## 完工回報

### 改了什麼

- `admin/ui-bindings.js`、`index.html`：管理員新增全服寵物融合運氣設定，可輸入 0–500% 與 1–604800 秒。
- `systems/pets.js`：預覽與實際合成抽樣共用同一套調整機率；神話、秘密按相同比例提升，增加量從其餘品質最高機率項目扣除。
- `systems/global-boost.js`、`script.js`：沿用既有 Realtime 通道與 5 分鐘 fallback，玩家主頁顯示融合運氣活動卡及倒數，並在加成開始／到期時更新合成預覽。
- `docs/migrations/20261111120400_realm_global_fusion_luck.sql`：新增獨立融合運氣狀態欄位與管理員 RPC；正式 Supabase migration 已成功套用。
- 新增 `tests/pet-fusion-luck.test.js`，擴充 `tests/global-boost-render.test.js`。

### 怎麼驗證的

- Supabase：欄位查詢確認四個 `fusion_luck_*` 欄位存在；RPC 權限查詢確認 anon 無 EXECUTE、authenticated 有 EXECUTE；函式為 SECURITY DEFINER、固定空 search_path，並在函式內驗證 auth.uid() 與管理員 email。
- GitHub Actions：Focused game regression tests、Game save delta sync tests、Branch tests 均成功；完整 Node 測試 93/93 通過。
- JavaScript syntax checks：通過；`git diff --check`：通過。

### 沒做／做不到的

- 尚未以棒子的正式管理員瀏覽器帳號實際施放驗收。
- PR #37 仍為 Draft，尚未合併至 work/chazi／main，也尚未部署 GitHub Pages；玩家目前線上頁面尚未取得這次前端功能。
- T-0012 的伺服器權威寵物合成尚未完成；目前融合品質抽樣沿用既有前端流程，不能宣稱已具備伺服器權威防作弊能力。

### 衍生任務／影響任務

- T-0012 已追加 impact：後續伺服器權威合成必須讀取融合運氣狀態，並在伺服器端沿用相同品質機率分配規則。
