# 鯊皇活動可信事件契約

本文件定義活動進度可接受的資料來源。活動獎勵涉及鯊皇幣，任何可由玩家客戶端自行提交的數值或紀錄都不能當作完成證據。

## 已接通的伺服器事件

| event_key | 唯一事件識別 | 權威來源 | 接通方式 | 狀態 |
|---|---|---|---|---|
| `pet_sale` | `pet-sale:<pet_uid>` | `sell_owned_pets()` 寫入 `pet_sale_tombstones` | tombstone AFTER INSERT trigger | 已接通 |
| `weather_summon_special` | `weather-summon:<updated_at>` | `summon_realm_weather()` 更新 `realm_weather_state` | weather AFTER INSERT/UPDATE trigger，排除管理員面板天氣 | 已接通 |

兩個來源均由伺服器交易寫入；進度紀錄與獎勵帳本在同一資料庫交易內完成。進度函式位於未公開的 `private` schema，且不授權 `anon`／`authenticated` 執行；活動資料表不授予客戶端直接讀寫權限。

## 尚未接通的事件

| event_key | 必須等待的權威來源 | 依賴任務 | 不可使用的替代來源 |
|---|---|---|---|
| `roll_count`、`rare_dice_4096`、`rare_dice_8192` | 伺服器擲骰交易產生的唯一 roll ID、骰子 ID 與分母 | T-0006 | `game_saves.rolls`、`player_profiles.total_rolls`、客戶端擲骰紀錄 |
| `pet_fusion`、`pet_fusion_common`、`pet_fusion_rare`、`pet_fusion_legendary` | 伺服器合成交易產生的唯一 fusion ID、寵物 ID 與品質 | T-0012 | `pet_fusion_logs` 的客戶端 INSERT |
| `pet_weather_mutation`、`pet_golden_mutation` | 同一伺服器合成交易確認的變異結果 | T-0012 | 客戶端存檔中的 mutation 欄位 |
| `potion_craft`、`potion_luck2`、`potion_speed2`、`potion_luck3` | 伺服器藥水製作交易產生的唯一 craft ID、藥水 ID 與數量 | T-0009 | `potion_usage_logs`、`craft_logs` 的客戶端 INSERT |
| `pet_count_5`、`pet_count_10` | 伺服器權威寵物資產帳本的持有數變更 | T-0012 | 客戶端存檔中的 pets 陣列 |

## 事件接入規則

1. 每個事件由產生該遊戲資產／結果的權威交易在同一交易內寫入；不得另由前端呼叫活動進度 RPC。
2. 事件必須包含玩家 ID、穩定且唯一的事件 ID、事件類型及可信結果欄位。稀有骰子與寵物品質必須由伺服器結果判斷。
3. 活動端只呼叫內部 `private.record_shark_event_progress`；不可將此函式包成任何玩家可呼叫的公開 RPC。
4. 以玩家、事件類型及事件 ID 去重；任務完成、鯊皇幣 ledger 寫入、帳戶餘額更新與下一項任務解鎖必須原子完成。
5. 只處理目前已解鎖任務。事件先到但任務未解鎖時不預存、不補算。
6. T-0006、T-0009、T-0012 尚未完成前，相關事件維持未接通；不得為了讓任務列顯示完成而接入不可信日誌。
7. 活動入口及頁面維持管理員限定，直到棒子另行明確決定公開。

## 正式環境現況盤點

2026-11-11 以 Supabase 正式專案唯讀查核：
- 已存在 `trg_shark_event_pet_sale` 與 `trg_shark_event_weather`。
- `private.record_shark_event_progress(uuid,text,text,integer)` 對 anon 與 authenticated 均沒有 EXECUTE 權限。
- authenticated 對 `shark_event_progress_events` 沒有 INSERT 權限，對 `shark_event_ledger` 沒有 SELECT 權限。
- 擲骰目前仍可由 `sync_player_game_save_delta` 接收客戶端提供的 `rolls`；不能將此欄位視為權威擲骰事件。
- `pet_fusion_logs`、`potion_usage_logs`、`craft_logs` 有客戶端可寫入的紀錄政策／路徑；不能直接掛活動 trigger。

## 測試

CI 靜態測試檢查 migration 的 trigger 來源與權限邊界。資料庫交易行為另以回滾測試驗證：
- 新事件可累積目前任務進度。
- 相同事件 ID 重送會回報 duplicate，不重複累積。
- 達標會發放正確獎勵並解鎖下一項。
- 測試交易最後 rollback，不保留測試帳戶的活動進度或餘額。

完整事件接通仍需等待依賴任務提供權威交易來源。
