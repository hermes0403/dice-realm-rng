import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const ui = read('../ui/guild.js'), css = read('../guild.css'), sql = read('../docs/migrations/20261127010000_guild_member_promotion.sql');
test('職位只有隊長、副隊長、普通成員，舊幹部轉為普通成員', () => {
 assert.ok(ui.includes("leader: '隊長', vice_leader: '副隊長', member: '普通成員'"));
 assert.match(sql,/update public\.guild_members set role='member' where role='officer'/);
 assert.match(sql,/array\['leader'::text,'vice_leader'::text,'member'::text\]/);
});
test('設定分成基本設定、晉升成員、專屬外觀，公告位於基本設定', () => {
 for(const value of ['公會基本設定','公會晉升成員','公會專屬外觀','guildAnnouncementForm']) assert.ok(ui.includes(value));
 assert.ok(ui.includes("activeSettingsSection === 'basic'"));
 assert.ok(ui.includes("activeSettingsSection === 'cosmetics'"));
 assert.ok(ui.includes("activeSettingsSection === 'promotion'"));
 assert.ok(ui.includes('root().innerHTML = back + basicPanel + announcementPanel'));
});
test('只有隊長看得到晉升入口並能任命或撤除副隊長', () => {
 assert.ok(ui.includes('data-guild-settings-section="promotion"'));
 assert.ok(ui.includes('晉升副隊長')); assert.ok(ui.includes('撤除副隊長'));
 assert.ok(ui.includes("rpc('guild_update_member_role'"));
});
test('每公會最多兩位副隊長，資料庫 trigger 強制限制', () => {
 assert.match(sql,/when 'vice_leader' then 2/); assert.ok(ui.includes('副隊長名額：')); assert.match(sql,/guild_role_limit_reached/);
});
test('晉升 RPC 僅隊長可修改同公會成員，不能修改自己或隊長', () => {
 assert.match(sql,/v_actor_role<>'leader'/); assert.match(sql,/p_user_id=v_uid/); assert.match(sql,/v_target_role='leader'/);
 assert.match(sql,/where guild_id=v_guild_id and user_id=p_user_id/);
 assert.match(sql,/grant execute on function public\.guild_update_member_role\(uuid,text\) to authenticated/);
});
test('普通成員不可審核申請，成員管理 ID 僅提供隊長與副隊長', () => {
 assert.match(sql,/if v_role not in \('leader','vice_leader'\) then raise exception 'guild_permission_denied'/);
 assert.match(sql,/if v_role in \('leader', 'vice_leader'\) then/);
});
test('移除成員也只保留三階級權限', () => {
 assert.match(sql,/v_actor_role = 'vice_leader'[\s\S]*?v_target_role <> 'member'/);
 assert.ok(ui.includes("(actorRole === 'leader' && ['vice_leader', 'member'].includes(role))"));
 assert.ok(ui.includes("(actorRole === 'vice_leader' && role === 'member')"));
});
test('手機版晉升清單維持可操作', () => {
 assert.match(css,/guild-promotion-row/); assert.match(css,/@media\(max-width:520px\)[\s\S]*?guild-promotion-row/);
});

test('private promotion implementation is not directly executable by clients; public wrapper is SECURITY DEFINER', () => {
  assert.match(aclMigration, /revoke all on function private\\.guild_update_member_role\\(uuid,text\\) from public, anon, authenticated/);
  assert.match(aclMigration, /create or replace function public\\.guild_update_member_role[\\s\\S]*?security definer/);
  assert.match(aclMigration, /grant execute on function public\\.guild_update_member_role\\(uuid,text\\) to authenticated/);
});
