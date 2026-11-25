import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../docs/migrations/20261125201831_guild_review_application_null_role_guard.sql', import.meta.url), 'utf8');
const sqlTest = await readFile(new URL('./sql/guild-foundation-behavior.sql', import.meta.url), 'utf8');

test('guild application review explicitly denies users without an authorized role', () => {
  assert.match(migration, /if\s+v_role\s+is\s+null\s+or\s+v_role\s+not\s+in\s*\('leader',\s*'vice_leader',\s*'officer'\)/i);
  assert.match(migration, /guild_permission_denied/);
});

test('guild behavior SQL integration test is isolated and rolls back fixtures', () => {
  assert.match(sqlTest, /\bbegin;/i);
  assert.match(sqlTest, /guild_review_application/);
  assert.match(sqlTest, /guild_member_limit_reached/);
  assert.match(sqlTest, /guild_role_limit_reached/);
  assert.match(sqlTest, /rollback;\s*$/i);
});
