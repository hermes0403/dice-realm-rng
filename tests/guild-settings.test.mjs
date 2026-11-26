import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const ui = read('../ui/guild.js'), css = read('../guild.css');
const migration = read('../docs/migrations/20261125210321_guild_settings.sql');
const nameLimitMigration = read('../docs/migrations/20261125212100_guild_name_limit_16.sql');
test('公會基本設定保留名稱、介紹及加入方式，名稱限制 2～16 字', () => {
 assert.match(ui,/function renderSettings\(\)/); assert.match(ui,/name" type="text" minlength="2" maxlength="16"/);
 assert.match(ui,/CREATE GUILD[\s\S]*maxlength="16"[\s\S]*2～16 個字/); assert.match(ui,/Array\.from\(guildName\)\.length/);
 assert.match(ui,/description" maxlength="160"/); assert.match(ui,/name="join_mode"/); assert.match(ui,/需審核申請/); assert.match(ui,/公開直接加入/);
});
test('只有隊長可修改公會名稱、介紹及加入方式', () => {
 assert.ok(ui.includes('const canEdit = isLeader;')); assert.ok(ui.includes('只有隊長可以修改公會名稱、介紹與加入方式。'));
 assert.match(ui,/if \(currentData\?\.my_role !== 'leader'\)/);
});
test('儲存基本設定使用伺服器 RPC 並重新載入', () => {
 assert.match(ui,/rpc\('guild_update_settings'/); assert.match(ui,/p_name:/); assert.match(ui,/p_description:/); assert.match(ui,/p_join_mode:/);
 assert.match(ui,/await load\(\);\s*toast\('公會設定已儲存'\)/);
});
test('公會名稱與介紹使用 HTML escaping', () => { assert.match(ui,/escapeHTML\(guild\.name \|\| ''\)/); assert.match(ui,/escapeHTML\(guild\.description \|\| ''\)/); });
test('讀取公會資料 RPC 回傳加入方式', () => { assert.match(migration,/'join_mode', g\.join_mode/); assert.match(migration,/create or replace function private\.guild_get_my_guild\(\)/); });
test('設定 RPC 僅允許隊長修改自己的公會', () => {
 assert.match(nameLimitMigration,/create or replace function private\.guild_update_settings/);
 assert.match(nameLimitMigration,/security definer\s+set search_path to ''/); assert.match(nameLimitMigration,/v_uid uuid := auth\.uid\(\)/);
 assert.match(nameLimitMigration,/gm\.user_id = v_uid\s+and gm\.role = 'leader'/); assert.match(nameLimitMigration,/guild_settings_permission_denied/);
 assert.match(migration,/revoke all on function public\.guild_update_settings\(text, text, text\) from public, anon/);
 assert.match(migration,/grant execute on function public\.guild_update_settings\(text, text, text\) to authenticated/);
 assert.match(migration,/revoke all on function private\.guild_update_settings\(text, text, text\) from public, anon, authenticated/);
});
test('建立與修改公會名稱均採用 2～16 字伺服器驗證', () => {
 assert.equal((nameLimitMigration.match(/not between 2 and 16/g)||[]).length,2);
 assert.match(nameLimitMigration,/add constraint guilds_name_length[\s\S]*between 2 and 16/);
 assert.match(nameLimitMigration,/guild_name_limit_preflight_failed_existing_names_over_16/);
});
test('伺服器端驗證名稱、介紹與加入方式', () => {
 assert.match(nameLimitMigration,/char_length\(coalesce\(p_description, ''\)\) > 160/);
 assert.match(nameLimitMigration,/p_join_mode not in \('application', 'open'\)/);
 assert.match(nameLimitMigration,/set\s+name = btrim\(p_name\),\s+description = coalesce\(p_description, ''\),\s+join_mode = p_join_mode/s);
 assert.match(nameLimitMigration,/when unique_violation then\s+raise exception 'guild_name_taken'/);
});
test('設定分類按鈕依角色顯示，公告整合於基本設定，外觀獨立', () => {
 assert.ok(ui.includes('data-guild-settings-section="basic"')); assert.ok(ui.includes('data-guild-settings-section="cosmetics"'));
 assert.ok(ui.includes('data-guild-settings-section="promotion"')); assert.ok(ui.includes('const announcementPanel ='));
 assert.ok(ui.includes('root().innerHTML = back + basicPanel + announcementPanel')); assert.match(css,/guild-settings-menu-grid/);
});
