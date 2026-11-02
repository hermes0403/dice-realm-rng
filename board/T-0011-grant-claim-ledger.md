---
id: T-0011
title: 將管理員發放獎勵改為伺服器一次性領取
status: open
from: 老查
to: any
owner:
contributors: []
reviewer:
priority: P1
created: 2026-11-01
updated: 2026-11-01
depends_on: T-0006
branch:
done_by:
done_at:
---

## 任務

將 player_grants 待領取獎勵的核銷及入帳移至伺服器，取代前端 applyPendingGrants() 依賴 localStorage 記錄已套用的方式，確保每筆 grant 只會入帳一次。

## 範圍與禁止

- 只動：
  - grant 查詢／領取 RPC、grant ID 冪等核銷、權威狀態入帳、核銷事件及前端領取結果顯示。
- 不要動：
  - 管理員 grant 建立／授權介面（除非只為配合安全契約）、一般資產交易、排行榜或其他玩家狀態。
  - 不得信任客戶端提供的 grant 數量、類型、目標玩家或 localStorage 已領取清單。
  - 不得把管理員身份或授權判斷放在前端。
- 實作前依 Board 規則取得本任務專用 branch／worktree 的人類授權；不得自行建立。

## 驗收條件

- [ ] 每筆 grant 由唯一 ID 識別，伺服器驗證登入者及 grant 目標使用者。
- [ ] 領取與資產入帳同交易完成；重複請求只回傳原結果，不會重複增加資產。
- [ ] 未授權使用者不能建立、修改、代領或核銷他人 grant。
- [ ] 前端 localStorage 不再作為 grant 是否已入帳的權威依據。
- [ ] grant 核銷結果可追蹤，失敗時不會出現已標記領取但資產未入帳。
- [ ] 補上未授權、跨帳號、重複請求、併發及 rollback 測試；依任務範圍選用適用案例。
- [ ] git diff --check exit 0；相關測試指令與 exit code 記錄於任務紀錄。

## 紀錄

<!-- 只增不改。格式：- YYYY-MM-DD HH:MM [作者] 內容 -->
- 2026-11-01 20:16 [老查] 依 T-0002 第 5 階段拆分建立。依賴 T-0006。實作尚未開始；branch/worktree 需依 Board 規則取得人類授權。

## 完工回報

### 改了什麼

### 怎麼驗證的

### 沒做／做不到的

### 衍生任務
