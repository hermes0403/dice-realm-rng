import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresenceService } from '../services/presence.js';

test('presence heartbeat updates only the dedicated presence endpoint', async () => {
  const calls = [];
  let grantChecks = 0;
  let scheduledSyncs = 0;
  const service = createPresenceService({
    supabaseClient: {
      async rpc(name, args) {
        calls.push({ name, args });
        return { data: { updated: true }, error: null };
      }
    },
    getCurrentUser: () => ({ id: 'user-a' }),
    applyPendingGrants: async () => { grantChecks++; return false; },
    scheduleSync() { scheduledSyncs++; }
  });

  await service.heartbeat();

  assert.deepEqual(calls, [{ name: 'touch_player_presence', args: undefined }]);
  assert.equal(grantChecks, 1);
  assert.equal(scheduledSyncs, 0);
});
