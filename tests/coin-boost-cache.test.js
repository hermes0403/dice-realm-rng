import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoinBoostService } from '../systems/coin-boost.js';

function createService({ now = () => 1000, fetchRef, onBlocked = () => {} } = {}) {
  let sessionReads = 0;
  const service = createCoinBoostService({
    getCurrentUser: () => ({ id: 'player-1' }),
    supabaseClient: {
      auth: {
        async getSession() {
          sessionReads++;
          return { data: { session: { access_token: 'test-token' } } };
        }
      }
    },
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_KEY: 'publishable-test-key',
    fetchRef,
    now,
    markCloudSyncBlocked: onBlocked
  });
  return { service, getSessionReads: () => sessionReads };
}

test('coin boost status is cached for at least 60 seconds', async () => {
  let currentTime = 1000;
  let requests = 0;
  const { service, getSessionReads } = createService({
    now: () => currentTime,
    fetchRef: async () => {
      requests++;
      return { ok: true, status: 200, json: async () => ({ global: { multiplier: 2 }, personal: null }) };
    }
  });

  await Promise.all(Array.from({ length: 10 }, () => service.refreshCoinBoosts()));
  await service.refreshCoinBoosts();
  assert.equal(requests, 1);
  assert.equal(getSessionReads(), 1);
  assert.equal(service.coinEarningMultiplier(), 2);

  currentTime += 59999;
  await service.refreshCoinBoosts();
  assert.equal(requests, 1);

  currentTime += 1;
  await service.refreshCoinBoosts();
  assert.equal(requests, 2);
});

test('HTTP 402 blocks future coin boost requests', async () => {
  let blocked = false;
  let requests = 0;
  let sessionReads = 0;
  let marked = 0;
  const service = createCoinBoostService({
    getCurrentUser: () => ({ id: 'player-1' }),
    supabaseClient: {
      auth: {
        async getSession() {
          sessionReads++;
          return { data: { session: { access_token: 'test-token' } } };
        }
      }
    },
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_KEY: 'publishable-test-key',
    fetchRef: async () => {
      requests++;
      return { ok: false, status: 402, json: async () => ({ error: 'exceed_egress_quota' }) };
    },
    isCloudSyncBlocked: () => blocked,
    markCloudSyncBlocked: error => {
      marked++;
      if (error.status === 402) blocked = true;
    }
  });

  await service.refreshCoinBoosts();
  await service.refreshCoinBoosts();
  assert.equal(requests, 1);
  assert.equal(sessionReads, 1);
  assert.equal(marked, 1);
  assert.equal(blocked, true);
});

test('ordinary failures back off instead of retrying every second', async () => {
  let currentTime = 1000;
  let requests = 0;
  const { service } = createService({
    now: () => currentTime,
    fetchRef: async () => {
      requests++;
      if (requests === 1) return { ok: false, status: 503, json: async () => ({ error: 'temporarily unavailable' }) };
      return { ok: true, status: 200, json: async () => ({ global: null, personal: null }) };
    }
  });

  await service.refreshCoinBoosts();
  currentTime += 1000;
  await service.refreshCoinBoosts();
  assert.equal(requests, 1);

  currentTime += 29000;
  await service.refreshCoinBoosts();
  assert.equal(requests, 2);
});
