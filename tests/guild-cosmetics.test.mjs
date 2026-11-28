import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile(new URL('../ui/guild.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../guild.css', import.meta.url), 'utf8');
const migration = await readFile(new URL('../docs/migrations/20261127000000_guild_cosmetics.sql', import.meta.url), 'utf8');
const restrictionMigration = await readFile(new URL('../docs/migrations/20261127121441_guild_cosmetics_level_option_limits.sql', import.meta.url), 'utf8');

test('三項外觀依實際升級獎勵鍵解鎖，徽章特效在升至 Lv.15 時取得', () => {
  assert.match(ui, /hasUnlock\('name_color'\)/);
  assert.match(ui, /hasUnlock\('badge_effect'\)/);
  assert.match(ui, /hasUnlock\('guild_background'\)/);
  assert.ok(ui.includes("cosmeticControl('badge_effect','公會徽章特效',LV15_BADGE_EFFECT_OPTIONS,LV15_BADGE_EFFECT_IDS,'none','badge_effect',15)"));
  assert.ok(ui.includes("cosmeticControl('name_color','公會名稱顏色',LV9_NAME_COLOR_OPTIONS,LV9_NAME_COLOR_IDS,'default','name_color',9)"));
  assert.ok(ui.includes("cosmeticControl('background_theme','公會專屬背景',LV19_BACKGROUND_OPTIONS,LV19_BACKGROUND_IDS,'default','guild_background',19)"));
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

test('Lv.15 徽章與 Lv.19 背景暫未開放，鎖定時仍保留既有設定', () => {
  assert.ok(ui.includes("cosmeticControl('badge_effect','公會徽章特效',LV15_BADGE_EFFECT_OPTIONS,LV15_BADGE_EFFECT_IDS,'none','badge_effect',15,true)"));
  assert.ok(ui.includes("cosmeticControl('background_theme','公會專屬背景',LV19_BACKGROUND_OPTIONS,LV19_BACKGROUND_IDS,'default','guild_background',19,true)"));
  assert.match(ui, /comingSoon\?'尚未開放'/);
  assert.match(ui, /const preserved=comingSoon\?/);
  assert.match(ui, /!unlocked\|\|comingSoon/);
  assert.match(ui, /尚未解鎖，公會達到 Lv\.'/);
});

test('公會主頁、搜尋結果與排行榜都會套用已保存的名稱顏色', () => {
  assert.match(ui, /function guildNameStyle\(guild\)/);
  assert.match(ui, /guildNameStyle\(g\)/);
  assert.match(ui, /guildNameStyle\(guild\)/);
  assert.match(ui, /guild-name-particles-' \+ nameColor/);
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

test('Lv.9、Lv.15、Lv.19 只顯示指定外觀，其他選項保留供未來等級使用', () => {
  assert.ok(ui.includes("const LV9_NAME_COLOR_OPTIONS = NAME_COLOR_OPTIONS.filter(option => ['default', 'nebula', 'ice'].includes(option.value));"));
  assert.ok(ui.includes("const LV15_BADGE_EFFECT_OPTIONS = BADGE_EFFECT_OPTIONS.filter(option => ['none', 'orbit'].includes(option.value));"));
  assert.ok(ui.includes("const LV19_BACKGROUND_OPTIONS = BACKGROUND_OPTIONS.filter(option => ['default', 'aurora'].includes(option.value));"));
  assert.ok(ui.includes("cosmeticControl('name_color','公會名稱顏色',LV9_NAME_COLOR_OPTIONS,LV9_NAME_COLOR_IDS"));
  assert.ok(ui.includes("cosmeticControl('badge_effect','公會徽章特效',LV15_BADGE_EFFECT_OPTIONS,LV15_BADGE_EFFECT_IDS"));
  assert.ok(ui.includes("cosmeticControl('background_theme','公會專屬背景',LV19_BACKGROUND_OPTIONS,LV19_BACKGROUND_IDS"));
  for (const futureId of ['ember', 'emerald', 'solar', 'pulse', 'radiant', 'nebula', 'eclipse', 'crimson']) {
    assert.ok(ui.includes("'" + futureId + "'"), '未保留未來外觀：' + futureId);
  }
});

test('資料庫同步限制三個等級可用的外觀，並拒絕直接呼叫 RPC 傳入其他 ID', () => {
  assert.ok(restrictionMigration.includes("check (name_color in ('default', 'nebula', 'ice'))"));
  assert.ok(restrictionMigration.includes("check (badge_effect in ('none', 'orbit'))"));
  assert.ok(restrictionMigration.includes("check (background_theme in ('default', 'aurora'))"));
  assert.ok(restrictionMigration.includes("v_name_color not in ('default','nebula','ice')"));
  assert.ok(restrictionMigration.includes("v_badge_effect not in ('none','orbit')"));
  assert.ok(restrictionMigration.includes("v_background_theme not in ('default','aurora')"));
  assert.match(restrictionMigration, /guild_name_color_invalid/);
  assert.match(restrictionMigration, /guild_badge_effect_invalid/);
  assert.match(restrictionMigration, /guild_background_invalid/);
});

test('Lv.15 星環特效具雙層高對比環繞、發光與減少動態效果支援', () => {
  assert.match(css, /guildOrbitSpin/);
  assert.match(css, /guildOrbitSpinReverse/);
  assert.match(css, /guildOrbitCoreGlow/);
  assert.doesNotMatch(css, /guild-badge-effect-orbit,\.guild-banner-emblem\.guild-badge-effect-radiant\{animation:none/);
  assert.match(css, /prefers-reduced-motion:reduce[^}]*guild-badge-effect-orbit/);
  assert.match(css, /guild-bg-aurora[^}]*box-shadow/);
});
