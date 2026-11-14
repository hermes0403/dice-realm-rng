---
id: T-0074
title: 鎖定星星雲端保存、設定頁精簡與版本號
status: done
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-12
updated: 2026-11-12
depends_on: [T-0073]
branch: task/T-0074-lock-persistence-settings-version
done_by: 叉子
done_at: 2026-11-12
---

## 需求
- 鎖定骰子的星星狀態必須寫入雲端存檔；登出、關閉頁面、重新登入或更換裝置後仍保留。
- 星星改為明顯黃色。
- 設定頁玩家名稱區只顯示「玩家名稱」、目前名稱與「更改名稱」按鈕；點擊後輸入新名稱。
- 帳號區只保留「登出」與「刪除本機帳號」，移除原本兩段說明文字。
- 設定頁最下方顯示版本 V1.01。
- 後續每次收到新的修改需求，版本號增加 0.01。

## 驗收
- [x] 雲端 payload 包含 lockedDice，讀取後恢復鎖定標記。
- [x] 本機存檔正常保留 lockedDice。
- [x] 名稱按鈕可正常修改並同步排行榜名稱。
- [x] 設定頁文字與版本號符合需求。
- [x] 相關 CI 與 Pages 部署成功。
