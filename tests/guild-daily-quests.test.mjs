import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const ui = read('../ui/guild.js');
const css = read('../guild.css');
const migration = read('../docs/migrations/20261125093419_guild_daily_quests_xp.sql');
const hardening = read('../docs/migrations/20261125093530_guild_daily_quests_xp_hardening.sql');
const sw = read('../sw.js');
const html = read('../index.html');

test('T-0130 今日任務頁透過伺服器 RPC 載入，並提供明確手動重新整理', () => {
  assert.match(ui, /rpc\('guild_get_daily_tasks'\)/);
  assert.match(ui, /data-guild-refresh/);
  assert.match(ui, /guild-task-track/);
  assert.match(ui, /activeView === 'tasks'.*loadTasks\(\)/s);
  assert.doesNotMatch(ui, /setInterval\s*\(/);
});

test('每日任務 XP 與條件符合已確認數值', () => {
  assert.match(migration, /'每日登入'.*'target',1,'xp',15/s);
  assert.match(migration, /'在線累積'.*'target',1800,'xp',10/s);
  assert.match(migration, /'擲骰累積'.*'target',1000,'xp',15/s);
  assert.match(migration, /'全員每日登入'.*'target',v_member_count,'xp',20/s);
  assert.match(migration, /Asia\/Taipei/);
});

test('每日完成紀錄與全員登入獎勵具有唯一鍵及冪等欄位', () => {
  assert.match(migration, /primary key \(guild_id, user_id, task_date\)/);
  assert.match(migration, /primary key \(guild_id, task_date\)/);
  assert.match(migration, /login_xp_awarded boolean/);
  assert.match(migration, /online_xp_awarded boolean/);
  assert.match(migration, /roll_xp_awarded boolean/);
  assert.match(migration, /on conflict \(guild_id, task_date\) do nothing/);
});

test('公會升級門檻完整且最高等級為 20', () => {
  for (const threshold of [100,250,500,850,1300,1900,2700,3700,5000,6600,8500,10800,13500,16800,20800,25500,31000,37500,45000]) {
    assert.match(migration, new RegExp('\\b' + threshold + '\\b'));
  }
  assert.match(migration, /level between 1 and 20/);
  assert.match(migration, /private\.guild_level_for_xp/);
});

test('每日擲骰進度由 game_saves trigger 計算，並限制異常跳增', () => {
  assert.match(migration, /after update of save_data on public\.game_saves/);
  assert.match(hardening, /floor\(v_elapsed \* 8\)/);
  assert.match(hardening, /old\.save_data->>'rolls'/);
  assert.match(hardening, /new\.save_data->>'rolls'/);
  assert.doesNotMatch(migration, /p_xp|p_completed|client_xp/i);
});

test('公會成員上限維持 4，且新進度表不可被客戶端直接讀寫', () => {
  assert.match(migration, /if v_count >= 4 then/);
  assert.match(migration, /guild_members_total_cap/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.guild_daily_member_progress, public\.guild_daily_login_bonuses\s+from public, anon, authenticated/);
});

test('公會任務資產版本與 Service Worker 快取一致', () => {
  const version = '20261125-t0130-guild-daily-quests';
  assert.ok(html.includes('guild.css?v=' + version));
  assert.ok(html.includes('script.js?v=' + version));
  assert.ok(sw.includes('ui/guild.js?v=' + version));
  assert.ok(sw.includes('guild.css?v=' + version));
  assert.ok(sw.includes('dice-realm-shell-v2.19'));
  assert.ok(css.includes('.guild-task-card'));
});
