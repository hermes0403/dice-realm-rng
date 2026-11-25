import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const ui = read('../ui/guild.js');
const css = read('../guild.css');
const migration = read('../docs/migrations/20261125214800_guild_vice_leader_management.sql');

test('副會長管理 RPC 僅允許會長操作', () => {
  assert.match(migration, /create or replace function private\.guild_set_vice_leader/);
  assert.match(migration, /v_actor_role <> 'leader'/);
  assert.match(migration, /guild_vice_leader_permission_denied/);
  assert.match(migration, /security definer\s+set search_path to ''/);
});

test('任命只允許一般成員，撤除只允許副會長', () => {
  assert.match(migration, /if p_make_vice_leader then[\s\S]*?v_target_role <> 'member'/);
  assert.match(migration, /else[\s\S]*?v_target_role <> 'vice_leader'/);
  assert.match(migration, /v_new_role := 'vice_leader'/);
  assert.match(migration, /v_new_role := 'member'/);
});

test('沿用每公會最多兩位副會長的既有名額', () => {
  assert.match(migration, /v_vice_count >= 2/);
  assert.match(migration, /guild_vice_leader_limit_reached/);
});

test('禁止自我任命，並鎖定操作者及目標成員', () => {
  assert.match(migration, /p_user_id = v_uid[\s\S]*?guild_cannot_change_own_role/);
  assert.match(migration, /where gm\.user_id = v_uid\s+for update/);
  assert.match(migration, /where gm\.guild_id = v_guild_id\s+and gm\.user_id = p_user_id\s+for update/);
});

test('公開 RPC 只授權 authenticated，private RPC 不直接授權客戶端', () => {
  assert.match(migration, /revoke all on function private\.guild_set_vice_leader\(uuid, boolean\) from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.guild_set_vice_leader\(uuid, boolean\) from public, anon/);
  assert.match(migration, /grant execute on function public\.guild_set_vice_leader\(uuid, boolean\) to authenticated/);
});

test('只有會長看得到副會長任命與撤除操作，且名額已滿時停用任命', () => {
  assert.match(ui, /const isLeader = currentData\?\.my_role === 'leader'/);
  assert.match(ui, /const viceCount = members\.filter\(member => member\.role === 'vice_leader'\)\.length/);
  assert.match(ui, /data-guild-vice-action="promote"/);
  assert.match(ui, /data-guild-vice-action="demote"/);
  assert.match(ui, /viceCount >= 2 \? ' disabled' : ''/);
  assert.match(ui, /副會長名額已滿/);
});

test('任命與撤除前確認，成功後重新載入資料', () => {
  assert.match(ui, /window\.confirm\(confirmText\)/);
  assert.match(ui, /rpc\('guild_set_vice_leader', \{ p_user_id: targetId, p_make_vice_leader: promote \}\)/);
  assert.match(ui, /await load\(\);\s*toast\(promote \? '已任命副會長' : '已撤除副會長職位'\)/);
});

test('職位操作版面支援手機寬度', () => {
  assert.match(css, /guild-member-role-action/);
  assert.match(css, /@media\(max-width:520px\)[\s\S]*?guild-member-actions/);
});
