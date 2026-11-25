import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../ui/guild.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../guild.css', import.meta.url), 'utf8');

test('公會主導覽包含示意圖的五個彩色功能卡片', () => {
  for (const label of ['今日任務', '公會排行榜', '尋找公會', '公會設定']) {
    assert.ok(source.includes(label), '缺少導覽項目：' + label);
  }
  assert.match(source, /guild-nav-grid/);
  assert.doesNotMatch(source, /label: '返回主頁'/);
  assert.match(source, /guild-nav-card/);
  assert.match(source, /go: 'roll'/);
  for (const tone of ['blue', 'green', 'gold', 'teal', 'purple']) {
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

test('公會每日任務已接入伺服器 RPC，其他未完成功能仍標示尚未開放', () => {
  assert.match(source, /guild_get_daily_tasks/);
  assert.match(source, /加入公會後即可查看每日任務與共享經驗/);
  assert.match(source, /公會排行榜尚未開放/);
  assert.match(source, /公會設定功能尚未開放/);
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
