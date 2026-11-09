import test from 'node:test';
import assert from 'node:assert/strict';
import { runCloudSessionInitialization } from '../services/auth.js';

test('auth cloud initialization stops immediately when a step activates the egress breaker', async () => {
  let blocked = false;
  const calls = [];
  const result = await runCloudSessionInitialization({
    loadPetFusionOdds: async () => {
      calls.push('pet-odds');
      blocked = true;
    },
    heartbeat: async () => calls.push('heartbeat'),
    loadWeatherSummonData: async () => calls.push('weather'),
    isCloudSyncBlocked: () => blocked
  });

  assert.equal(result, false);
  assert.deepEqual(calls, ['pet-odds']);
});

test('auth cloud initialization completes all steps when cloud access remains available', async () => {
  const calls = [];
  const result = await runCloudSessionInitialization({
    loadPetFusionOdds: async () => calls.push('pet-odds'),
    heartbeat: async () => calls.push('heartbeat'),
    loadWeatherSummonData: async refreshState => {
      assert.equal(refreshState, false);
      calls.push('weather');
    },
    isCloudSyncBlocked: () => false
  });

  assert.equal(result, true);
  assert.deepEqual(calls, ['pet-odds', 'heartbeat', 'weather']);
});

test('auth cloud initialization stops after heartbeat activates the egress breaker', async () => {
  let blocked = false;
  const calls = [];
  const result = await runCloudSessionInitialization({
    loadPetFusionOdds: async () => calls.push('pet-odds'),
    heartbeat: async () => {
      calls.push('heartbeat');
      blocked = true;
    },
    loadWeatherSummonData: async () => calls.push('weather'),
    isCloudSyncBlocked: () => blocked
  });

  assert.equal(result, false);
  assert.deepEqual(calls, ['pet-odds', 'heartbeat']);
});
