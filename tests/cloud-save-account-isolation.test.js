import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudSaveService } from '../services/cloud-save.js';

function storageMock() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function timersMock() {
  return { setTimeout(callback) { return { callback }; }, clearTimeout() {} };
}

function freshState() {
  return {
    name: '旅人', joined: '2026-11-18T00:00:00.000Z', rolls: 0,
    bag: {}, first: {}, rollCounts: {}, lockedDice: [], bagCapacity: 35,
    gloves: { g0: 1 }, equipped: 'g0', items: {}, equippedItem: '',
    best: null, coins: 0, currencyVersion: 2, pets: [], equippedPetUids: [],
    petDiscovered: {}, petSkillLuckCharges: 0, petSkillDaily: {},
    petSkillLogin: {}, petSkillSpeed: {}, adminGrantApplied: {},
    autoSellThreshold: 0, autoDeleteDice: [], autoSold: 0,
    autoDepositWeatherEnabled: false, autoDepositThreshold: 700,
    autoDepositDice: [], questDate: '', quest: {}, dailyQuestCompletions: 0,
    weatherConvertAt: 0, achievements: {}, potions: {
      inventory: { luck1: 0, luck2: 0, luck3: 0, speed1: 0, speed2: 0, angel1: 0, angel2: 0 },
      active: { type: '', expiresAt: 0 }, activeSpeed: { type: '', expiresAt: 0 },
      angelCharges: 0, autoAdd: false, materials: {}, autoAddPotions: []
    },
    petAutoSellRarities: {}, halloweenUnlocked: { d33: false, d34: false }
  };
}

test('account switching cannot copy the previous player state into a new UID during cloud load', async () => {
  const key = 'diceRealm';
  const storage = storageMock();
  const oldPlayer = {
    ...freshState(), name: 'Hermes💸', rolls: 54456,
    bag: { d777: 1 }, coins: 138150480, pets: [{ uid: 'old-pet' }]
  };
  storage.setItem(key, JSON.stringify(oldPlayer));

  let state = { ...oldPlayer };
  let finishCloudRead;
  const cloudRead = new Promise(resolve => { finishCloudRead = resolve; });
  const rpcCalls = [];
  const user = { id: 'new-user-1234', user_metadata: { username: 'newplayer' } };
  const documentRef = {
    visibilityState: 'visible',
    getElementById() { return { textContent: '' }; },
    addEventListener() {}
  };
  const service = createCloudSaveService({
    KEY: key, D: [], POTIONS: [],
    supabaseClient: {
      async rpc(name, args) {
        rpcCalls.push({ name, args });
        return { data: { ok: true, updated_at: '2026-11-18T00:01:00.000Z', total_rolls: 0 }, error: null };
      },
      from(table) {
        if (table === 'game_saves') {
          return { select() { return this; }, eq() { return this; }, async maybeSingle() { return cloudRead; } };
        }
        if (table === 'player_grants') {
          return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } };
        }
        throw new Error('Unexpected table ' + table);
      }
    },
    getState: () => state,
    setState: value => { state = value; },
    getCurrentUser: () => user,
    fresh: freshState,
    normalizeGloves: value => value,
    migrateCurrency: value => value,
    ensurePetData() {}, restoreAutoSellPrefs() {},
    totalUnique: () => 0, render() {}, refreshLeaderboards: async () => {},
    toast() {}, openAuth() {}, showAuthMessage() {},
    timerManager: timersMock(), localStorageRef: storage, documentRef,
    windowRef: { addEventListener() {} }
  });

  const loading = service.loadCloudSave();
  service.save();

  assert.deepEqual(JSON.parse(storage.getItem(key)), oldPlayer, 'a pending account must not overwrite the shared offline snapshot');
  assert.equal(storage.getItem(key + '_user_' + user.id), null);
  assert.equal(rpcCalls.length, 0);
  assert.equal(service.isLoadedFor(user.id), false);

  finishCloudRead({ data: null, error: null });
  await loading;

  assert.equal(service.isLoadedFor(user.id), true);
  assert.equal(state.rolls, 0);
  assert.equal(state.coins, 0);
  assert.deepEqual(state.bag, {});
  assert.deepEqual(state.pets, []);
  assert.equal(state.name, 'newplayer_' + user.id.slice(0, 4));
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, 'sync_player_game_save_delta');
  assert.equal(rpcCalls[0].args.p_save_patch.name, 'newplayer_' + user.id.slice(0, 4));
  assert.equal(rpcCalls[0].args.p_save_patch.coins, 0);
});


