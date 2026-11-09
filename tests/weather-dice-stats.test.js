import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherDiceStatsLoader } from '../services/weather-dice-stats.js';

test('weather dice stats coalesce concurrent RPC calls', async () => {
  let resolveRpc;
  let calls = 0;
  const stats = { counts: null, loadedAt: 0 };
  const loader = createWeatherDiceStatsLoader({
    supabaseClient: {
      rpc() {
        calls++;
        return new Promise(resolve => { resolveRpc = resolve; });
      }
    },
    stats,
    now: () => 1000
  });

  const first = loader.loadWeatherDiceExistCounts();
  const second = loader.loadWeatherDiceExistCounts();
  assert.equal(calls, 1);
  resolveRpc({ data: [{ dice_id: 'rain', player_count: 12 }], error: null });
  await Promise.all([first, second]);
  assert.deepEqual(stats.counts, { rain: 12 });
});

test('weather dice stats use a five-minute cache and refresh after expiry', async () => {
  let now = 1000;
  let calls = 0;
  const stats = { counts: null, loadedAt: 0 };
  const loader = createWeatherDiceStatsLoader({
    supabaseClient: {
      async rpc() {
        calls++;
        return { data: { rain: calls * 10 }, error: null };
      }
    },
    stats,
    now: () => now
  });

  await loader.loadWeatherDiceExistCounts();
  await loader.loadWeatherDiceExistCounts();
  assert.equal(calls, 1);
  assert.deepEqual(stats.counts, { rain: 10 });

  now += 300001;
  await loader.loadWeatherDiceExistCounts();
  assert.equal(calls, 2);
  assert.deepEqual(stats.counts, { rain: 20 });
});

test('weather dice stats do not issue RPC while the egress breaker is active', async () => {
  let calls = 0;
  const stats = { counts: { rain: 5 }, loadedAt: 0 };
  const loader = createWeatherDiceStatsLoader({
    supabaseClient: { async rpc() { calls++; return { data: {}, error: null }; } },
    stats,
    isCloudSyncBlocked: () => true
  });

  await loader.loadWeatherDiceExistCounts();
  assert.equal(calls, 0);
  assert.deepEqual(stats.counts, { rain: 5 });
});

test('weather dice stats activate the shared breaker on HTTP 402', async () => {
  let calls = 0;
  let blocked = false;
  let marked = 0;
  const stats = { counts: null, loadedAt: 0 };
  const loader = createWeatherDiceStatsLoader({
    supabaseClient: {
      async rpc() {
        calls++;
        return { data: null, error: { status: 402, message: 'exceed_egress_quota' } };
      }
    },
    stats,
    isCloudSyncBlocked: () => blocked,
    markCloudSyncBlocked(error) {
      marked++;
      blocked = Number(error?.status) === 402;
      return blocked;
    }
  });

  await loader.loadWeatherDiceExistCounts();
  await loader.loadWeatherDiceExistCounts();
  assert.equal(calls, 1);
  assert.equal(marked, 1);
  assert.equal(blocked, true);
});
