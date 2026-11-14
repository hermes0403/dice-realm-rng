---
id: T-0088
title: 修復翡翠綠主題說明面板配色與主頁骰子色調
status: review
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P2
created: 2026-11-14
updated: 2026-11-14
depends_on: [T-0076]
branch: task/T-0088-restore-panel-colors-dice-accent
done_by:
done_at:
---

## 任務

恢復各頁面說明型面板原有的色彩層次，避免所有 `.hero` 面板都呈現相同的翡翠綠色塊；並調整主頁抽骰區的骰子圖案底框，降低過度飽和的綠色感。

## 修改範圍

- 盤點主頁歡迎面板、收藏圖鑑 ARCHIVE DATABASE、寵物融合機、限時活動、藥水工坊及天氣召喚等說明面板。
- 依各區塊用途恢復可辨識的專屬色彩漸層、細邊框及柔和光暈；整體仍維持深色翡翠綠科幻主題，不可把全站改回紫藍主題。
- 保留所有面板標題、說明文字的高對比度，確保不同底色上均清楚可讀。
- 主頁 `.dice` 視覺底框改為較中性的深墨綠／石墨綠，搭配低飽和薄荷綠邊框與柔和光暈；骰子圖案本身需清楚突出，不可整塊亮綠。
- 僅調整說明型面板與主頁骰子視覺色彩；不改變尺寸、間距、排列、文字、按鈕、機率、擲骰、存檔或其他遊戲邏輯。
- 不新增外部資源、網路請求或 Supabase 操作。

## 驗收條件

- [x] 所有說明型面板不再被單一 `.hero` 顏色覆蓋，並恢復各區塊可辨識的色彩層次。
- [x] ARCHIVE DATABASE 面板具有清楚的色彩漸層／邊框／光暈，且文字可讀（CSS 對比由 T-0077 規則維持；待實際畫面驗收）。
- [x] 主頁骰子視覺底框改為低飽和墨綠與薄荷綠細框；待實際畫面驗收外觀。
- [x] 僅使用顏色屬性覆蓋，沒有更動版面尺寸、間距或排列規則。
- [x] 未修改遊戲邏輯、機率、雲端存檔或按鈕功能；擲骰存檔與雲端存檔回歸測試通過。
- [x] 本次 PR 的 PWA 顯示、管理員導覽、擲骰存檔、雲端回滾、寵物背包、自動出售、寵物移除、天堂藥水機率及金錢加成 CI 全數通過。

## 預計修改檔案

- `style.css`：新增各說明面板的範圍限定配色，調整主頁骰子視覺底框。
- `index.html`：更新 CSS cache key 與遊戲版本至 V1.25。
- `sw.js`：同步 Service Worker cache name。
- `tests/`：視現有測試架構補充主題配色回歸檢查。

## 紀錄

- 2026-11-14 [叉子] 棒子回報翡翠綠主題下各說明面板原有色彩層次消失，且主頁抽骰骰子圖案整體過綠。初步確認全域 `.hero` 規則覆蓋了各面板色彩差異，`.dice` 規則則使用高飽和綠底、綠框及綠色光暈。


## 完工回報

- 修改檔案：`style.css`、`index.html`、`sw.js`、`tests/pwa-display-controls.test.mjs`。
- 程式提交：`6a33f288d93cdded53ca77c51353b276b6f146cb`；交付 PR #107 已合併，merge commit：`1adff7f1051bd07993a4c76028057735d0c4bf60`。
- 版本更新：V1.25；CSS cache key：`20261114-t0088-panel-colors`；Service Worker cache：`dice-realm-shell-v1.25`。
- 測試：PWA display、Admin navigation、Dice roll save、Cloud save rollback、Coin boost、Pet backpack/auto-sell、Pet removal/admin inventory、Heaven Potion odds 全數成功。
- GitHub Pages workflow #43549007509 成功部署。
- 未完成：未取得棒子手機／桌面實際畫面驗收，因此狀態維持 `review`，不標記 `done`。
