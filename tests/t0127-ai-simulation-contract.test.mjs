import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(resolve(root, 'docs/database/20261124_t0127_ai_player_simulation.sql'), 'utf8');
const publicMigration = readFileSync(resolve(root, 'docs/database/20261124_t0127_public_ai_activity.sql'), 'utf8');
const fix = readFileSync(resolve(root, 'docs/database/20261124_t0127_ai_simulation_fix.sql'), 'utf8');
const adminFunction = readFileSync(resolve(root, 'backend/edge-functions/dice-rng-ai-admin/index.ts'), 'utf8');
const adminUi = readFileSync(resolve(root, 'admin/player-management.js'), 'utf8');
const publicUi = readFileSync(resolve(root, 'index.html'), 'utf8');
const publicScript = readFileSync(resolve(root, 'script.js'), 'utf8');

test('AI dice pool contains 72 unique entries from the current game catalog', () => {
  const ids = [...migration.matchAll(/^\('?(d\d+)'?,/gm)].map(match => match[1]);
  assert.equal(ids.length, 72);
  assert.equal(new Set(ids).size, 72);
});

test('AI storage is isolated and inaccessible to public roles', () => {
  assert.match(migration, /create schema if not exists ai_private/i);
  assert.match(migration, /revoke all on schema ai_private from public, anon, authenticated/i);
  assert.match(migration, /alter table ai_private\.ai_players enable row level security/i);
  assert.match(migration, /revoke all on function public\.admin_list_ai_players\(\) from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /(?:insert\s+into|update|delete\s+from)\s+public\.(?:player_profiles|game_saves|roll_announcements|presence_hourly_events)/i);
});

test('AI batch processing is idempotent and retains only bounded roll history', () => {
  assert.match(migration, /batch_slot timestamptz primary key/i);
  assert.match(migration, /unique \(batch_slot, ai_id, roll_index\)/i);
  assert.match(fix, /v_pick := random\(\)/i);
  assert.match(fix, /batch_slot < v_now - interval '30 days'/i);
  assert.match(migration, /cron\.schedule\([\s\S]*?'\*\/10 \* \* \* \*'/i);
});

test('admin endpoint checks the authenticated admin before reading AI data', () => {
  assert.match(adminFunction, /auth\.getUser\(token\)/);
  assert.match(adminFunction, /ADMIN_EMAIL/);
  assert.match(adminFunction, /admin\.rpc\("admin_list_ai_players"\)/);
});

test('AI roster appears only in the admin player management module', () => {
  assert.match(adminUi, /supabaseClient\.functions\.invoke\('dice-rng-ai-admin'/);
  assert.match(adminUi, /AI 模擬玩家/);
  assert.match(adminUi, /不計入真人在線人數與排行榜/);
});


test('public lobby shows only online simulated visitors with clear disclosure', () => {
  assert.match(publicMigration, /create or replace function public\.list_public_ai_activity\(\)/i);
  assert.match(publicMigration, /grant execute on function public\.list_public_ai_activity\(\) to authenticated/i);
  assert.match(publicMigration, /auth\.uid\(\) is not null/i);
  assert.match(publicUi, /伺服器旅人/);
  assert.match(publicUi, /部分角色由系統模擬/);
  assert.match(publicScript, /rpc\('list_public_ai_activity'\)/);
  assert.match(publicScript, /escapeHTML\(String\(p\.display_name/);
});
