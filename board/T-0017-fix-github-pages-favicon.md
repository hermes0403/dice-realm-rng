---
id: T-0017
title: 修正 GitHub Pages 瀏覽器分頁 favicon 宣告
status: review
from: 老查
to: any
owner: 老查
contributors: []
reviewer:
priority: P3
created: 2026-11-02
updated: 2026-11-02
depends_on: []
branch: work/laocha
done_by:
done_at:
---

## 任務

GitHub Pages 已能正常回應既有 `favicon.ico`，但首頁 HTML 的 `<head>` 未宣告 favicon，瀏覽器可能不會在分頁顯示專案圖示。新增明確的相對路徑 icon link，確保部署於專案子路徑時仍能正確解析。

## 範圍與禁止

- 只動：`index.html` 的 favicon 宣告，以及本任務必要的 Board 任務紀錄／索引。
- 使用既有 `favicon.ico`，不替換圖示檔、不新增第三方套件。
- 不要動：遊戲邏輯、樣式、Supabase、其他前端模組或部署設定。
- 不得修改其他協作者的分支或工作目錄。

## 驗收條件

- [x] `index.html` 的 `<head>` 包含 `rel="icon"`，路徑為 `./favicon.ico`。
- [x] `favicon.ico` 在 GitHub Pages 專案路徑可回應成功。
- [x] HTML favicon 宣告與圖示檔案均可由部署後首頁解析。
- [x] `git diff --check` 通過，提交內容僅包含本任務允許檔案。

## 紀錄

- 2026-11-02 [老查] 開單。確認線上首頁 HTTP 200、`favicon.ico` HTTP 200（4,286 bytes），但首頁 HTML 缺少 favicon link。經 barry 同意，使用隔離 worktree `D:\yc917\Documents\dice-realm-rng\.worktrees\work-laocha` 與分支 `work/laocha`，從 `origin/main`（`969bd16`）開始修正；原工作目錄的未提交修改保持不動。
- 2026-11-02 [老查] 完成修正並推送：`index.html` 在 `<head>` 新增 `<link rel="icon" href="./favicon.ico" type="image/x-icon">`；Board 索引同步新增 T-0017。`git diff --check` exit 0；staged allowlist 僅含 `index.html`、`board/README.md`、本任務檔；commit `06d1f0a`。將 `work/laocha` fast-forward 推送至 `main`，遠端 `origin/main` 已指向 `06d1f0a624b31015df417e5e1381ebaa9f057de1`。部署後首頁 HTTP 200 且 HTML 已包含 favicon link；圖示 HTTP 200、4,286 bytes、`image/vnd.microsoft.icon`。GitHub Pages workflow 已觸發，API 最後一次讀取仍顯示 `in_progress`，但實際線上 HTML 與圖示已可讀取。任務送交 review。

## 完工回報

### 改了什麼

- 在 `index.html` 的 `<head>` 宣告既有 `./favicon.ico`。
- 新增 T-0017 Board 任務檔並更新任務索引。

### 怎麼驗證的

- `git diff --check`：exit 0。
- staged files：僅 `index.html`、`board/README.md`、`board/T-0017-fix-github-pages-favicon.md`。
- GitHub Pages 首頁：HTTP 200，部署後 HTML 已包含 favicon link。
- GitHub Pages favicon：HTTP 200，4,286 bytes，`image/vnd.microsoft.icon`。
- 遠端 `origin/main`：`06d1f0a624b31015df417e5e1381ebaa9f057de1`。

### 沒做／做不到的

- GitHub Actions Pages workflow 在最後一次 API 查詢仍為 `in_progress`；但已直接確認部署後公開首頁及圖示均正常回應。

### 衍生任務／影響任務

- 無。
