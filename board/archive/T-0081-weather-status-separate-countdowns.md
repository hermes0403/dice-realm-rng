---
id: T-0081
title: 多重天氣分開顯示與獨立倒數
status: done
from: 棒子
to: 叉子
owner: 叉子
contributors: []
reviewer: 棒子
priority: P1
created: 2026-11-12
updated: 2026-11-12
depends_on: []
branch: task/T-0081-weather-status-separate-countdowns
done_by: 棒子
done_at: 2026-11-12
---

## 需求
- 同時存在多種天氣時，每種天氣各自顯示圖示、名稱及倒數，不得合併名稱。
- 每種天氣顯示自己的倒數欄位；若狀態提供各別結束時間，使用各別時間，否則沿用現有共享結束時間。
- 單一天氣及晴天正常顯示。
- 保留原有天氣效果及切換邏輯。
- 遊戲版本更新至 V1.08。

## 驗收條件
- [x] 雨天與雪天同時存在時，顯示兩個獨立項目及各自倒數。
- [x] 多種天氣名稱不再合併。
- [x] 單一天氣與晴天顯示正常。
- [x] 各天氣顏色正常，手機版不遮擋頁首資訊。
- [x] CI 與 Pages 部署成功。

## 紀錄
- 2026-11-12 20:40:38 [叉子] 依棒子「修改並部署」指示，建立任務分支並實作多重天氣分項顯示；每種天氣分別渲染圖示、名稱及倒數，支援各類型獨立結束時間欄位，未修改天氣效果及後端資料。
- 2026-11-12 20:44 [叉子] PR #66 已合併至 main，merge commit `564bc8a2cce19e14ebd2ad695757ed464fbd391f`。CI 工作流程通過；Board lifecycle run `43220227901` 成功；GitHub Pages deploy run `43220225926` 成功，build、report-build-status、deploy jobs 均完成成功。

## 驗收紀錄
- 2026-11-12 20:44 [代記:棒子/叉子] 棒子明確回覆「驗收直接成功」，正式驗收通過，狀態由 `in_progress` 改為 `done`。來源：棒子於 2026-11-12 20:44 在本對話回覆「驗收直接成功」。證據：PR #66 已合併（`564bc8a2cce19e14ebd2ad695757ed464fbd391f`）；CI 通過；Board lifecycle run `43220227901` success；Pages deploy run `43220225926` success。

## 完工回報

### 改了什麼
- `systems/weather.js`：同時存在多種天氣時，分別渲染圖示、名稱及倒數；支援各天氣獨立結束時間欄位，未提供時沿用共用結束時間。
- `style.css`：新增各天氣項目配色與手機版排版。
- `index.html`：更新 CSS 快取識別及遊戲版本至 V1.08。
- `board/README.md`：任務索引狀態更新為 done；本任務檔移入 archive。
- 程式交付 PR #66 已合併，merge commit `564bc8a2cce19e14ebd2ad695757ed464fbd391f`。

### 怎麼驗證的
- PR #66 CI 檢查全部通過，包含 achievement-persistence、board-lifecycle、pet-backpack-and-auto-sell、pet-removal-and-admin-counts、dice-roll-save、admin-navigation。
- Board lifecycle run `43220227901`：success。
- GitHub Pages deploy run `43220225926`：success；build、report-build-status、deploy jobs 均成功。
- 棒子於 2026-11-12 明確回覆「驗收直接成功」，完成 Owner 驗收。

### 沒做／做不到的
- 目前後端雙天氣資料仍共用 `ends_at`。前端已支援各類型獨立結束時間欄位，但資料源未提供時，各天氣倒數會沿用共用結束時間，因此目前可能相同。此限制已明確記錄，棒子仍確認本任務驗收成功。

### 衍生任務／影響任務
- 無。
