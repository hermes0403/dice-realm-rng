import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_OFFLINE_TIMEOUT_MS, hasSessionExpiredAfterOffline } from '../services/auth.js';

test('offline duration never forces a signed-in player to log in again', () => {
  const now = 1_800_000_000_000;
  assert.equal(SESSION_OFFLINE_TIMEOUT_MS, 100000);
  assert.equal(hasSessionExpiredAfterOffline(now - 99999, now), false);
  assert.equal(hasSessionExpiredAfterOffline(now - 100000, now), false);
  assert.equal(hasSessionExpiredAfterOffline(now - 180000, now), false);
  assert.equal(hasSessionExpiredAfterOffline(now - 86400000, now), false);
});

test('missing, invalid, and future offline timestamps do not affect authentication', () => {
  const now = 1_800_000_000_000;
  assert.equal(hasSessionExpiredAfterOffline(null, now), false);
  assert.equal(hasSessionExpiredAfterOffline('invalid', now), false);
  assert.equal(hasSessionExpiredAfterOffline(now + 1000, now), false);
});
