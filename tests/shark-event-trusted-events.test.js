import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../docs/migrations/20261110124248_shark_emperor_event_core.sql', import.meta.url);

test('Shark progress accepts only server-owned pet-sale and weather trigger sources', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /create trigger trg_shark_event_pet_sale after insert on public\.pet_sale_tombstones/i);
  assert.match(sql, /create trigger trg_shark_event_weather after insert or update on public\.realm_weather_state/i);
  assert.doesNotMatch(sql, /create trigger[^;]+on public\.(?:pet_fusion_logs|potion_usage_logs|craft_logs|game_saves|player_profiles)/i);
});

test('internal Shark progress writer is not executable by client roles', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /revoke all on function private\.record_shark_event_progress\(uuid,text,text,integer\) from public, anon, authenticated/i
  );
  assert.doesNotMatch(sql, /grant execute on function (?:public|private)\.record_shark_event_progress/i);
  assert.match(sql, /unique\(user_id, event_key, event_id\)/i);
  assert.match(sql, /unique\(user_id, idempotency_key\)/i);
});
