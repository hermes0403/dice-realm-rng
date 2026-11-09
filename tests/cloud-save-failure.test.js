import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudSaveService } from '../services/cloud-save.js';
import { createTimerManager } from '../core/timer-manager.js';

function createFakeTimers() {
  let nextHandle = 1;
  const timeouts = new Map();
  const intervals = new Map();
  const manager = createTimerManager({
    setIntervalFn(callback, delay) {
      const handle = nextHandle++;
      intervals.set(handle, { callback, delay });
      return handle;
    },
    clearIntervalFn(handle) { intervals.delete(handle); },
    setTimeoutFn(callback, delay) {
      const handle = nextHandle++;
      timeouts.set(handle, { callback, delay });
      return handle;
    },
    clearTimeoutFn(handle) { timeouts.delete(handle); }
  });
  return { manager, timeouts, intervals };
}

test('HTTP 402 egress restriction pauses cloud retries but keeps local saves writable', async () => {
  const storage = new Map();
  const localStorageRef = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };
  const status = { textContent: '' };
  const documentRef = {
    getElementById(id) { return id === 'saveStatus' ? status : { style: {} }; },
    addEventListener() {}
  };
  const timers = createFakeTimers();
  const restrictedError = {
    status: 402,
    message: 'Service for this project is restricted due to exceed_egress_quota'
  };
  let cloudReadCount = 0;
  const supabaseClient = {
    from() {
      cloudReadCount++;
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: null, error: restrictedError }; }
      };
    }
  };
  const state = {
    name: 'Local Player',
    rolls: 12,
    coins: 345,
    bag: { d1: 4 },
    first: {},
    pets: [],
    equippedPetUids: [],
    achievements: {},
    potions: { inventory: {} }
  };
  const service = createCloudSaveService({
    KEY: 'diceRealm',
    D: [],
    POTIONS: [],
    supabaseClient,
    getState: () => state,
    setState(value) { Object.assign(state, value); },
    getCurrentUser: () => ({ id: 'user-1' }),
    fresh: () => ({ bag: {}, pets: [], potions: { inventory: {} } }),
    normalizeGloves: value => value,
    migrateCurrency: value => value,
    ensurePetData() {},
    restoreAutoSellPrefs() {},
    totalUnique: () => 1,
    render() {},
    refreshLeaderboards: async () => {},
    toast() {},
    openAuth() {},
    showAuthMessage() {},
    timerManager: timers.manager,
    localStorageRef,
    documentRef,
    windowRef: { addEventListener() {} }
  });

  const loaded = await service.loadCloudSave();
  assert.equal(loaded, false);
  assert.match(status.textContent, /雲端服務受限/);

  state.coins = 999;
  service.save();

  assert.equal(JSON.parse(storage.get('diceRealm')).coins, 999);
  assert.equal(JSON.parse(storage.get('diceRealm_user_user-1')).coins, 999);
  assert.equal(timers.manager.getStats().total, 0);
  assert.equal(cloudReadCount, 1);
  assert.equal(status.textContent, '本機已保存（雲端服務受限）');
});

test('local dirty-save recovery counts as a successful session load without overwriting cloud data', async () => {
  const storage = new Map();
  const localStorageRef = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };
  const status = { textContent: '' };
  const documentRef = {
    getElementById(id) { return id === 'saveStatus' ? status : { style: {} }; },
    addEventListener() {}
  };
  const timers = createFakeTimers();
  const localSave = {
    name: 'Recovered Player',
    rolls: 321,
    coins: 654,
    bag: { d1: 8 },
    first: {},
    pets: [],
    equippedPetUids: [],
    achievements: {},
    potions: { inventory: {} }
  };
  storage.set('diceRealm_user_user-2', JSON.stringify(localSave));
  storage.set('diceRealm_cloud_dirty_user-2', JSON.stringify({
    userId: 'user-2',
    baseVersion: 'cloud-version-1'
  }));
  let cloudReadCount = 0;
  const supabaseClient = {
    from() {
      cloudReadCount++;
      throw new Error('dirty local recovery must not read cloud data');
    }
  };
  const state = { name: 'Before recovery', rolls: 0, coins: 0, bag: {}, pets: [] };
  const service = createCloudSaveService({
    KEY: 'diceRealm',
    D: [],
    POTIONS: [],
    supabaseClient,
    getState: () => state,
    setState(value) { Object.assign(state, value); },
    getCurrentUser: () => ({ id: 'user-2' }),
    fresh: () => ({ bag: {}, pets: [], potions: { inventory: {} } }),
    normalizeGloves: value => value,
    migrateCurrency: value => value,
    ensurePetData() {},
    restoreAutoSellPrefs() {},
    totalUnique: () => 1,
    render() {},
    toast() {},
    openAuth() {},
    showAuthMessage() {},
    timerManager: timers.manager,
    localStorageRef,
    documentRef,
    windowRef: { addEventListener() {} }
  });

  const loaded = await service.loadCloudSave();
  assert.equal(loaded, true);
  assert.equal(state.name, 'Recovered Player');
  assert.equal(state.rolls, 321);
  assert.equal(state.coins, 654);
  assert.equal(cloudReadCount, 0);
  assert.equal(timers.manager.getStats().total, 1);
  assert.match(status.textContent, /安全檢查雲端版本/);
});
