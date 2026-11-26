import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../ui/guild.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../guild.css', import.meta.url), 'utf8');

test('公會主導覽包含五個彩色功能卡片', () => {
  for (const label of ['今日任務', '公會排行榜', '公會郵箱', '尋找公會', '公會設定']) {
    assert.ok(source.includes(label), '缺少導覽項目：' + label);
  }
  assert.match(source, /guild-nav-grid/);
  assert.doesNotMatch(source, /label: '返回主頁'/);
  assert.match(source, /guild-nav-card/);
  for (const tone of ['green', 'gold', 'blue', 'teal', 'purple']) {
    assert.ok(source.includes("tone: '" + tone + "'"), '缺少卡片色系：' + tone);
  }
});

test('公會子頁獨立顯示，並提供返回公會主頁操作', () => {
  assert.match(source, /function renderBackButton\(\)/);
  assert.match(source, /data-guild-back/);
  assert.match(source, /button\.matches\('\[data-guild-back\]'\)/);
  assert.match(source, /activeView = currentData\?\.guild \? 'home' : 'find'/);
  assert.match(source, /root\(\)\.innerHTML = renderBackButton\(\)/);
});

test('公會成員資訊由 RPC 回傳資料產生，且可展開完整名單', () => {
  assert.match(source, /guild\.member_count/);
  assert.match(source, /member\.username/);
  assert.match(source, /member\.role/);
  assert.match(source, /guild_get_my_guild/);
  assert.match(source, /data-guild-members-toggle/);
  assert.match(source, /showAllMembers/);
});

test('公會每日任務與設定頁均已接入實際功能', () => {
  assert.match(source, /guild_get_daily_tasks/);
  assert.match(source, /加入公會後即可查看每日任務與共享經驗/);
  assert.match(source, /guild_get_ranking/);
  assert.match(source, /guild-ranking-row/);
  assert.match(source, /function renderSettings\(\)/);
  assert.match(source, /guild_update_settings/);
  assert.doesNotMatch(source, /公會設定功能尚未開放/);
});

test('既有公會操作仍由伺服器 RPC 執行', () => {
  for (const rpc of ['guild_create', 'guild_search', 'guild_apply', 'guild_review_application', 'guild_leave']) {
    assert.ok(source.includes("'" + rpc + "'"), '缺少 RPC：' + rpc);
  }
});

test('公會樣式採淺色卡片與五種柔和彩色入口', () => {
  assert.match(styles, /#fff/);
  for (const tone of ['blue', 'green', 'gold', 'teal', 'purple']) {
    assert.ok(styles.includes('.tone-' + tone), '缺少樣式色系：' + tone);
  }
  assert.match(styles, /@media\(max-width:700px\)/);
});


test('退出公會只在設定頁出現，並且必須完成兩階段確認', () => {
  const settings = source.slice(source.indexOf('function renderSettings()'), source.indexOf('function renderMembers'));
  const home = source.slice(source.indexOf('function renderHome()'), source.indexOf('function render()'));
  assert.match(settings, /id="guildLeaveBtn"/);
  assert.doesNotMatch(home, /guildLeaveBtn/);
  assert.match(source, /data-guild-leave-next/);
  assert.match(source, /data-guild-leave-confirm/);
  assert.match(source, /leaveConfirmStep !== 2/);
  assert.match(source, /confirmButton\.disabled = true/);
  assert.match(source, /await rpc\('guild_leave'\)/);
  assert.match(source, /會長需先完成會長轉讓或解散程序/);
  assert.match(styles, /guild-leave-overlay/);
});


test('公會郵箱以彈出視窗開啟，關閉後保留主頁，並可用 Escape 關閉', () => {
  assert.match(source, /function renderMailboxOverlay\(\)/);
  assert.match(source, /data-guild-mailbox-overlay/);
  assert.match(source, /data-guild-mailbox-close/);
  assert.match(source, /event\.key === 'Escape' && \(mailboxOpen \|\| findOpen\)/);
  assert.match(source, /mailboxOpen = false;\s*render\(\)/);
  assert.match(styles, /guild-mailbox-overlay/);
  assert.match(styles, /max-height:min\(88dvh,820px\)/);
});


test('尋找公會以彈出視窗呈現，背景頁面保留且可用 Escape 關閉', () => {
  assert.match(source, /function renderFindOverlay\(\)/);
  assert.match(source, /data-guild-find-overlay/);
  assert.match(source, /data-guild-find-close/);
  assert.match(source, /button\.dataset\.guildView === 'find'/);
  assert.match(source, /findOpen = false;\s*render\(\)/);
  assert.match(styles, /guild-find-overlay/);
  assert.match(styles, /max-height:min\(88dvh,820px\)/);
});
