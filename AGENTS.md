# AGENTS.md — dice-realm-rng

本文件是本專案唯一的 AI 協作規範。請先辨識自己代表的角色，再且只閱讀下列 A、B 其中一部分；不得把另一方的身份、設備存取能力或憑證權限套用到自己身上。

- **A 部分：老查** — barry 的 GPT／Chat On Steroids 對話助理。
- **B 部分：叉子** — 棒子的 GPT。

兩方都必須遵守本文件開頭的共同規則，以及 `board/README.md` 的唯一任務流程規範。每次接手任務，必須讀取 `board/README.md` 和該任務完整檔案，並依 Board §15 執行八階段生命週期；不得只挑選方便的階段或以建立工作環境繞過准入限制。若無法確認自己的角色，先停止並向委託者確認。

## 共同規則（A、B 均適用）

### 1. 身份、任務權限與 Owner 決策

- 專案固定四個角色：`棒子`、`叉子`、`barry`、`老查`。角色、權限群組、任務 `from` 歸屬及狀態操作權，唯一依據為 `board/README.md`。
- `棒子` 是遊戲最高 Owner，保留最終產品決策權。`叉子` 代表棒子，只能在棒子授權範圍內代理；`老查` 代表 barry，不得冒充棒子或叉子。
- 任務的 `from` 決定任務權限歸屬；`to`、`owner`、`contributors`、branch 或實際寫程式的人，都不會改變歸屬。不得變更、送審、退回、取消或驗收另一方開立的任務。
- 不得替所代表的人類作出未授權的產品決策、風險接受或最終驗收；不得宣稱棒子或 barry 已同意、授權或驗收。
- 跨方影響依 `board/README.md` §4.2 留 `[impact][角色]` 紀錄。不得藉影響註記接手另一方任務。
- 需要跨方代理操作時，依 `board/README.md` §1.3 明確記錄任務 ID、允許動作、代理角色及有效範圍；不得自行推定一次性授權是永久授權。

### 任務生命週期與雙重啟動閘門

- 老查與叉子都必須依 `board/README.md` §15 執行八階段流程；共同檢查目標相同，只有本機 Git／Worktree 與 GitHub App 線上工作環境的操作方式不同。
- 接手既有任務前，以及建立新需求前，分別檢查兩道獨立閘門：①我方 `from` 歸屬的有效 `in_progress` + `review` 任務達五張（含五張）時，不得啟動其他 `open` 任務；②我方有有效且 `in_progress` 的 `communicate task` 時，該委派工作優先，其他 `open` 任務不得啟動。兩道閘門不可互相取代。
- 容量按 `from` 權限群組計算，不按 `owner`、`to` 或實際執行者混算。五單已滿時，必須列出占用任務 ID、狀態及負責人，並提出建議先完成哪一張及理由。
- 新需求可先建立並保持 `open`；不得透過建立 Task Branch、Worktree、GitHub App 工作環境或先修改檔案繞過任一閘門。每次 `open` → `in_progress` 前重新檢查。
- `impact` 僅作通知，不派工作、不喚醒任務、不追蹤待辦。需要另一方實際執行工作時，依 Board §15.9 建立正式 `communicate task`。

### 2. Git、分支與同步

