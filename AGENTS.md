# AGENTS.md — dice-realm-rng

本文件是所有協作 AI 共用的專案安全與執行規範入口。每位 AI 開工時，必須先辨識自己代表的角色，再讀取對應的角色規範：

- 老查（barry 的 GPT）：`docs/AGENTS_LAOCHA.md`
- 叉子（棒子的 GPT）：`docs/AGENTS_CHAZI.md`

若無法確認自己代表哪個角色，必須先停止並向委託者確認，不得猜測身份或執行 Board 狀態操作。不得同時套用另一方的角色身份或權限。四角色身份、Board 任務狀態、權限群組、跨方影響、驗收及歸檔的唯一流程規範為 `board/README.md`。每次接手任務都必須讀取該文件及完整任務檔。

## 1. 專案與證據辨識

- 專案根目錄：`D:\yc917\Documents\dice-realm-rng`。
- 開始工作前確認工作目錄、目前 branch、HEAD、`git status --short --branch`、`git branch -vv`、worktree 及遠端追蹤狀態。
- 本機檔案、GitHub 遠端分支、GitHub Pages 線上版本、Supabase 正式環境及 Edge Function 部署版本是不同證據來源；不得互相推定。
- 先讀取本次工作涉及的文件、程式及 Board 任務，不得覆蓋使用者未提交或未追蹤的修改。
- 不得讀取 `.env`、`.env.*` 或其他環境秘密檔案，除非人類針對特定檔案與目的另行明確授權；不得把秘密寫入程式碼、文件、任務紀錄或 Git。

## 2. 新對話接續與 Git 同步 SOP

每次開啟新的專案對話，依序執行：

1. 確認本機日期時間及專案工作目錄。
2. 檢查 `git status --short --branch`、`git branch --show-current`、`git branch -vv`、HEAD、worktree 與 upstream。
3. 執行 `git fetch origin`，再檢查本機與遠端差異。
4. 只有在工作區乾淨、目前分支有正確 upstream、且可安全快轉時，才執行 `git pull --ff-only`。`fetch` 不等於 `pull`，不得將 fetch 成功回報成 pull 完成。
5. 若工作區有修改、分支沒有 upstream、遠端與本機分歧，或可能覆蓋／衝突，停止 pull 並說明原因。不得擅自 stash、丟棄、重設、rebase 或把其他分支指定為 upstream。
6. Git 同步完成或因安全條件停止後，檢查當日 Supabase CSV、目前分支可見的 Board 任務，以及本次工作目標。若本次工作明確不涉及 Supabase，可依任務範圍跳過資料庫基準檢查。

目前分支若有未提交的 `index.html` 修改，而遠端也變更、刪除或改名涉及 `index.html` 的檔案，必須先保留本機版本並比較差異，不得直接 pull／merge／rebase。可使用 `git diff -- index.html`、`git diff --name-status --find-renames HEAD origin/main` 及 `git show origin/main:index.html`（輸出至暫存檔比較）。

## 3. Supabase CSV 命名與基準

### 收到 CSV 時

- 只要在專案資料夾中收到、發現或由使用者提供一份新 CSV，AI 必須主動辨識內容並重新命名，不得等使用者提醒。重新命名前先確認來源檔、內容類型、匯出時間及目標檔名是否已存在；不得覆蓋既有檔案。
- 不得只看原始檔名判斷內容。至少檢查標頭及足以辨識類型的資料列，再分類為完整狀態快照、migration 版本、資料表統計、函式／依賴清單或其他查詢結果。
- 優先使用檔案可確認的匯出／修改時間作為檔名時間，轉為台灣本機時間；若無法確認匯出時間，使用實際重新命名時的本機時間，並在回報中說明時間來源。
- 同一分鐘已有同名檔時，依序加 `_02`、`_03` 等序號，不得覆蓋。改名後確認新檔存在、大小合理並讀取內容；回報原檔名、新檔名、分類及時間依據。
- 不得把局部查詢結果命名成完整狀態快照。SQL Editor 匯出 SOP 唯一依據為 `docs/SUPABASE_SNAPSHOT_SOP.md`；每次只執行一段 SELECT、下載一份結果 CSV，不可把同一次執行多段 SELECT 的下載檔假設成多個結果的合併。

### 命名格式與基準

