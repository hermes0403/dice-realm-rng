# board/ — AI 協作留言板

> 用途：讓 COS 看得到「什麼還沒完工、別的模型交辦了什麼事」，並留下「誰完工了」的紀錄。（目前沒其他模型）
> 規則的位階：**低於 `AGENTS.md`**。留言板與它衝突時，以 `AGENTS.md` 為準，並開一張 `to: human` 的任務回報。
> 本機小模型（Aider）**不讀這裡**；要交給它的事，由人類或線上模型改寫成 `AGENTS.small.md` 風格的指示。（目前也不打算使用 Aider。）

## 1. 一個任務一個檔

- 檔名：`T-<4位數編號>-<英文短名>.md`，例如 `T-0004-fix-audit-fields.md`。範本在 `_TEMPLATE.md`。
- 新編號 = 目前資料夾（含 `archive/`）最大編號 + 1。兩人撞號時，後到的改號，並通知人類。
- 一個任務 = 一件事、一次對話內做得完。太大就拆成多張，用 `depends_on` 串起來。
- 完成並驗收的任務，由驗收者 `git mv` 到 `board/archive/`，保持頂層只有「還在動的」。

## 2. 表頭（frontmatter）欄位

`id`、`title`、`status`、`from`（誰開的）、`to`（誰該做）、`owner`（實際接手的）、`priority`、`created`、`updated`、`depends_on`、`branch`、`done_by`、`done_at`。

- `from`／`to`／`owner`／`done_by` 的值只有：`human`、`cos`、`codex`、`claude`；`to` 另可填 `any`（誰有空誰接）。
- 一行一個 `key: value`，不換行，方便用 `Select-String` 掃。

## 3. 狀態與誰能改

| status | 意義 | 誰可以改成這個狀態 |
|---|---|---|
| `open` | 已交辦，沒人接 | 開單的人 |
| `in_progress` | 有人在做（`owner` 必填） | 任務新增一筆紀錄後，由接續執行者更新；紀錄作者可以是 `human` 或 `cos` |
| `blocked` | 卡住，等某件事 | 做事的人；必須寫清楚「等誰、等什麼」 |
| `review` | 已實際部署到目標環境，等待人類驗收 | 做事的人；**必須已實際部署且完工回報填完** |
| `done` | 人類明確授權標記完成 | **僅限取得人類明確授權後**；不得由 COS 自行判定或標記 |
| `cancelled` | 不做了 | 開單者或人類，須寫原因 |

**狀態轉換標準：**

- `open` → `in_progress`：新增一筆任務紀錄即可觸發，不限作者；`[human]` 或 `[cos]` 新增紀錄都符合。同步更新 `updated`，並填妥實際接手的 `owner`。
- `in_progress` → `review`：必須已將任務要求的內容實際部署到指定目標環境。只有本機實作完成、測試通過、建立 migration、準備好部署或尚未確認部署結果，都不得轉成 `review`；未部署且暫時無法繼續時使用 `blocked` 並記錄原因。
- **未經人類明確允許，任何人／模型都不得把任務 `status` 改成 `done`。** 完成程式、完成部署、驗收條件看似通過或填寫 `done_by`／`done_at`，均不等於取得授權。

不得為套用新規則而改寫舊紀錄；每次狀態轉換都要新增一筆紀錄，說明原因。

驗收者發現沒做完 → 改回 `in_progress`，並在「紀錄」寫原因。

## 3.1 人類確認驗收完成後的處理

當任務 `status: review`，且人類明確確認已可驗收／驗收通過後，依序完成以下步驟：

1. 將該任務的 `status` 改為 `done`，同步更新 `updated`、`done_by`、`done_at`，並在「紀錄」新增人類確認及狀態轉換原因。
2. 將目前任務分支合併至本機 `main`；若有衝突，保留雙方內容並處理後再完成合併。
3. 將任務檔移至 `board/archive/`，保留原檔名及完整紀錄。
4. 將上述 board 變更 commit 至本機 Git，完成後確認工作區與分支狀態。