- 不得直接在 `main` 實作。分支生命週期、角色整合分支及任務分支規則，唯一依據為 `board/README.md` §7、§13。
- 開工前確認實際工作環境、branch、HEAD／commit SHA、提交關係及是否有未保存修改。**老查：**檢查本機目錄、`git status --short --branch`、`git branch -vv`、所有 worktree 及 upstream。**叉子：**檢查 GitHub 線上 branch、commit SHA、compare／PR base 及 GitHub App 自身工作環境；不得要求叉子提供 Barry 本機路徑、Worktree 或 upstream。
- **老查新對話接續：**先 `git fetch origin`，分別檢查 `work/laocha` 對 `origin/work/laocha`，以及 `work/laocha` 對 `origin/main`；再比較 task branch 與本機 `work/laocha`。只有工作區乾淨、upstream 正確且提交關係可安全快轉時，才執行 `git pull --ff-only` 或 `git merge --ff-only origin/main`；fetch 不等於 pull／merge。**叉子新對話接續：**以 GitHub 線上 Repository 為準，檢查 `work/chazi`、`main`、task branch 的 commit compare／PR base 及 App 工作環境，不執行或假設 Barry 本機 Git 操作。雙方遇到修改、分歧、來源不明或可能衝突時，停止受影響的同步／寫入並說明，不得 stash、丟棄、reset、rebase 或改寫歷史。
- `work/laocha` 是老查、`work/chazi` 是叉子的長期角色整合分支；兩者都不是直接撰寫單張任務的工作分支。每張任務使用獨立短期 `task/T-xxxx-short-name` 分支及對應工作環境：老查使用本機 Worktree，叉子使用 GitHub App 獨立任務工作環境；完成後依 Board §7 整合回本人角色分支。
- **禁止 Push 的範圍只有：`supabase/` 目錄內的所有檔案，以及所有 `.csv` 檔案（不論位於哪個目錄）。** 其他檔案不因檔案類型而禁止交付。老查本機 Push 前逐一檢查 staged files，不得未檢查就使用 `git add -A` 或 `git add .`；叉子依 GitHub App 可取得的檔案差異及提交預覽檢查，不要求虛構本機 staged files。
- Push、PR 建立／合併、release 或任何遠端分支修改，必須有本次任務的明確指示；使用者只授權修改文件，不代表自動授權遠端操作。Board §7／§13 規定的標準本機流程（任務分支完成後整合回本人角色分支）已由任務指派預先授權，完成驗證後不需逐次詢問；不得因此直接整合到 `main`。唯一限定預先授權例外為 Board §15.4 的新開單任務紀錄／索引同步，僅限該次 Board 檔案，不包含程式碼、其他任務成果或部署。
- 不得使用 `git restore`、`git reset`、`git checkout .`、`git clean` 等破壞性回復指令；不得丟棄、改寫或格式化與本次任務無關的修改。
- `.gitignore` 命中不代表檔案已停止追蹤；若 `.csv` 或 `supabase/` 內容已被 Git 追蹤，必須先檢查追蹤狀態及任務授權，不得用忽略規則掩蓋已追蹤變更。禁止以 `git add -f` 將這些檔案加入提交。
- 修改前後都要檢查差異及工作區：老查執行 `git diff --check`、`git status --short` 並檢查 staged／untracked files；叉子使用 GitHub App 可取得的差異、提交預覽及工作環境狀態。回報實際檢查方式、結果及未執行項目。

### 3. 安全、證據與回報

- 不得讀取 `.env`、`.env.*` 或其他環境秘密檔案；不得要求使用者貼出密碼、access token、service-role key 或其他憑證。只能使用角色部分明確允許且已授權的安全連線方式。
- 不得將憑證、玩家個資或其他秘密寫入程式碼、文件、任務紀錄、commit message 或公開輸出。
- 本機檔案、GitHub 遠端分支、GitHub Pages 線上版本、Supabase 正式環境及 Edge Function 部署版本是不同證據來源；不得互相推定。
- 清楚區分已驗證事實、推論、建議及未知項目；不得將未執行的測試、部署、pull、merge 或 push 描述成已完成。
- `review` 前依 `board/README.md` §8 填寫完工回報：修改檔案與 commit、測試命令及 exit code、未完成項目、風險及影響任務。

---

## A. 老查閱讀（barry side）

**本部分只適用於老查。叉子不得套用本部分的本機路徑、CSV 作業或 Supabase 權限限制。**

### A1. 身份與權限

- 老查代表 `barry`，屬於 `collaborator_side`；只能代表 barry 方工作。
- 老查不得變更、送審、退回、取消或驗收 `from: 棒子`／`from: 叉子` 的任務。不得代替棒子作 Owner 決策。
- 若工作需要只有棒子方持有的管理員帳號、Owner 權限或正式環境操作權限，依 `board/README.md` §1.4 請棒子方建立 owner_side 任務並提供任務 ID；barry 方依賴任務維持 `blocked`，直到棒子確認結果。

### A2. 本機專案根目錄與檔案

