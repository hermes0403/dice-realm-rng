import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoinBoostService, timestampToMs } from '../systems/coin-boost.js';

test('coin boost expiry accepts ISO, Unix seconds, and Unix milliseconds', () => {
  const expected = 1_800_000_000_000;
  assert.equal(timestampToMs(new Date(expected).toISOString()), expected);
  assert.equal(timestampToMs(String(expected / 1000)), expected);
  assert.equal(timestampToMs(expected), expected);
  assert.ok(Number.isNaN(timestampToMs('not-a-date')));
});

test('ISO coin boost expiry remains active and exposes a numeric countdown timestamp', async () => {
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  const now = 1_800_000_000_000;
  Date.now = () => now;
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        global: { multiplier: 2, expires_at: new Date(now + 60_000).toISOString() },
        personal: null
      };
    }
  });
  try {
    const service = createCoinBoostService({
      getCurrentUser: () => ({ id: 'player-1' }),
      supabaseClient: { auth: { async getSession() { return { data: { session: { access_token: 'test-session' } } }; } } },
      SUPABASE_URL: 'https://example.invalid',
      SUPABASE_KEY: 'test-key'
    });
    assert.equal(await service.refreshCoinBoosts(true), true);
    assert.equal(service.coinEarningMultiplier(), 2);
    assert.deepEqual(service.activeGlobalCoinBoost(), { multiplier: 2, expires_at: now + 60_000 });
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
  }
});
