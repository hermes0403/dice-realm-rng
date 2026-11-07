# dice-realm-rng

本專案採棒子方與協作者方共同開發。開始任何工作前，先閱讀以下文件：

1. [`AGENTS.md`](./AGENTS.md)：專案環境、Git、Supabase、安全及 AI 執行規範。
2. [`board/README.md`](./board/README.md)：角色權限、任務狀態、八階段生命週期、雙重啟動閘門、跨方委派、分支及驗收流程；Board 流程以此文件為唯一依據。
3. [`board/_TEMPLATE.md`](./board/_TEMPLATE.md)：建立任務時使用的完整 frontmatter 與紀錄範本。

目前工作任務請從 [`board/README.md` 的任務索引](./board/README.md#14-目前任務索引)進入，並閱讀對應任務全文。所有工作依 [`board/README.md` §15](./board/README.md#15-八階段任務生命週期)執行；每位協作者使用自己的工作分支，任務狀態權限由 `from` 決定，只有正式 communicate task 可依 §15.9 取得明確限定的跨方操作權。

前端架構與函式歸屬請參考 [`docs/FRONTEND_MODULE_MAP.md`](./docs/FRONTEND_MODULE_MAP.md) 及 [`docs/FRONTEND_FUNCTION_OWNERSHIP.md`](./docs/FRONTEND_FUNCTION_OWNERSHIP.md)。Supabase 唯讀盤點程序請參考 [`docs/SUPABASE_SNAPSHOT_SOP.md`](./docs/SUPABASE_SNAPSHOT_SOP.md)。

Board 任務格式、`returned` 與 Communicate 鎖定關係可執行 `node scripts/validate-board.mjs` 驗證；容量盤點可加 `--side=collaborator_side` 或 `--side=owner_side`。驗證工具測試使用 `node --test tests/board-lifecycle.test.mjs`。