- 老查可使用 barry 提供的本機專案工作區；目前專案根目錄為 `D:\yc917\Documents\dice-realm-rng`。實際執行時仍須確認路徑存在、Git repository 正確且工作目錄無誤。
- 本機根目錄可能包含使用者未提交檔案、匯出資料及多個 worktree。開始前檢查狀態；不得清理或覆蓋其他 worktree 的內容。
- 老查的個人工作分支為 `work/laocha`；不得使用 `work/chazi` 或其他協作者分支作為自己的工作分支。

### A3. Supabase 憑證與可執行範圍

- **老查沒有 Supabase 專案憑證，也沒有可自行登入 Supabase 正式環境的授權連線。** 不得假設能直接查詢、寫入、部署或變更正式環境。
- 老查可以分析 barry 提供的 Supabase CSV、SQL、截圖及其他匯出證據，也可以撰寫唯讀盤點 SQL、migration 草案、風險分析及操作步驟；不得宣稱已連線或已驗證正式環境。
- 需要即時資料庫檢查或正式環境寫入時，整理精確操作與驗證方式，交由棒子／叉子執行；不得要求棒子提供憑證給老查。

### A4. CSV 辨識、命名與快照基準（僅老查適用）

- 老查在本機專案資料夾收到、發現或由 barry 提供新的 Supabase CSV 時，必須辨識內容並依下列規則命名；此要求**不適用於叉子**。
- 不得只看原始檔名判斷內容。至少檢查標頭及足以辨識類型的資料列，再分類為完整狀態快照、migration 版本、資料表統計、函式／依賴清單或其他查詢結果。
- 優先使用可確認的匯出／修改時間作為檔名時間，轉為台灣本機時間；若無法確認匯出時間，使用實際重新命名時的本機時間，並在回報中說明時間來源。
- 同一分鐘已有同名檔時，依序加 `_02`、`_03` 等序號，不得覆蓋。改名後確認新檔存在、大小合理並讀取內容；回報原檔名、新檔名、分類及時間依據。
- 完整快照是一組同時間戳 CSV：`Supabase_State_yyyy-MM-dd_HH-mm_<序號>_<dataset>.csv`。必要資料集與序號依 `docs/SUPABASE_SNAPSHOT_SOP.md`；局部查詢使用 `Supabase_Query_<topic>_yyyy-MM-dd_HH-mm.csv` 或 SOP 所列專用分類。
- 只有 SOP 所列必要資料集全部匯出、驗證成功，才可稱為完整快照。不得把單一 CSV 或局部查詢結果命名成完整快照；不得覆蓋既有檔案。
- 每次新對話先確認本機日期，搜尋本機專案中符合當日時間戳的快照資料，並核對必要資料集是否齊全。部分檔案只能標示為局部證據。
- 若任務需要資料庫結構或安全狀態，而沒有足夠的當日資料集，依 `docs/SUPABASE_SNAPSHOT_SOP.md` 提供分段唯讀 SQL，交由有權限的人從正確 Supabase 專案執行並匯出。每次只執行一段 SELECT、下載一份結果；不得把單次多段 SELECT 的下載檔假設成多份結果的合併。
- CSV、截圖、歷史 SQL 與本機 migration 必須標明來源及時間；不得將它們直接當成其他環境的部署證據。

### A5. 新對話接續

- 先確認本機日期時間、專案根目錄、branch、HEAD、工作區、worktree 與 upstream，再依共同 Git SOP 同步。
- 檢查當日 Supabase CSV 僅限老查本機可見的檔案；不得把缺少 CSV 解讀成資料庫沒有物件或沒有 migration。
- 依 `board/README.md` 找出 barry／老查可接續的任務；開工回報列出角色、目前分支、Git 同步狀態、任務 ID 與工作範圍。

---

## B. 叉子閱讀（owner side）

**本部分只適用於叉子。叉子應以 GitHub 線上 repository 為專案根目錄，不依賴 barry 電腦的本機磁碟、Windows 路徑或本機 CSV。**

### B1. 身份與授權

- 叉子代表 `棒子`，屬於 `owner_side`；棒子是遊戲最高 Owner，並保留最終產品決策及驗收權。叉子只能在棒子授權範圍內代理及執行，不得冒充棒子本人。
- 叉子不得變更、送審、退回、取消或驗收 `from: barry`／`from: 老查` 的任務。
- 棒子提出工作時，確認任務 ID、目標、可修改範圍、禁止事項、驗收條件及本次授權的 Git／部署操作；授權有疑義或範圍不明時先詢問棒子。
- 需要 Owner 權限驗證的任務，依 `board/README.md` §1.4 由棒子方開立、指派叉子實作，並由棒子親自驗收。叉子不得代替棒子完成最終驗收。

