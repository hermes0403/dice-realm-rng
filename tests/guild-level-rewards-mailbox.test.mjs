import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const followupMigration = read('../docs/migrations/20261126150000_guild_level_xp_rewards_update.sql');
const migration = read('../docs/migrations/20261126120000_guild_level_rewards_mailbox.sql') + '\\n' + followupMigration;
const guild = read('../ui/guild.js');
const cloud = read('../services/cloud-save.js');
const css = read('../guild.css');
const html = read('../index.html');
const sw = read('../sw.js');
const script = read('../script.js');

test('T-0141 uses the complete owner-confirmed per-level XP thresholds', () => {
  const expected = [100,250,500,850,1300,1400,1600,1800,2000,2200,2500,2600,2750,3000,3600,3900,4500,4800,5000];
  const arrays = [];
  let cursor = 0;
  const marker = 'v_costs bigint[] := array[';
  while ((cursor = followupMigration.indexOf(marker, cursor)) !== -1) {
    const start = cursor + marker.length;
    const end = followupMigration.indexOf('];', start);
    assert.notEqual(end, -1);
    arrays.push(followupMigration.slice(start, end).match(/[0-9]+/g).map(Number));
    cursor = end + 2;
  }
  assert.equal(arrays.length, 2);
  for (const values of arrays) assert.deepEqual(values, expected);
  assert.ok(migration.includes('create or replace function private.guild_level_for_xp(p_xp bigint)'));
});

test('all 19 guild level rewards match the approved reward schedule', () => {
  const rewards = [
    [2, 'luck1', '幸運藥水 I ×1'], [3, 'luck3', '幸運藥水 III ×1'],
    [4, 'speed1', '速度藥水 I ×1'], [5, 'badge_frame', '公會徽章框'],
    [6, 'money1', '金錢藥水 I ×1'], [7, 'luck3', '幸運藥水 III ×1'],
    [8, 'luck2', '幸運藥水 II ×1'], [9, 'name_color', '專屬公會名稱顏色'],
    [10, 'angel1', '天堂藥水 I ×1'], [11, 'guild_xp_bonus_5', '公會 XP 加成 +5%'],
    [12, 'speed2', '速度藥水 II ×1'], [13, 'guild_xp_bonus_5', '公會 XP 加成 +5%'],
    [14, 'money2', '金錢藥水 II ×1'], [15, 'badge_effect', '公會徽章特效'],
    [16, 'luck3', '幸運藥水 III ×1'], [17, 'angel1', '天堂藥水 I ×1'],
    [18, 'angel1', '天堂藥水 I ×2'], [19, 'guild_background', '專屬公會背景'],
    [20, 'angel2', '天堂藥水 II ×1']
  ];
  for (const [level, key, label] of rewards) {
    assert.ok(migration.includes(`when ${level} then v_reward_key := '${key}'`), `missing level ${level}`);
    assert.ok(migration.includes(label), `missing reward label for level ${level}`);
  }
  assert.match(migration, /v_reward_amount := 2/);
  assert.match(migration, /count\(\*\)::integer into v_bonus_count/);
  assert.match(migration, /1 \+ v_bonus_count \* 0\.05/);
});

test('level reward grants and mailbox rows are transactional and idempotent', () => {
  assert.match(migration, /primary key \(guild_id, guild_level\)/);
  assert.match(migration, /unique \(guild_id, guild_level, recipient_id\)/);
  assert.match(migration, /on conflict \(guild_id, guild_level\) do nothing/);
  assert.match(migration, /on conflict \(guild_id, guild_level, recipient_id\) do nothing/);
  assert.match(migration, /for update/);
  assert.match(migration, /for v_member in[\s\S]*?from public\.guild_members/);
  assert.match(migration, /insert into public\.player_grants/);
  assert.match(migration, /既有等級，不追溯發放/);
});

test('mailbox is private, authenticated and only marks the recipient own messages read', () => {
  assert.match(migration, /alter table public\.guild_level_reward_mail enable row level security/);
  assert.match(migration, /revoke all on table public\.guild_level_reward_events, public\.guild_level_reward_mail[\s\S]*?from public, anon, authenticated/);
  assert.match(migration, /where m\.recipient_id = v_uid/);
  assert.match(migration, /and recipient_id = v_uid/);
  assert.match(migration, /grant execute on function public\.guild_get_mailbox\(integer\) to authenticated/);
  assert.match(migration, /grant execute on function public\.guild_mark_mail_read\(uuid\) to authenticated/);
  assert.match(migration, /mail_unread_count/);
});

test('all potion reward counters flow through the existing pending-grant sync without extra polling', () => {
  for (const id of ['luck1','luck2','luck3','speed1','speed2','money1','money2','angel1','angel2']) {
    assert.match(migration, new RegExp(id + '_total'));
    assert.match(cloud, new RegExp(id + '_total'));
  }
  assert.match(cloud, /GRANT_CHECK_INTERVAL = 5 \* 60 \* 1000/);
  assert.doesNotMatch(guild, /setInterval\s*\(/);
});

test('guild UI exposes mailbox, unread state and cosmetic reward unlocks', () => {
  assert.match(guild, /key: 'mailbox'/);
  assert.match(guild, /rpc\('guild_get_mailbox'/);
  assert.match(guild, /rpc\('guild_mark_mail_read'/);
  assert.match(guild, /data-guild-mail-read/);
  assert.match(guild, /reward_unlocks/);
  assert.match(guild, /guild-name-color-unlocked/);
  assert.match(css, /\.guild-mailbox-panel/);
  assert.match(css, /\.guild-banner\.has-reward-background/);
});

test('PWA asset URLs and service worker shell cache use the T-0141 version', () => {
  const htmlGuildCssVersion = html.match(/guild\.css\?v=([^'"]+)/)?.[1];
  const workerGuildCssVersion = sw.match(/\.\/guild\.css\?v=([^'"]+)/)?.[1];
  const htmlScriptVersion = html.match(/script\.js\?v=([^'"]+)/)?.[1];
  const workerScriptVersion = sw.match(/\.\/script\.js\?v=([^'"]+)/)?.[1];
  const guildModuleVersion = script.match(/await import\(['"]\.\/ui\/guild\.js\?v=([^'"]+)['"]\)/)?.[1];
  const workerGuildModuleVersion = sw.match(/\.\/ui\/guild\.js\?v=([^'"]+)/)?.[1];
  assert.ok(htmlGuildCssVersion);
  assert.equal(workerGuildCssVersion, htmlGuildCssVersion);
  assert.ok(htmlScriptVersion);
  assert.equal(workerScriptVersion, htmlScriptVersion);
  assert.ok(guildModuleVersion);
  assert.equal(workerGuildModuleVersion, guildModuleVersion);
  const cloudSaveVersion = script.match(/cloud-save\.js\?v=([^'"]+)/)?.[1];
  const workerCloudSaveVersion = sw.match(/\.\/services\/cloud-save\.js\?v=([^'"]+)/)?.[1];
  assert.ok(cloudSaveVersion);
  assert.equal(workerCloudSaveVersion, cloudSaveVersion);
  assert.match(sw, /CACHE_NAME = 'dice-realm-shell-v\d+\.\d+'/);
});
