import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../docs/migrations/20261127063546_guild_xp_award_ledger_and_admin_grants.sql');
const html = read('../index.html');
const adminUi = read('../admin/ui-bindings.js');
const playerManagement = read('../admin/player-management.js');
const script = read('../script.js');
const sw = read('../sw.js');

test('guild XP ledger is private to server-side callers and idempotent', () => {
  assert.match(migration, /award_key text not null unique/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.guild_xp_award_ledger from public, anon, authenticated/i);
  assert.match(migration, /on conflict\(award_key\) do nothing/i);
  assert.match(migration, /grant execute on function public\.admin_grant_guild_xp[\s\S]*to service_role/i);
});
test('all existing XP task paths write the same ledger', () => {
  assert.match(migration, /record_guild_presence[\s\S]*add_guild_xp_with_ledger[\s\S]*online/);
  assert.match(migration, /track_guild_roll_progress[\s\S]*add_guild_xp_with_ledger[\s\S]*rolls/);
  assert.match(migration, /all_login:[\s\S]*member_snapshot/);
  assert.match(migration, /admin_manual/);
});
test('admin panel can select a player, submit reasoned XP, and inspect recent ledger rows', () => {
  for (const id of ['adminGuildXpTarget','adminGuildXpAmount','adminGuildXpReason','adminGuildXpGrantBtn','adminGuildXpHistoryFold','adminGuildXpHistoryList']) {
    assert.ok(html.includes(id), 'missing '+id);
  }
  assert.match(playerManagement, /adminGuildXpTarget/);
  assert.match(adminUi, /guild_xp_grant/);
  assert.match(adminUi, /guild_xp_history/);
  assert.match(adminUi, /all_login/);
  assert.match(adminUi, /member_snapshot/);
  assert.match(adminUi, /Asia\/Taipei/);
});
test('XP history is lazy-loaded and adds no timer or realtime subscription', () => {
  assert.match(adminUi, /adminGuildXpFold.*toggle/);
  assert.doesNotMatch(adminUi, /setInterval\([^)]*guild.?xp/i);
  assert.doesNotMatch(adminUi, /channel\([^)]*guild.?xp/i);
});
test('admin module cache versions are aligned between app imports and service worker', () => {
  for (const path of ['admin/grants.js','admin/player-management.js','admin/ui-bindings.js']) {
    const base=path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const appVersion=script.match(new RegExp("from ['\"]\\./"+base+"\\?v=([^'\"]+)['\"]"))?.[1];
    const swVersion=sw.match(new RegExp("'\\./"+base+"\\?v=([^'\"]+)'"))?.[1];
    assert.ok(appVersion, 'missing app cache version for '+path);
    assert.equal(swVersion,appVersion,'cache version mismatch for '+path);
  }
  assert.match(sw,/dice-realm-shell-v2\.51/);
});
