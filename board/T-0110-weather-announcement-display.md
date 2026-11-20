---
id: T-0110
title: 天氣召喚公告播放兩次、公告名稱縮短與水晶天氣紫色文字
status: in_progress
from: 叉子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-20
updated: 2026-11-20
depends_on: []
branch: task/T-0110-weather-announcement-display
done_by:
done_at:
---

## 任務

調整全服公告與天氣狀態顯示，維持既有觸發條件、公告通道及天氣效果：

1. 玩家召喚天氣時，原本播放一次的天氣召喚彈幕改為連續播放兩次；兩次必須依序播放，不得同時重疊。
2. 水晶天氣生效時，頁首水晶天氣名稱及該項倒數文字都顯示紫色；其他天氣的顏色不變。
3. 稀有骰子公告統一顯示為「玩家{玩家名稱}抽到了1/{分母} {骰子名稱}」。玩家名稱超過 4 個 Unicode 字元時，保留前 4 個字並加上 `..`；例如「可愛的孩子們」顯示為「可愛的孩..」。

## 範圍與禁止

- 允許修改：`systems/global-announcements.js`、`systems/realm-social.js`、`systems/weather.js`、`script.js`、`tests/global-announcements-threshold.test.js`、本任務測試及必要的專用 GitHub Actions workflow、Board 任務檔與索引。
- 不修改 `style.css`、`index.html`、`sw.js`；目前 T-0085 仍在進行且涵蓋這些共用檔案，避免覆蓋其工作。水晶文字顏色由天氣 UI 的該項輸出設定。
- 保留既有天氣公告文案、觸發條件、動畫時長、Realtime Broadcast、稀有公告 1/4096 門檻及雲端歷史寫入行為。
- 不新增 Supabase 查詢、輪詢、資料表、RPC 或 Edge Function。
- 不修改骰子機率、天氣效果、玩家資料、存檔、貨幣、道具或帳號。
- 僅更新相關模組的 import cache key；不得改動 T-0085 所屬的首頁、CSS 或 Service Worker。

## 驗收條件

- [ ] 每次天氣召喚公告完整播放兩次，第二次在第一次結束後才開始；不新增公告請求或重複廣播。
- [ ] 水晶天氣名稱與倒數均呈紫色；雨、雪、雷、地獄及其他天氣顏色不變。
- [ ] 「可愛的孩子們」公告名稱顯示為「可愛的孩..」；四字以內名稱完整顯示。
- [ ] 稀有公告格式為「玩家{名稱}抽到了1/{分母} {骰子名稱}」，分母仍使用既有千分位格式。
- [ ] 保留 1/4096 公告門檻、Broadcast 及雲端歷史紀錄行為。
- [ ] 新增／更新回歸測試；專用測試、JavaScript 語法檢查與差異空白檢查通過。
- [ ] GitHub Actions 與 GitHub Pages 部署成功；不操作 Supabase 正式資料。

## 紀錄

- 2026-11-20 21:45 [叉子] 依棒子本次指示建立。開工前以 main SHA `82ff4767ce43e887b81c481fed608824061c5d82` 檢查：owner_side 有效 in_progress 任務為 T-0085，共 1/5；未發現指派給 owner_side 的有效 Communicate task。T-0108、T-0109 已由公開 PR 使用，故本任務使用下一個可用 ID T-0110。T-0085 的共用 CSS／首頁／Service Worker 範圍將避開；`work/chazi` 維持已知分歧狀態，不重置、不清空、不作為本任務基準。

- 2026-11-20 21:46 [叉子] 狀態轉換：open → in_progress。以最新 main SHA `82ff4767ce43e887b81c481fed608824061c5d82` 複查 owner_side 容量為 1/5（T-0085）；有效 Communicate 優先閘門未觸發。任務分支由 main 建立，僅修改不與 T-0085 重疊的公告／天氣模組與測試，開始實作。
