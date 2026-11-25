import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const ui = read('../ui/guild.js');
const css = read('../guild.css');
const migration = read('../docs/migrations/20261125204200_guild_leaderboard.sql');

test('排行榜頁開啟時才載入 RPC，並提供手動重新整理', () => {
  assert.match(ui, /rpc\('guild_get_ranking'\)/);
  assert.match(ui, /activeView === 'ranking'.*loadRanking\(\)/s);
  assert.match(ui, /data-guild-ranking-refresh/);
  assert.doesNotMatch(ui, /setInterval\s*\(/);
});

test('排行榜列顯示名次、公會名稱、等級、總 XP 與成員人數', () => {
  for (const field of ['guild.rank', 'guild.name', 'guild.level', 'guild.xp_total', 'guild.member_count']) {
    assert.ok(ui.includes(field), '缺少排行榜欄位：' + field);
  }
  assert.match(ui, /escapeHTML\(guild\.name/);
  assert.match(ui, /guild-ranking-empty/);
  assert.match(ui, /排行榜載入失敗/);
});

test('伺服器依等級、XP、建立時間及 ID 穩定排序，只取公開公會', () => {
  assert.match(migration, /where g\.is_public = true/);
  assert.match(migration, /row_number\(\) over/);
  assert.match(migration, /order by g\.level desc, g\.xp_total desc, g\.created_at asc, g\.id asc/);
  assert.match(migration, /count\(m\.user_id\)::integer as member_count/);
  assert.match(migration, /guilds_public_ranking_idx/);
});

test('RPC 僅回傳公開必要欄位，且只有登入玩家可執行', () => {
  assert.match(migration, /if v_user_id is null then/);
  assert.match(migration, /set search_path to ''/);
  assert.match(migration, /'rank', ranked\.rank/);
  assert.match(migration, /'name', ranked\.name/);
  assert.match(migration, /'level', ranked\.level/);
  assert.match(migration, /'xp_total', ranked\.xp_total/);
  assert.match(migration, /'member_count', ranked\.member_count/);
  assert.doesNotMatch(migration, /'user_id'\s*,|'created_by'\s*,|'email'\s*,/);
  assert.match(migration, /revoke all on function public\.guild_get_ranking\(\) from public, anon/);
  assert.match(migration, /grant execute on function public\.guild_get_ranking\(\) to authenticated/);
  assert.match(migration, /revoke all on function private\.guild_get_ranking\(\) from public, anon, authenticated/);
});

test('排行榜採響應式卡片，不使用橫向表格', () => {
  assert.match(css, /guild-ranking-row/);
  assert.match(css, /grid-template-columns/);
  assert.match(css, /@media\(max-width:520px\)/);
});