此流程只允許本機 commit，**不得 push**。所有 `board/T-*.md`、`board/archive/` 內的任務檔，以及任何包含任務檔的 commit，均不得推送至任何遠端分支或雲端。程式碼需要推送時，必須確保推送內容不包含任務檔及其 commit。

## 4. 開工流程（每個模型每次對話都照做）

1. 讀 `AGENTS.md`，再讀你自己的繼承 prompt（`board/handoff/HANDOFF-<你>.md`）。
2. 列出任務表頭：

   ```powershell
   Get-ChildItem board\T-*.md | Select-String -Pattern '^(id|title|status|from|to|owner):'
   ```

   找出：`to` 是你或 `any` 且 `status` 為 `open`／`in_progress`／`blocked` 的；以及 `status: review` 而你是驗收者的。

3. 回報給人類：你的角色、目前所在分支（`git branch --show-current`）、你看到的待辦、你正在接續哪一張。已明確指派給自己或 `any` 且沒有未解除阻礙的任務，直接接續，不必每次等待重新確認；遇到人類決策、權限或高風險操作時才停下詢問。
4. 接手：新增一筆紀錄，將 `status` 設為 `in_progress`、填 `owner`、更新 `updated`。若已有非 `done`／非 `cancelled` 的任務且指派給自己或 `any`，依最新紀錄接續。

## 5. 紀錄與完工回報

- 「紀錄」只增不改：一行一筆，格式 `- YYYY-MM-DD HH:MM [作者] 內容`。作者標籤固定 `[human]`／`[cos]`／`[codex]`／`[claude]`。**不可刪改別人的行。** 時間請使用工具取得；若無法取得，至少寫日期並讓人看出先後順序，新的在下。
- 推到 `review` 前，必須先確認已實際部署到目標環境、填完「完工回報」，並在表頭填 `done_by`（提交 review 的執行者）、`done_at`（提交 review 的日期）。這兩個欄位只記錄 review 提交者與日期，不代表 `status: done`。回報固定四段：
  1. **改了什麼**：檔案清單（`git diff --stat`）與 commit。
  2. **怎麼驗證的**：貼指令與 exit code（例 `npm run lint; $LASTEXITCODE`）。沒跑就寫「**未驗證**」，不要寫「應該通過」。
  3. **沒做／做不到的**：誠實列出。
  4. **衍生任務**：發現的新問題，另開新單，不要塞進這張。
- 對話快滿或額度快用完時，**先**在「紀錄」寫下目前進度與下一步，讓下一位（可能是新的對話）能接。

## 6. 禁止事項

- **不寫任何機密**：`.env*` 內容、token、密碼、連線字串。這些檔會進 Git，repo 公開時會被看到。
- 不替別人的任務改狀態（除了把自己驗收不過的退回 `in_progress`）。
- 不在留言板上做產品決定。要人類決定的事，開 `to: human` 的任務，寫清楚選項與你的建議。
- 不因為「看起來沒人在做」就接 `to` 指定別人的任務；先在該任務紀錄留言、通知人類。

## 7. Git

- board 的變更**獨立一個 commit**，不跟程式碼混：`docs(board): T-0004 完工回報 [可運行]`（格式見 `AGENTS.md` §12）。
- 誰 commit 依人類當次指示；沒被指示就不 commit，只列出建議的 `git add board/<檔名>` 與 commit 指令即可。
- **多人分工時，一個任務一個分支，不要直接在 `main` 上修改。** 開工前先確認目前分支；若在 `main`，先建立該任務專用分支，再開始編輯。
- **已知限制：** 任務檔跟著分支走。你讀到的是「目前分支」的看板；在 feature 分支上更新的狀態，要 merge 回 `main` 後 `main` 才看得到。所以開工回報時要說明你讀的是哪個分支。因為一任務一檔，通常不會衝突。
- **任務檔禁止推送：** 所有任務檔（`board/T-*.md` 與 `board/archive/T-*.md`）僅供本機協作紀錄，允許本機 commit／merge，但絕對不得 push 到雲端。任何 push 前都必須確認待推送 commit 不含任務檔變更。
