import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSerialQueue } from '../systems/weather.js';
import { isNewerServerVersion, mergeLocalBagDelta } from '../services/cloud-save.js';

test('天氣投入序列佇列會依序執行，不會讓第二筆先完成', async () => {
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

test('序列佇列在前一筆失敗後仍能執行下一筆', async () => {
  const enqueue = createSerialQueue();
  await assert.rejects(enqueue(async () => { throw new Error('expected failure'); }), /expected failure/);
  assert.equal(await enqueue(async () => 42), 42);
});

test('伺服器較舊或相同版本不得覆蓋較新的雲端基準', () => {
  assert.equal(isNewerServerVersion('2026-11-28T01:03:00.000Z', '2026-11-28T01:02:00.000Z'), true);
  assert.equal(isNewerServerVersion('2026-11-28T01:01:00.000Z', '2026-11-28T01:02:00.000Z'), false);
  assert.equal(isNewerServerVersion('2026-11-28T01:02:00.000Z', '2026-11-28T01:02:00.000Z'), false);
  assert.equal(isNewerServerVersion('not-a-time', '2026-11-28T01:02:00.000Z'), false);
});

test('採用伺服器背包時保留 flush 後才新增的本機骰子差異', () => {
  assert.deepEqual(
    mergeLocalBagDelta(
      { d60: 0, d62: 4 },
      { d60: 1, d62: 4 },
      { d60: 1, d61: 1, d62: 4 }
    ),
    { d61: 1, d62: 4 }
  );
});

test('手動與自動投入共用同一個伺服器交易佇列', () => {
  const weather = readFileSync(new URL('../systems/weather.js', import.meta.url), 'utf8');
  assert.match(weather, /const enqueueWeatherDeposit = createSerialQueue\(\)/);
  assert.match(weather, /performWeatherDiceDeposit\(d,qty,false\)/);
  assert.match(weather, /performWeatherDiceDeposit\(d,1,true\)/);
  assert.ok(weather.includes('return enqueueWeatherDeposit(async () =>'));
  assert.match(weather, /adoptServerBag\(data\.bag,data\.updated_at\)/);
});

test('正式 RPC migration 包含四顆缺漏天氣骰子與正確分母', () => {
  const sql = readFileSync(new URL('../docs/migrations/20261128011300_t0164_weather_deposit_rpc.sql', import.meta.url), 'utf8');
  for (const [id, denominator] of [['d60', 17100], ['d61', 15222], ['d62', 34321], ['d63', 62200]]) {
    assert.match(sql, new RegExp(`when '${id}' then ${denominator}`));
  }
  assert.match(sql, /'updated_at',\s*v_updated_at/);
  assert.match(sql, /for update/i);
});
