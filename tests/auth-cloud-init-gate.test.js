import test from 'node:test';
import assert from 'node:assert/strict';
import { runCloudSessionInitialization } from '../services/auth.js';

test('player visit tracking and personal weather subscription start only after cloud initialization', async () => {
  const calls = [];
  const result = await runCloudSessionInitialization({
    loadPetFusionOdds: async () => calls.push('fusion'),
    heartbeat: async () => calls.push('heartbeat'),
    loadWeatherSummonData: async () => calls.push('weather-data'),
    afterInitialization: async () => calls.push('visit-and-personal-weather'),
    isCloudSyncBlocked: () => false
  });

  assert.equal(result, true);
  assert.deepEqual(calls, [
    'fusion',
    'heartbeat',
    'weather-data',
    'visit-and-personal-weather'
  ]);
});

test('a cloud restriction during initialization prevents visit tracking and personal weather subscription', async () => {
  const calls = [];
  let blocked = false;
  const result = await runCloudSessionInitialization({
    loadPetFusionOdds: async () => calls.push('fusion'),
    heartbeat: async () => { calls.push('heartbeat'); blocked = true; },
    loadWeatherSummonData: async () => calls.push('weather-data'),
    afterInitialization: async () => calls.push('visit-and-personal-weather'),
    isCloudSyncBlocked: () => blocked
  });

  assert.equal(result, false);
  assert.deepEqual(calls, ['fusion', 'heartbeat']);
});

test('a restriction raised by visit tracking prevents personal weather subscription follow-up', async () => {
  const calls = [];
  let blocked = false;
  const result = await runCloudSessionInitialization({
    loadPetFusionOdds: async () => calls.push('fusion'),
    heartbeat: async () => calls.push('heartbeat'),
    loadWeatherSummonData: async () => calls.push('weather-data'),
    afterInitialization: async () => { calls.push('visit'); blocked = true; },
    isCloudSyncBlocked: () => blocked
  });

  assert.equal(result, false);
  assert.deepEqual(calls, ['fusion', 'heartbeat', 'weather-data', 'visit']);
});
