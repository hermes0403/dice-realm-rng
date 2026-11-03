---
id: T-0021
title: 重整 Git 分支、worktree 與協作操作規範
status: review
from: barry
to: 老查
owner: 老查
contributors: []
reviewer: barry
priority: P2
created: 2026-11-03
updated: 2026-11-03
depends_on: []
branch: work/laocha
done_by:
done_at:
---

## 任務

檢視專案現行 Git 操作規範，解決長期只使用單一角色分支造成不同任務的未提交修改互相污染、下一張任務不得不另開分支的問題。建立角色整合分支與短期任務分支的明確生命週期，並整理目前重複、過時的 worktree 與文件。

## 範圍與禁止

- 只動：`AGENTS.md`、`board/README.md`、本任務檔、必要的 `.gitignore` 與本機 worktree 整理。
- 保留仍有價值的 Supabase migration、SQL 測試、Edge Function 原始碼及最新 Board／文件版本；舊版重複文件可丟棄。
- 不動：其他協作者未完成任務的程式碼、遠端分支、GitHub PR、GitHub Pages 部署及 Supabase 正式環境。
- 不推送 `.csv` 或 `supabase/`；不使用破壞性 Git 清場指令。

## 驗收條件

- [x] 本機老查角色分支名稱為 `work/laocha`。
- [x] 規範明確定義長期角色整合分支、短期任務分支、建立基準、整合順序與清理條件。
- [x] `AGENTS.md` 與 `board/README.md` 的 Git 規則一致，沒有互相矛盾的舊規則。
- [x] 列出需要保留的本機唯一文件及丟棄的舊版重複文件。
- [x] 整理後保留一個長期老查工作區；其他 worktree 只在資料已安全保存且無未完成工作時清理。
- [x] `git diff --check` 通過，並檢查 branch、upstream、worktree、tracked／untracked status。

## 紀錄

- 2026-11-03 18:53 [barry] 要求將分支名稱改為 `work/laocha`，丟棄舊版文件但保留重要資料，並全面檢視 Git 操作規範；指出一人長期只用一支分支會使不同任務的工作區互相污染。
- 2026-11-03 19:00 [老查] 已將本機分支由 `work-laocha` 改回 `work/laocha`，追蹤 `origin/work/laocha`；fetch 後確認 `work/laocha` 原 HEAD 是 `origin/main` 的祖先，已在本機 fast-forward 至 `d0a890a`，未推送遠端。
- 2026-11-03 19:00 [老查] 初步修訂 §7／§13：長期角色整合分支搭配每任務短期 branch/worktree；標準任務分支依 Board 任務自動建立，完成後整合回角色分支，並在送往 main 後同步共同基準。
- 2026-11-03 [老查] 本次規範遷移在新流程生效前已於 `work/laocha` 開始，因此作為一次性過渡任務保留在角色分支；新任務自 T-0021 之後依新規則使用短期 task branch/worktree，不回溯改寫既有任務的 `branch` 紀錄。
- 2026-11-03 [老查] 已將根目錄切換為唯一長期 `work/laocha` worktree；移除舊 `main-local`、`server-authoritative-frontend`、`.worktrees/work-laocha` worktree，並刪除已確認完全包含於 `origin/main` 的舊本機分支 `docs/board-readme-template`、`feat/server-authoritative-frontend`。重要本機 Supabase SQL／migration／測試與 Edge Function 原始碼已先轉存並核對 SHA-256；舊 Board／AGENTS／docs 副本改由最新 `origin/main` 版本取代。`git diff --check` exit 0；未 commit、未 push，故任務仍為 `in_progress`。
- 2026-11-03 [老查] `.gitignore` 已單獨提交為 `062a342`，確保未來從 `work/laocha` 建立的任務 worktree 也會繼承 `*.csv` 與根目錄 `/supabase/` 忽略規則。政策文件及本任務紀錄已完成本機驗證，送交 barry review；尚未 push 或建立 PR，狀態更新尚未同步到共同 `main`。

## 完工回報

### 改了什麼

- 將老查的唯一長期工作區整理為專案根目錄的 `work/laocha`。
- 更新 `AGENTS.md` 與 `board/README.md`：改採長期角色整合分支 + 每任務短期 `task/T-xxxx-short-name` 分支／worktree；規範分支建立、同步、整合、PR 與清理生命週期。
- 新增 `.gitignore`，忽略所有 `.csv` 及根目錄 `/supabase/`；本機忽略規則 commit：`062a342`。
- 保留重要本機 Supabase 檔案，並移除過時重複文件及已合併的舊本機 worktree／分支。

### 怎麼驗證的

- `git diff --check`：exit 0。
- `git ls-files '*.csv' 'supabase/**'`：無已追蹤 CSV／Supabase 檔案。
- `git check-ignore -v`：實際 CSV、migration、SQL test、Edge Function 路徑均命中 `.gitignore`。
- `git worktree list --porcelain`：僅剩專案根目錄一個 worktree，分支 `work/laocha`。
- `work/laocha` HEAD 與 `origin/main` 同步基準 `d0a890a` 相同；另有本機 `.gitignore` commit `062a342`，未推送。

### 沒做／做不到的

- 未 push、未建立 PR、未合併遠端分支；`work/laocha` 仍比 `origin/work/laocha` 超前本機提交，等待 barry 決定是否發布。
- 本次為文件與 Git 工作區整理，未執行遊戲程式測試或 Supabase 操作。

### 衍生任務／影響任務

- 新分支規則自本任務之後的新任務生效；既有任務 `branch` 欄位保留歷史值，不回溯改寫。
