import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSerialQueue } from '../systems/weather.js';
import { isNewerServerVersion, mergeLocalBagDelta } from '../services/cloud-save.js';

test('weather deposit queue serializes operations', async () => {
  const enqueue = createSerialQueue();
  const events = [];
  let releaseFirst;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const first = enqueue(async () => {
    events.push('first-start');
    await firstGate;
    events.push('first-end');
    return 'first';
  });
  const second = enqueue(async () => {
    events.push('second-start');
    events.push('second-end');
    return 'second';
  });
  await Promise.resolve();
  assert.deepEqual(events, ['first-start']);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
  assert.deepEqual(events, ['first-start', 'first-end', 'second-start', 'second-end']);
});

test('queue continues after a failed operation', async () => {
  const enqueue = createSerialQueue();
  await assert.rejects(enqueue(async () => { throw new Error('expected failure'); }), /expected failure/);
  assert.equal(await enqueue(async () => 42), 42);
});

test('older or equal server versions cannot replace a newer cloud baseline', () => {
  assert.equal(isNewerServerVersion('2026-11-28T01:03:00.000Z', '2026-11-28T01:02:00.000Z'), true);
  assert.equal(isNewerServerVersion('2026-11-28T01:01:00.000Z', '2026-11-28T01:02:00.000Z'), false);
  assert.equal(isNewerServerVersion('2026-11-28T01:02:00.000Z', '2026-11-28T01:02:00.000Z'), false);
  assert.equal(isNewerServerVersion('not-a-time', '2026-11-28T01:02:00.000Z'), false);
});

test('adopting server bag preserves local dice added after the flush baseline', () => {
  assert.deepEqual(
    mergeLocalBagDelta(
      { d62: 4 },
      { d60: 1, d62: 4 },
      { d60: 1, d61: 1, d62: 4 }
    ),
    { d61: 1, d62: 4 }
  );
});

test('manual and automatic deposits share one serialized server transaction queue', () => {
  const weather = readFileSync(new URL('../systems/weather.js', import.meta.url), 'utf8');
  assert.match(weather, /const enqueueWeatherDeposit = createSerialQueue\(\)/);
  assert.match(weather, /performWeatherDiceDeposit\(d,qty,false\)/);
  assert.match(weather, /performWeatherDiceDeposit\(d,1,true\)/);
  assert.ok(weather.includes('return enqueueWeatherDeposit(async () =>'));
  assert.match(weather, /adoptServerBag\(data\.bag,data\.updated_at\)/);
});

test('deployed RPC migration documents d60-d63 denominators and row locking', () => {
  const sql = readFileSync(new URL('../docs/migrations/20261128011300_t0164_weather_deposit_rpc.sql', import.meta.url), 'utf8');
  for (const [id, denominator] of [['d60', 17100], ['d61', 15222], ['d62', 34321], ['d63', 62200]]) {
    assert.match(sql, new RegExp(`when '${id}' then ${denominator}`));
  }
  assert.match(sql, /'updated_at',\s*v_updated_at/);
  assert.match(sql, /for update/i);
});
