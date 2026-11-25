import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../ui/guild.js', import.meta.url), 'utf8');

test('公會主導覽包含示意圖的五個入口', () => {
  for (const label of ['返回主頁', '今日任務', '公會排行榜', '尋找公會', '公會設定']) {
    assert.ok(source.includes(label), '缺少導覽項目：' + label);
  }
  assert.match(source, /data-go="roll"/);
});

test('公會成員資訊由 RPC 回傳資料產生', () => {
  assert.match(source, /guild\.member_count/);
  assert.match(source, /member\.username/);
  assert.match(source, /member\.role/);
  assert.match(source, /guild_get_my_guild/);
});

test('未完成的公會功能明確標示尚未開放', () => {
  assert.match(source, /公會任務系統尚未開放/);
  assert.match(source, /公會排行榜尚未開放/);
  assert.match(source, /公會設定功能尚未開放/);
});

test('既有公會操作仍由伺服器 RPC 執行', () => {
  for (const rpc of ['guild_create', 'guild_search', 'guild_apply', 'guild_review_application', 'guild_leave']) {
    assert.ok(source.includes("'" + rpc + "'"), '缺少 RPC：' + rpc);
  }
});