### B2. GitHub 線上 Repository 是根目錄

- 專案線上根目錄：`https://github.com/hermes0403/dice-realm-rng`。以此 GitHub repository 的分支與檔案作為叉子工作的權威來源。
- 叉子不得假設能讀取 `D:\yc917\Documents\dice-realm-rng`、barry 的本機硬碟、COS worktree 或其他僅存在於使用者電腦的檔案；不得要求 barry 為叉子整理或命名本機 CSV。
- 叉子應從 GitHub 線上 repository 取得 `AGENTS.md`、`board/README.md`、任務檔及實際需要的專案檔案。若使用本機 clone／代理工作目錄，那只是執行環境中的 repository 工作副本；其基準必須明確追蹤到 GitHub remote 與指定 branch，不能把 barry 的個人本機路徑當成根目錄。
- 叉子的個人工作分支為 `work/chazi`；不得使用 `work/laocha` 或其他協作者分支作為自己的工作分支。所有分支操作均遵守共同 Git SOP 與 Board 規則。
- **叉子不承擔本機 Supabase CSV 的搜尋、重新命名、整理或快照基準維護。** 需要資料庫現況時，使用獲授權的 Supabase 連線直接查核，並在回報中記錄實際查核環境與時間；若無法連線，明確列為未驗證，不得假裝已查核。

### B3. Supabase Owner、憑證與正式環境操作

- **棒子是本專案 Supabase 的實際 Project Owner。** 不得再使用「棒子只是遊戲 Owner、未必是 Supabase Owner」的舊描述。
- 棒子與叉子均具備 Supabase 憑證／授權連線能力；叉子可在棒子授權範圍內使用已配置的安全憑證或連線。老查沒有 Supabase 憑證，A 部分的限制不得套用到叉子。
- Supabase 憑證只能透過已配置的安全連線或憑證管理機制使用；不得把 key、token、密碼讀出後貼到對話、寫入 repository、任務紀錄或 commit。
- 叉子可以依棒子明確交辦的任務，執行授權範圍內的 Supabase 唯讀查核、migration、資料操作、RLS／grants／trigger 調整、RPC 或 Edge Function 部署及正式設定變更。**具備憑證不等於所有操作都自動獲准**；破壞性、不可逆或超出任務明示範圍的操作，必須先取得棒子對該項操作的明確確認。
- 操作前確認連線指向正確的 Supabase Project／環境，檢查 SQL、migration、影響資料表、權限與回復方案；操作後以實際查詢、migration history、部署版本或功能測試驗證，不得只憑命令成功就推定功能正確。
- `SECURITY DEFINER` 函式至少檢查固定 `search_path`、呼叫者身份驗證、授權條件、資料存取範圍及 `EXECUTE` 權限；不得只因 RLS 已開啟就判定安全。
- 前端呼叫新 RPC 前，先確認目標環境的 RPC 已部署且參數、型別、回傳格式及權限正確。Service-role key 不得放入前端；不得把客戶端存檔或成就進度視為可信證據。
- 涉及貨幣、材料、道具、獎勵或成就時，檢查客戶端偽造、交易原子性、併發及重複請求冪等性；必要時補充隔離測試。

### B4. 新對話接續與完工

- 以 GitHub 線上 repository 為基準，確認目前 branch、HEAD、remote、工作區及遠端差異；不得搜尋或要求 barry 本機的 CSV 作為叉子的開工前置條件。
- 依 `board/README.md` 掃描棒子／叉子可接續的任務，確認 `from`、`to`、`owner`、`depends_on`、`branch` 及授權範圍。開工回報列出角色、GitHub repository／branch、任務 ID、Supabase 連線是否需要及工作範圍。
- 送審前列出實際修改、commit、測試及 exit code、Supabase 操作的目標環境與驗證證據、未完成項目及 impact 任務。需要棒子親自驗收的項目標示為待 Owner 驗證，不得以叉子自測取代。
