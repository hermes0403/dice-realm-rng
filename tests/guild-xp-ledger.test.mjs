import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../docs/migrations/20261127063546_guild_xp_award_ledger_and_admin_grants.sql');
const backfill = read('../docs/migrations/20261127065146_guild_xp_ledger_backfill_existing_awards.sql');
const snapshots = read('../docs/migrations/20261127065342_guild_xp_ledger_member_name_snapshots.sql');
const consoleMigration = read('../docs/migrations/20261127071500_guild_xp_admin_console.sql');
const accuracyMigration = read('../docs/migrations/20261127072000_guild_xp_admin_console_history_accuracy.sql');
const html = read('../index.html');
const nav = read('../admin/navigation.js');
const adminUi = read('../admin/ui-bindings.js');
const playerManagement = read('../admin/player-management.js');
const script = read('../script.js');
const sw = read('../sw.js');
const edge = read('../backend/edge-functions/dice-rng-admin/index.ts');

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
  assert.ok(backfill.includes('guild_daily_member_progress'));
  assert.ok(backfill.includes('guild_daily_task_claims'));
  assert.ok(backfill.includes('guild_daily_login_bonuses'));
  assert.match(snapshots, /member_name/);
  assert.match(adminUi, /歷史補登；舊資料無法回推當時加成後 XP 數量/);
});
test('admin XP console groups history, guild grant, and player cumulative XP under one category', () => {
  for (const id of ['adminXpCategoryFold','adminGuildXpHistoryFold','adminGuildXpGrantFold','adminGuildXpPlayersFold','adminGuildXpHistoryList','adminGuildXpGuild','adminGuildXpPlayersList']) assert.ok(html.includes(id), 'missing '+id);
  assert.match(nav, /label: 'XP 管理'/);
  assert.match(adminUi, /guild_xp_dashboard/);
  assert.match(adminUi, /grant_scope==='guild'/);
  assert.match(edge, /admin_grant_guild_xp_to_guild/);
  assert.match(edge, /admin_get_guild_xp_dashboard/);
  assert.match(consoleMigration, /admin_grant_guild_xp_to_guild/);
  assert.match(consoleMigration, /admin_get_guild_xp_dashboard/);
  assert.match(consoleMigration, /task_key<>'all_login'/);
  assert.match(accuracyMigration, /historical_unknown_count/);
  assert.match(adminUi, /historical_unknown_count/);
  assert.match(adminUi, /舊加成後數量無法還原/);
});
test('admin panel can select a guild, submit reasoned XP, and inspect recent ledger rows', () => {
  for (const id of ['adminGuildXpGuild','adminGuildXpAmount','adminGuildXpReason','adminGuildXpGrantBtn','adminXpCategoryFold','adminGuildXpHistoryList']) {
    assert.ok(html.includes(id), 'missing '+id);
  }
  assert.doesNotMatch(playerManagement, /adminGuildXpTarget/);
  assert.match(adminUi, /guild_xp_grant/);
  assert.match(adminUi, /guild_xp_history/);
  assert.match(adminUi, /all_login/);
  assert.match(html, /玩家累積 XP/);
  assert.match(html, /全員登入 \+20 與管理員整個公會發放屬於公會共享 XP/);
  assert.match(adminUi, /member_snapshot/);
  assert.match(adminUi, /Asia\/Taipei/);
});
test('XP history is lazy-loaded and adds no timer or realtime subscription', () => {
  assert.match(adminUi, /adminGuildXpHistoryFold.*toggle/);
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
  assert.match(sw,/dice-realm-shell-v2\.55/);
});