test('cloud bootstrap never merges pet discoveries from the previous in-memory account', async () => {
  const key = 'diceRealm';
  const storage = storageMock();
  const oldPlayer = { ...freshState(), name: 'old-account', petDiscovered: { oldPet: true } };
  let state = { ...oldPlayer };
  const user = { id: 'new-user-5678', user_metadata: { username: 'newplayer' } };
  const cloudPayload = {
    ...freshState(), name: 'newplayer', coins: 9876, bag: { d42: 2 },
    petDiscovered: { newPet: true }
  };
  storage.setItem(key + '_user_' + user.id, JSON.stringify({
    ...freshState(), name: 'legacy-contaminated', coins: 999999, bag: { d99: 9 },
    petDiscovered: { oldPet: true }
  }));
  const documentRef = {
    visibilityState: 'visible',
    getElementById() { return { textContent: '' }; },
    addEventListener() {}
  };
  const service = createCloudSaveService({
    KEY: key, D: [], POTIONS: [],
    supabaseClient: {
      from(table) {
        if (table === 'game_saves') {
          return {
            select() { return this; },
            eq() { return this; },
            async maybeSingle() { return { data: { save_data: cloudPayload, updated_at: '2026-11-26T00:00:00.000Z' }, error: null }; }
          };
        }
        if (table === 'player_grants') {
          return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } };
        }
        throw new Error('Unexpected table ' + table);
      }
    },
    getState: () => state,
    setState: value => { state = value; },
    getCurrentUser: () => user,
    fresh: freshState,
    normalizeGloves: value => value,
    migrateCurrency: value => value,
    ensurePetData() {}, restoreAutoSellPrefs() {},
    totalUnique: () => 0, render() {}, refreshLeaderboards: async () => {},
    toast() {}, openAuth() {}, showAuthMessage() {},
    timerManager: timersMock(), localStorageRef: storage, documentRef,
    windowRef: { addEventListener() {} }
  });

  await service.loadCloudSave({ syncAfterLoad: false });

  assert.equal(service.isLoadedFor(user.id), true);
  assert.equal(state.name, 'newplayer');
  assert.equal(state.coins, 9876);
  assert.deepEqual(state.bag, { d42: 2 });
  assert.deepEqual(state.petDiscovered, { newPet: true });
  assert.equal(storage.getItem(key), null, 'cloud account data must not be written to the shared offline key');
  assert.ok(storage.getItem(key + '_user_' + user.id));
});


test('late cloud response from account A cannot replace account B after a switch', async () => {
  const key = 'diceRealm';
  const storage = storageMock();
  let state = { ...freshState(), name: 'boot-old-state', coins: 999999, bag: { d99: 9 } };
  let currentUser = { id: 'account-A', user_metadata: { username: 'alpha' } };
  let finishA;
  const readA = new Promise(resolve => { finishA = resolve; });
  const payloadA = { ...freshState(), name: 'alpha', coins: 111, bag: { d1: 1 } };
  const payloadB = { ...freshState(), name: 'bravo', coins: 222, bag: { d2: 2 } };
  const documentRef = {
    visibilityState: 'visible',
    getElementById() { return { textContent: '' }; },
    addEventListener() {}
  };
  const service = createCloudSaveService({
    KEY: key, D: [], POTIONS: [],
    supabaseClient: {
      from(table) {
        let requestedUserId = null;
        return {
          select() { return this; },
          eq(column, value) { requestedUserId = value; return this; },
          async maybeSingle() {
            if (table === 'game_saves') {
              if (requestedUserId === 'account-A') return readA;
              if (requestedUserId === 'account-B') return { data: { save_data: payloadB, updated_at: '2026-11-26T00:02:00.000Z' }, error: null };
            }
            if (table === 'player_grants') return { data: null, error: null };
            throw new Error('Unexpected table ' + table);
          }
        };
      }
    },
    getState: () => state,
    setState: value => { state = value; },
    getCurrentUser: () => currentUser,
    fresh: freshState,
    normalizeGloves: value => value,
    migrateCurrency: value => value,
    ensurePetData() {}, restoreAutoSellPrefs() {},
    totalUnique: () => 0, render() {}, refreshLeaderboards: async () => {},
    toast() {}, openAuth() {}, showAuthMessage() {},
    timerManager: timersMock(), localStorageRef: storage, documentRef,
    windowRef: { addEventListener() {} }
  });

  const loadA = service.loadCloudSave({ syncAfterLoad: false });
  currentUser = { id: 'account-B', user_metadata: { username: 'bravo' } };
  service.resetAccountSession(currentUser.id);
  const loadB = service.loadCloudSave({ syncAfterLoad: false });
  await loadB;

  assert.equal(state.name, 'bravo');
  assert.equal(state.coins, 222);
  assert.deepEqual(state.bag, { d2: 2 });

  finishA({ data: { save_data: payloadA, updated_at: '2026-11-26T00:01:00.000Z' }, error: null });
  await loadA;

  assert.equal(service.isLoadedFor('account-B'), true);
  assert.equal(state.name, 'bravo');
  assert.equal(state.coins, 222);
  assert.deepEqual(state.bag, { d2: 2 });
  assert.equal(storage.getItem(key + '_user_account-A'), null);
});


