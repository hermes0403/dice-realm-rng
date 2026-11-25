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
