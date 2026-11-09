import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresenceService } from '../services/presence.js';

test('HTTP 402 egress restriction stops presence heartbeat and clears its interval', async () => {
  let blocked = false;
  let profileRequests = 0;
  const clearedScopes = [];
  const restrictedError = {
    status: 402,
    message: 'Service for this project is restricted due to exceed_egress_quota'
  };
  const service = createPresenceService({
    supabaseClient: {
      from(table) {
        assert.equal(table, 'player_profiles');
        return {
          async upsert() {
            profileRequests++;
            return { error: restrictedError };
          }
        };
      }
    },
    getCurrentUser: () => ({ id: 'user-1' }),
    getState: () => ({ name: 'Player', rolls: 10, coins: 20, best: {} }),
    totalUnique: () => 1,
    achievementStats: () => ({}),
    applyPendingGrants: async () => false,
    syncCloudSave: async () => false,
    timerManager: {
      clearScope(scope) { clearedScopes.push(scope); }
    },
    isCloudSyncBlocked: () => blocked,
    markCloudSyncBlocked(error) {
      if (Number(error?.status) !== 402) return false;
      blocked = true;
      return true;
    }
  });

  await service.heartbeat();
  assert.equal(blocked, true);
  assert.equal(profileRequests, 1);
  assert.deepEqual(clearedScopes, ['presence-heartbeat']);

  await service.heartbeat();
  assert.equal(profileRequests, 1, 'blocked heartbeat must not issue another Supabase request');
  assert.deepEqual(clearedScopes, ['presence-heartbeat']);
});

test('ordinary presence errors do not activate the egress circuit breaker', async () => {
  let blocked = false;
  let profileRequests = 0;
  const clearedScopes = [];
  const service = createPresenceService({
    supabaseClient: {
      from() {
        return {
          async upsert() {
            profileRequests++;
            return { error: { status: 503, message: 'temporary service unavailable' } };
          }
        };
      }
    },
    getCurrentUser: () => ({ id: 'user-1' }),
    getState: () => ({ name: 'Player', rolls: 10, coins: 20, best: {} }),
    totalUnique: () => 1,
    achievementStats: () => ({}),
    applyPendingGrants: async () => false,
    syncCloudSave: async () => false,
    timerManager: {
      clearScope(scope) { clearedScopes.push(scope); }
    },
    isCloudSyncBlocked: () => blocked,
    markCloudSyncBlocked(error) {
      if (Number(error?.status) !== 402) return false;
      blocked = true;
      return true;
    }
  });

  await service.heartbeat();
  await service.heartbeat();
  assert.equal(blocked, false);
  assert.equal(profileRequests, 2);
  assert.deepEqual(clearedScopes, []);
});
