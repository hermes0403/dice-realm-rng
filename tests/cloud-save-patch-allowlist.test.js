import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cloudSave = readFileSync(new URL('../services/cloud-save.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261123120000_t0127_allow_daily_shop_save_field.sql', import.meta.url), 'utf8');

function extractSavePayloadKeys(source) {
  const start = source.indexOf('function savePayload()');
  assert.notEqual(start, -1, 'savePayload() must exist');
  const end = source.indexOf('\n  function achievementStats()', start);
  assert.notEqual(end, -1, 'savePayload() boundary must exist');
  const body = source.slice(start, end);
  return [...body.matchAll(/^\s{6}([A-Za-z_$][\w$]*):/gm)].map(match => match[1]);
}

function extractAllowedPatchKeys(sql) {
  const start = sql.indexOf('where key not in (');
  assert.notEqual(start, -1, 'save patch allowlist must exist');
  const end = sql.indexOf('\n     )', start);
  assert.notEqual(end, -1, 'save patch allowlist must close');
  const block = sql.slice(start, end);
  return [...block.matchAll(/'([^']+)'/g)].map(match => match[1]);
}

test('database save patch allowlist accepts every current savePayload field', () => {
  const payloadKeys = extractSavePayloadKeys(cloudSave);
  const allowedKeys = new Set(extractAllowedPatchKeys(migration));
  const missing = payloadKeys.filter(key => !allowedKeys.has(key));
  assert.deepEqual(missing, [], 'database allowlist is missing frontend save fields');
  assert.ok(allowedKeys.has('dailyShop'), 'dailyShop must be explicitly accepted');
});

test('database save patch allowlist remains restrictive', () => {
  const allowedKeys = new Set(extractAllowedPatchKeys(migration));
  assert.equal(allowedKeys.has('unexpectedClientField'), false);
});
