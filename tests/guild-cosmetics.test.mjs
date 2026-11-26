import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile(new URL('../ui/guild.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../guild.css', import.meta.url), 'utf8');
const migration = await readFile(new URL('../docs/migrations/20261127000000_guild_cosmetics.sql', import.meta.url), 'utf8');

test('三項外觀依實際升級獎勵鍵解鎖，徽章特效在升至 Lv.15 時取得', () => {
  assert.match(ui, /hasUnlock\('name_color'\)/);
  assert.match(ui, /hasUnlock\('badge_effect'\)/);
  assert.match(ui, /hasUnlock\('guild_background'\)/);
  assert.match(ui, /cosmeticControl\\('badge_effect','公會徽章特效'.*'badge_effect',15\\)/);
  assert.match(ui, /'name_color', 9/);
  assert.match(ui, /'guild_background', 19/);
});

test('公會外觀提供固定白名單選項，並由會長與副會長修改', () => {
  for (const id of ['nebula', 'ice', 'ember', 'emerald', 'solar', 'pulse', 'orbit', 'radiant', 'aurora', 'eclipse', 'crimson']) {
    assert.ok(ui.includes("'" + id + "'"), '缺少外觀選項：' + id);
  }
  assert.match(ui, /const canEditCosmetics = \['leader', 'vice_leader'\]\.includes\(role\)/);
  assert.match(ui, /guildCosmeticsForm/);
  assert.match(ui, /rpc\('guild_update_cosmetics'/);
  assert.match(ui, /只有隊長與副隊長可以更換公會外觀/);
});

test('未解鎖的外觀選單保持鎖定，且顯示所需公會等級', () => {
  assert.match(ui, /const selectDisabled = !canEditCosmetics \|\| !unlocked \? ' disabled' : ''/);
  assert.match(ui, /尚未解鎖，公會達到 Lv\.'/);
  assert.match(ui, /options\.slice\(0, 1\)/);
});

test('公會主頁、搜尋結果與排行榜都會套用已保存的名稱顏色', () => {
  assert.match(ui, /function guildNameStyle\(guild\)/);
  assert.match(ui, /guildNameStyle\(g\)/);
  assert.match(ui, /guildNameStyle\(guild\)/);
  assert.match(ui, /guild-bg-/);
  assert.match(ui, /guild-badge-effect-/);
});

test('資料庫只接受伺服器已解鎖的外觀，且限制修改角色', () => {
  assert.match(migration, /create or replace function private\.guild_update_cosmetics/);
  assert.match(migration, /v_role not in \('leader','vice_leader'\)/);
  assert.match(migration, /reward_key = 'name_color'/);
  assert.match(migration, /reward_key = 'badge_effect'/);
  assert.match(migration, /reward_key = 'guild_background'/);
  assert.match(migration, /guild_name_color_locked/);
  assert.match(migration, /guild_badge_effect_locked/);
  assert.match(migration, /guild_background_locked/);
  assert.match(migration, /revoke all on function private\.guild_update_cosmetics/);
  assert.match(migration, /grant execute on function public\.guild_update_cosmetics\(text,text,text\) to authenticated/);
});

test('資料庫讀取 RPC 回傳三項外觀，且不追溯發放舊公會獎勵', () => {
  assert.match(migration, /'name_color', g\.name_color/);
  assert.match(migration, /'badge_effect', g\.badge_effect/);
  assert.match(migration, /'background_theme', g\.background_theme/);
  assert.match(migration, /g\.name_color, g\.badge_effect, g\.background_theme/);
  assert.doesNotMatch(migration, /insert into public\.guild_level_reward_events/i);
});

test('徽章效果有低負載 CSS，並尊重減少動態效果設定', () => {
  assert.match(css, /guild-badge-effect-pulse/);
  assert.match(css, /guild-badge-effect-orbit/);
  assert.match(css, /guild-badge-effect-radiant/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /guild-bg-aurora/);
});
