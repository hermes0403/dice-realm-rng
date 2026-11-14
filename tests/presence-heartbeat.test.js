import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPresenceService,
  isPlayerOnline,
  PRESENCE_HEARTBEAT_INTERVAL,
  PRESENCE_ONLINE_WINDOW
} from '../services/presence.js';

test('presence heartbeat is scheduled at a five-minute cadence', () => {
  assert.equal(PRESENCE_HEARTBEAT_INTERVAL, 5 * 60 * 1000);
  assert.equal(PRESENCE_ONLINE_WINDOW, 7 * 60 * 1000);
});

test('online status tolerates one delayed five-minute heartbeat but expires after the shared window', () => {
  const now = Date.parse('2026-11-09T00:00:00.000Z');
  assert.equal(isPlayerOnline(new Date(now - PRESENCE_ONLINE_WINDOW + 1).toISOString(), now), true);
  assert.equal(isPlayerOnline(new Date(now - PRESENCE_ONLINE_WINDOW).toISOString(), now), false);
  assert.equal(isPlayerOnline(null, now), false);
  assert.equal(isPlayerOnline('invalid-date', now), false);
  assert.equal(isPlayerOnline(new Date(now + 1000).toISOString(), now), false);
});

test('presence service writes once per five minutes and only after successful upsert', async () => {
  const previousNow = Date.now;
  let now = 10_000;
  Date.now = () => now;
  let writes = 0;
  let failNext = true;
  const supabaseClient = {
    from(table) {
      assert.equal(table, 'player_profiles');
      return {
        async upsert() {
          writes++;
          if (failNext) {
            failNext = false;
            return { error: new Error('temporary network failure') };
          }
          return { error: null };
        }
      };
    }
  };
  const service = createPresenceService({
    supabaseClient,
    getCurrentUser: () => ({ id: 'user-a' }),
    getState: () => ({ name: '旅人', rolls: 10, coins: 20, best: { den: 2048 } }),
    totalUnique: () => 3,
    achievementStats: () => ({ achievement_count: 1, achievement_reached_at: null }),
    applyPendingGrants: async () => false,
    scheduleSync() {}
  });

  try {
    await service.heartbeat();
    assert.equal(writes, 1, 'failed heartbeat is attempted');
    await service.heartbeat();
    assert.equal(writes, 2, 'failed heartbeat does not advance last-success timestamp');
    await service.heartbeat();
    assert.equal(writes, 2, 'successful heartbeat is throttled');
    now += PRESENCE_HEARTBEAT_INTERVAL - 1;
    await service.heartbeat();
    assert.equal(writes, 2);
    now += 1;
    await service.heartbeat();
    assert.equal(writes, 3, 'next successful heartbeat occurs at five minutes');
  } finally {
    Date.now = previousNow;
  }
});
