import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('已完成的每週活動不再顯示或累積擲骰，但保留登入補領', async () => {
  const event = await readFile(new URL('../systems/weekly-realm-event.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations/20261122000200_lower_weekly_realm_final_milestone_to_700k.sql', import.meta.url), 'utf8');
  assert.ok(migration.includes("(700000::bigint,100000000::bigint,'angel2'::text,1"));
  assert.ok(event.includes("rpc('get_weekly_realm_progress')"));
  assert.ok(event.includes('function recordRoll() {}'));
  assert.doesNotMatch(event, /admin_add_weekly_realm_rolls/);
  assert.doesNotMatch(html, /id="weeklyRealmEvent"/);
  assert.match(html, /id="weeklyRewardOverlay"/);
});

test('資料庫仍保留玩家補領與管理員歷史里程碑的既有權限', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261122000200_lower_weekly_realm_final_milestone_to_700k.sql', import.meta.url), 'utf8');
  assert.equal((migration.match(/\(700000::bigint\)/g) || []).length, 2);
  assert.match(migration, /create or replace function public\.record_weekly_realm_rolls/);
  assert.match(migration, /create or replace function public\.admin_add_weekly_realm_rolls/);
  assert.match(migration, /create or replace function public\.apply_weekly_realm_rewards/);
});