- 完整資料庫快照是一組同時間戳的 CSV：`Supabase_State_yyyy-MM-dd_HH-mm_<序號>_<dataset>.csv`。必要資料集及序號見 `docs/SUPABASE_SNAPSHOT_SOP.md`。
- 局部查詢結果：`Supabase_Query_<topic>_yyyy-MM-dd_HH-mm.csv`；既有專用分類可沿用 `Supabase_Migration_Versions_...`、`Supabase_Table_Stats_...`、`Supabase_Functions_<topic>_...`。
- 只有 SOP 所列必要資料集全部匯出、驗證成功，才可稱為完整資料庫快照；單一 CSV 不得使用不帶 dataset 後綴的完整快照命名。
- 檔名使用 24 小時制台灣本機時間，日期與時間格式 `yyyy-MM-dd_HH-mm`；主題使用簡短英文 snake_case，不得包含秘密或個人資料。
- 每次新對話先確認目前本機日期，搜尋專案根目錄及子資料夾中符合當日時間戳的 `Supabase_State_*_<dataset>.csv`，並以 manifest／清單檢查必要資料集是否齊全。只有必要資料集全部存在且驗證通過，才可作為完整快照基準；部分檔案只能標示為局部證據。
- 若本次工作需要 Supabase 結構或安全狀態，而沒有當日完整資料集組合，依 `docs/SUPABASE_SNAPSHOT_SOP.md` 提供／執行分段唯讀 SQL，等待使用者從正確專案的 SQL Editor 逐段匯出。SQL 不得包含 DDL、DML、權限變更或呼叫可能改動資料的函式。
- CSV、截圖、歷史 SQL 與本機 migration 必須標明來源及時間；不得將它們直接當成其他環境的部署證據。

## 4. Git、分支與 Push 安全

- 任務分支歸屬、多人協作及 Board 任務中的 `branch` 欄位，唯一依據為 `board/README.md`。不得直接在 `main` 上實作；開始修改前確認自己所在分支。
- 建立或切換分支／worktree 前，遵守 `board/README.md` 的事前同意與登記規則；不得以破壞性指令清場。
- **禁止 Push 的範圍只有：`supabase/` 目錄內的所有檔案，以及所有 `.csv` 檔案（不論位於哪個目錄）。** 其他檔案，包括 `AGENTS.md`、`board/`、`README.md`、前端檔案及任務文件，均不因檔案類型而禁止 push。
- Push 前必須檢查 staged files，確認沒有 `supabase/` 及 `.csv`；禁止使用未檢查內容的 `git add -A` 或 `git add .`，應明確列出允許納入的檔案。
- 未獲得本次操作的明確授權，不得實際 `git push`、合併、建立遠端 release 或修改遠端分支。使用者同意修改規則，不等於授權本次實際 push。
- 不得使用 `git restore`、`git reset`、`git checkout .`、`git clean` 等破壞性回復指令；不得擅自丟棄、改寫或格式化與本次任務無關的修改。
- 修改前後執行 `git diff --check` 及 `git status --short`；回報實際命令、exit code 與未執行項目。

## 5. Supabase 與遊戲資料安全

- Supabase 正式環境預設唯讀。未經具備相應權限的 Supabase 專案 Owner／正式授權管理者明確授權，不得執行正式資料庫寫入、migration、刪除資料、變更 RLS／grants／trigger、部署 Edge Function 或修改正式設定。
- `棒子` 是遊戲 Owner，不代表其必然是 Supabase 專案 Owner；任何 GPT 身份也不會自動取得 Supabase 權限或憑證。不得要求任何人提供 Owner 憑證、密碼或 service-role key。
- 涉及 `SECURITY DEFINER` 函式，必須檢查 `search_path`、呼叫者身份驗證、授權條件、資料存取範圍及 `EXECUTE` 權限；不能只因為存在 RLS 就判定安全。
- 前端呼叫新 RPC 前，先確認對應 RPC 已在目標環境部署且權限正確；不得先部署依賴尚不存在 RPC 的前端。
- Service-role key 不得放入前端或公開檔案。管理員操作須驗證可信的伺服器端身份與授權。
- 區分登入雲端存檔與離線／本機遊玩路徑；新增伺服器端操作時，避免破壞既有離線行為。
- 不得把客戶端傳入的存檔或成就進度視為可信證據。涉及貨幣、材料、道具、獎勵或成就時，檢查是否可被客戶端偽造，以及操作是否具交易原子性與重複請求冪等性。
- 核對 RPC 名稱、參數名稱、型別、回傳格式與前端呼叫是否完全一致；同名 overload 也要一併確認。變更資料庫安全邏輯時，補充或更新隔離測試，涵蓋未授權呼叫、資源不足、重複領取、併發請求及客戶端竄改。

## 6. 證據與回報

- 清楚區分已驗證事實、推論、建議及未知項目；不以本機檔案推定線上部署狀態。
- 對外回報應包含實際修改檔案、分支、測試命令與 exit code、未完成事項、風險及需要人類／Owner 決策的項目。
- 不得將未執行的測試、部署、pull、merge 或 push 描述成已完成。
