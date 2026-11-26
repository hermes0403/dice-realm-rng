import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const ui = read('../ui/guild.js'), css = read('../guild.css');
const migration = read('../docs/migrations/20261127010000_guild_member_promotion.sql');
const originalMigration = read('../docs/migrations/20261125214100_guild_member_management.sql');
test('管理者成員 payload 才會包含目標 user id', () => {
 assert.match(migration,/'user_id', case when v_role in \('leader', 'vice_leader'\) then m\.user_id else null end/);
});
test('移除 RPC 僅允許隊長與副隊長，並鎖定操作者與目標成員', () => {
 assert.match(migration,/create or replace function private\.guild_remove_member\(p_user_id uuid\)/);
 assert.match(migration,/security definer\s+set search_path to ''/); assert.match(migration,/v_actor_role not in \('leader', 'vice_leader'\)/);
 assert.match(migration,/where gm\.user_id = v_uid\s+for update/);
 assert.match(migration,/where gm\.guild_id = v_guild_id\s+and gm\.user_id = p_user_id\s+for update/);
});
test('移除階級規則禁止自我移除、移除隊長及副隊長越權', () => {
 assert.match(migration,/if p_user_id = v_uid then[\s\S]*?guild_cannot_remove_self/);
 assert.match(migration,/if v_target_role = 'leader' then[\s\S]*?guild_cannot_remove_leader/);
 assert.match(migration,/v_actor_role = 'vice_leader'[\s\S]*?v_target_role <> 'member'/);
 assert.match(migration,/guild_member_hierarchy_denied/);
});
test('移除操作限定同公會成員並觸發既有資料庫 trigger', () => {
 assert.match(migration,/where gm\.guild_id = v_guild_id\s+and gm\.user_id = p_user_id/);
 assert.match(migration,/delete from public\.guild_members/);
 assert.doesNotMatch(migration,/drop trigger.*guild_members_daily_login_recheck_delete/i);
});
test('既有 public RPC wrapper 仍僅授權 authenticated', () => {
 assert.match(originalMigration,/revoke all on function private\.guild_remove_member\(uuid\) from public, anon, authenticated/);
 assert.match(originalMigration,/revoke all on function public\.guild_remove_member\(uuid\) from public, anon/);
 assert.match(originalMigration,/grant execute on function public\.guild_remove_member\(uuid\) to authenticated/);
});
test('成員列表只對可移除目標顯示操作按鈕', () => {
 assert.match(ui,/function renderMembers\(members\)/);
 assert.ok(ui.includes("(actorRole === 'leader' && ['vice_leader', 'member'].includes(role))"));
 assert.ok(ui.includes("(actorRole === 'vice_leader' && role === 'member')"));
 assert.match(ui,/data-guild-remove-member/); assert.match(ui,/data-guild-remove-name/);
});
test('移除前確認，成功後重新載入公會資料', () => {
 assert.match(ui,/window\.confirm\('確定要將「' \+ targetName \+ '」移出公會嗎？'\)/);
 assert.match(ui,/rpc\('guild_remove_member', \{ p_user_id: targetId \}\)/);
 assert.match(ui,/await load\(\);\s*toast\('已移除成員'\)/);
});
test('移除按鈕手機版可操作', () => { assert.match(css,/guild-member-actions/); assert.match(css,/guild-member-remove/); assert.match(css,/@media\(max-width:520px\)[\s\S]*?guild-member-row/); });
