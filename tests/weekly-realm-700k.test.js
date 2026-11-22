import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('全服最後階段獎勵在 700,000 抽達成', async () => {
  const event = await readFile(new URL('../systems/weekly-realm-event.js', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations/20261122000200_lower_weekly_realm_final_milestone_to_700k.sql', import.meta.url), 'utf8');
  assert.match(event, /target: 700000, reward: '天堂藥水 II ×1 · 100M\$'/);
  assert.match(migration, /\(700000::bigint,100000000::bigint,'angel2'::text,1/);
  assert.match(migration, /\(500000::bigint\),\(700000::bigint\)/);
  assert.doesNotMatch(migration, /800000::bigint/);
  assert.equal((event.match(/target: 700000/g) || []).length, 1);
});

test('一般玩家與管理員累積抽數都使用相同的 700,000 解鎖門檻', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261122000200_lower_weekly_realm_final_milestone_to_700k.sql', import.meta.url), 'utf8');
  assert.equal((migration.match(/\(700000::bigint\)/g) || []).length, 2);
  assert.match(migration, /create or replace function public\.record_weekly_realm_rolls/);
  assert.match(migration, /create or replace function public\.admin_add_weekly_realm_rolls/);
  assert.match(migration, /create or replace function public\.apply_weekly_realm_rewards/);
});
