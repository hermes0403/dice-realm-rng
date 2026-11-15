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
  return {
    setTimeout(callback) { return { callback }; },
    clearTimeout() {}
  };
}

test('resuming a suspended page reloads cloud state and merges local and remote dice deltas', async () => {
  const key = 'diceRealm';
  const versionA = '2026-11-14T10:00:00.000Z';
  const versionB = '2026-11-14T10:05:00.000Z';
  const base = {
    name: '測試玩家', joined: '2026-11-01T00:00:00.000Z',
    rolls: 100, bag: { d1: 5 }, first: {}, rollCounts: { d1: 100 },
    gloves: { g0: 1 }, equipped: 'g0', best: { id: 'd1', den: 2 },
    coins: 50, bagCapacity: 35, lockedDice: [], items: {}, equippedItem: '',
    adminGrantApplied: {}, autoSellThreshold: 0, autoSold: 0,
    autoDeleteDice: [], autoDepositDice: [], autoDepositWeatherEnabled: false,
    autoDepositThreshold: 700, questDate: '', quest: {}, dailyQuestCompletions: 0,
    weatherConvertAt: 0, achievements: {}, pets: [], equippedPetUids: [],
    petDiscovered: {}, petAutoSellRarities: {}, potions: { inventory: {}, active: {}, activeSpeed: {} },
    halloweenUnlocked: { d33: false, d34: false }
  };
  const storage = storageMock();
  let state = { ...base };
  let remoteSave = { ...base };
  let remoteVersion = versionA;
  const documentRef = {
    visibilityState: 'visible',
    getElementById() { return { textContent: '' }; },
    addEventListener() {}
  };
  const service = createCloudSaveService({
    KEY: key, D: [], POTIONS: [],
    supabaseClient: {
      async rpc() { return { data: { ok: true, updated_at: versionB, total_rolls: 0 }, error: null }; },
      from(table) {
        if (table === 'player_grants') {
          return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } };
        }
        if (table === 'game_saves') {
          return {
            select() { return this; }, eq() { return this; },
            async maybeSingle() { return { data: { save_data: remoteSave, updated_at: remoteVersion }, error: null }; }
          };
        }
        throw new Error('Unexpected table ' + table);
      }
    },
    getState: () => state,
    setState: value => { state = value; },
    getCurrentUser: () => ({ id: 'user-1' }),
    fresh: () => ({ ...base, bag: {}, potions: { inventory: {}, active: {}, activeSpeed: {} } }),
    normalizeGloves: value => value,
    migrateCurrency: value => value,
    ensurePetData() {}, restoreAutoSellPrefs() {},
    totalUnique: () => 1, render() {}, refreshLeaderboards: async () => {},
    toast() {}, openAuth() {}, showAuthMessage() {},
    timerManager: timersMock(), localStorageRef: storage, documentRef,
    windowRef: { addEventListener() {} }
  });

  await service.loadCloudSave({ syncAfterLoad: false });
  assert.equal(service.isLoadedFor('user-1'), true);

  state.rolls = 101;
  state.bag = { d1: 5, d65: 1 };
  state.rollCounts = { d1: 100, d65: 1 };
  state.first = { d65: '2026-11-14T10:04:00.000Z' };
  service.save();

  remoteSave = {
    ...base,
    rolls: 102,
    bag: { d1: 5, d66: 1 },
    rollCounts: { d1: 100, d66: 1 },
    first: { d66: '2026-11-14T10:04:30.000Z' }
  };
  remoteVersion = versionB;

  const loaded = await service.refreshCloudSaveOnResume('test-resume');

  assert.equal(loaded, true);
  assert.equal(state.rolls, 103);
  assert.deepEqual(state.bag, { d1: 5, d65: 1, d66: 1 });
  assert.deepEqual(state.rollCounts, { d1: 100, d65: 1, d66: 1 });
  assert.ok(state.first.d65);
  assert.ok(state.first.d66);
  assert.equal(service.isLoadedFor('user-1'), true);
});
