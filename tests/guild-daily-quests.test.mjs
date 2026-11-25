import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const ui = read('../ui/guild.js');
const css = read('../guild.css');
const migration = read('../docs/migrations/20261125093419_guild_daily_quests_xp.sql');
const hardening = read('../docs/migrations/20261125093530_guild_daily_quests_xp_hardening.sql');
const membership = read('../docs/migrations/20261125094852_guild_daily_quests_membership_boundary.sql');
const repeatable = read('../docs/migrations/20261125101918_guild_repeatable_daily_quests.sql');
const loginThreshold = read('../docs/migrations/20261125111428_guild_daily_login_threshold.sql');
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
  assert.doesNotMatch(migration, /p_completed|client_xp/i);
});

test('公會成員上限維持 4，且新進度表不可被客戶端直接讀寫', () => {
  assert.match(migration, /if v_count >= 4 then/);
  assert.match(migration, /guild_members_total_cap/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.guild_daily_member_progress, public\.guild_daily_login_bonuses\s+from public, anon, authenticated/);
});

test('公會任務資產版本與 Service Worker 快取一致', () => {
  const guildVersion = '20261125-t0136-guild-member-management';
  const scriptVersion = '20261126-t0139-account-isolation';
  assert.ok(html.includes('guild.css?v=' + guildVersion));
  assert.ok(html.includes('script.js?v=' + scriptVersion));
  assert.ok(sw.includes('ui/guild.js?v=' + guildVersion));
  assert.ok(sw.includes('guild.css?v=' + guildVersion));
  assert.ok(sw.includes('dice-realm-shell-v2.28'));
  assert.ok(css.includes('.guild-task-card'));
});

test('全員登入獎勵會在成員加入、退出或轉移公會後重新依目前名單判定', () => {
  assert.match(membership, /private\.award_guild_daily_login_bonus/);
  assert.match(membership, /after insert on public\.guild_members/);
  assert.match(membership, /after delete on public\.guild_members/);
  assert.match(membership, /after update of guild_id on public\.guild_members/);
  assert.match(membership, /on conflict \(guild_id, task_date\) do nothing/);
});


test('在線與擲骰任務支援每日多輪領取，且每輪紀錄具唯一鍵', () => {
  assert.match(repeatable, /create table if not exists public\.guild_daily_task_claims/);
  assert.match(repeatable, /primary key \(guild_id, user_id, task_date, task_key, cycle_number\)/);
  assert.match(repeatable, /generate_series\([\s\S]*v_online_cycles_completed/);
  assert.match(repeatable, /generate_series\([\s\S]*v_roll_cycles_completed/);
  assert.match(repeatable, /online_cycles_completed = online_cycles_completed \+ v_new_cycles/);
  assert.match(repeatable, /roll_cycles_completed = roll_cycles_completed \+ v_new_cycles/);
  assert.match(repeatable, /v_member_count >= 2/);
  assert.match(repeatable, /'eligible',v_member_count>=2/);
  assert.match(ui, /已領取 ' \+ cycles \+ ' 輪/);
  assert.doesNotMatch(ui, /label: '返回主頁'/);
});

test('全員登入門檻依有效成員數採 min(人數, 3)，單人公會等待第二位成員', () => {
  assert.match(loginThreshold, /v_logged_in_count\s*>=\s*least\(v_member_count,\s*3\)/);
  assert.match(loginThreshold, /3 位以上成員每日登入/);
  assert.match(loginThreshold, /2 位成員每日登入/);
  assert.match(loginThreshold, /等待第 2 位成員加入/);
  assert.match(loginThreshold, /v_all_login_target := case when v_member_count >= 2 then least\(v_member_count, 3\) else 0 end/);
  assert.match(loginThreshold, /'target',v_all_login_target/);
  assert.match(ui, /waitingForMember = task\.key === 'all_login' && task\.eligible === false/);
  assert.doesNotMatch(ui, /至少需要 2 位有效成員/);
});

test('單人公會不顯示全員登入進度條或可領 XP', () => {
  assert.match(ui, /waitingForMember \? '尚未開放'/);
  assert.match(ui, /target > 0 \? '<div class="guild-task-track"/);
  assert.match(loginThreshold, /'eligible',v_member_count>=2/);
});