test('late player grant response from account A cannot mutate account B', async () => {
  const storage = storageMock();
  let currentUser = { id: 'grant-A' };
  let state = { ...freshState(), name: 'alpha', coins: 0, bag: {} };
  let finishGrant;
  const grantRead = new Promise(resolve => { finishGrant = resolve; });
  const documentRef = {
    visibilityState: 'visible',
    getElementById() { return { textContent: '' }; },
    addEventListener() {}
  };
  const service = createCloudSaveService({
    KEY: 'diceRealm', D: [], POTIONS: [],
    supabaseClient: {
      from(table) {
        if (table !== 'player_grants') throw new Error('Unexpected table ' + table);
        return { select() { return this; }, eq() { return this; }, async maybeSingle() { return grantRead; } };
      }
    },
    getState: () => state,
    setState: value => { state = value; },
    getCurrentUser: () => currentUser,
    fresh: freshState,
    normalizeGloves: value => value,
    migrateCurrency: value => value,
    ensurePetData() {}, restoreAutoSellPrefs() {},
    totalUnique: () => 0, render() {}, refreshLeaderboards: async () => {},
    toast() {}, openAuth() {}, showAuthMessage() {},
    timerManager: timersMock(), localStorageRef: storage, documentRef,
    windowRef: { addEventListener() {} }
  });

  service.resetAccountSession(currentUser.id);
  state = { ...freshState(), name: 'alpha', coins: 0, bag: {} };
  const pendingGrant = service.applyPendingGrants(true);

  currentUser = { id: 'grant-B' };
  service.resetAccountSession(currentUser.id);
  finishGrant({
    data: { coins_total: 5000, dice_grants: { d9: 3 } },
    error: null
  });
  await pendingGrant;

  assert.equal(state.coins, 0);
  assert.deepEqual(state.bag, {});
  assert.equal(storage.getItem('diceRealm_user_grant-B'), null);
});


test('late save RPC response from account A cannot write into account B local state', async () => {
  const storage = storageMock();
  let currentUser = { id: 'sync-A', user_metadata: { username: 'alpha' } };
  let state = { ...freshState(), name: 'alpha', coins: 100, bag: { d1: 1 } };
  let finishRpc;
  let rpcStarted = false;
  const rpcRead = new Promise(resolve => { finishRpc = resolve; });
  const documentRef = {
    visibilityState: 'visible',
    getElementById() { return { textContent: '' }; },
    addEventListener() {}
  };
  const service = createCloudSaveService({
    KEY: 'diceRealm', D: [], POTIONS: [],
    supabaseClient: {
      from(table) {
        if (table === 'game_saves') {
          return { select() { return this; }, eq() { return this; }, async maybeSingle() {
            return { data: { save_data: { ...freshState(), name: 'alpha', coins: 100, bag: { d1: 1 } }, updated_at: '2026-11-26T00:03:00.000Z' }, error: null };
          } };
        }
        if (table === 'player_grants') {
          return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } };
        }
        throw new Error('Unexpected table ' + table);
      },
      async rpc() { rpcStarted = true; return rpcRead; }
    },
    getState: () => state,
    setState: value => { state = value; },
    getCurrentUser: () => currentUser,
    fresh: freshState,
    normalizeGloves: value => value,
    migrateCurrency: value => value,
    ensurePetData() {}, restoreAutoSellPrefs() {},
    totalUnique: () => 1, render() {}, refreshLeaderboards: async () => {},
    toast() {}, openAuth() {}, showAuthMessage() {},
    timerManager: timersMock(), localStorageRef: storage, documentRef,
    windowRef: { addEventListener() {} }
  });

  service.resetAccountSession(currentUser.id);
  await service.loadCloudSave({ syncAfterLoad: false });
  state.coins = 200;
  const pendingSync = service.syncCloudSave();
  await Promise.resolve();
  assert.equal(rpcStarted, true);

  currentUser = { id: 'sync-B', user_metadata: { username: 'bravo' } };
  service.resetAccountSession(currentUser.id);
  finishRpc({
    data: { ok: true, updated_at: '2026-11-26T00:04:00.000Z', total_rolls: 0 },
    error: null
  });
  await pendingSync;

  assert.equal(state.name, '旅人');
  assert.equal(state.coins, 0);
  assert.deepEqual(state.bag, {});
  assert.equal(storage.getItem('diceRealm_user_sync-B'), null);
});
