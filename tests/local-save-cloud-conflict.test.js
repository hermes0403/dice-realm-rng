import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudSaveService } from '../services/cloud-save.js';

function storageMock(initial = {}) {
  const values = new Map(Object.entries(initial));
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

function setup({
  local,
  localSavedAt = 0,
  cloud,
  cloudUpdatedAt = '2026-11-10T10:00:00.000Z',
  base = null,
  localBaseVersion = base ? cloudUpdatedAt : null,
  baseHistory = null
}) {
  const KEY = 'diceRealm';
  const localSnapshot = local ? { ...local, _cloudBaseVersion: localBaseVersion } : null;
  const history = baseHistory || (base
    ? [{ version: localBaseVersion, payload: base }]
    : []);
  const initial = {
    [KEY + '_local_saved_at_user-1']: String(localSavedAt),
    [KEY + '_cloud_base_history_user-1']: JSON.stringify(history)
  };
  if (localSnapshot) {
    initial[KEY] = JSON.stringify(localSnapshot);
    initial[KEY + '_user_user-1'] = JSON.stringify(localSnapshot);
  }
  const storage = storageMock(initial);
  let state = { ...(localSnapshot || {}) };
  const cloudWrites = [];
  const documentRef = {
    getElementById() { return { textContent: '' }; },
    addEventListener() {}
  };
  const supabaseClient = {
    async rpc(name, args) {
      cloudWrites.push({ name, args });
      return {
        data: {
          ok: true, conflict: false,
          updated_at: '2026-11-14T00:34:00.000Z',
          total_rolls: Number(args.p_save_patch.rolls) || 0
        },
        error: null
      };
    },
    from(table) {
      if (table === 'player_grants') {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() { return { data: null, error: null }; }
        };
      }
      if (table === 'game_saves') {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() {
            return { data: cloud ? { save_data: cloud, updated_at: cloudUpdatedAt } : null, error: null };
          }
        };
      }
      throw new Error('Unexpected table ' + table);
    }
  };
  const service = createCloudSaveService({
    KEY, D: [], POTIONS: [], supabaseClient,
    getState: () => state, setState: value => { state = value; },
    getCurrentUser: () => ({ id: 'user-1' }),
    fresh: () => ({ bag: {}, potions: { inventory: {}, active: {}, activeSpeed: {} } }),
    normalizeGloves: value => value, migrateCurrency: value => value,
    ensurePetData() {}, restoreAutoSellPrefs() {}, totalUnique: () => 1,
    render() {}, refreshLeaderboards: async () => {}, toast() {},
    openAuth() {}, showAuthMessage() {}, timerManager: timersMock(),
    localStorageRef: storage,
    documentRef,
    windowRef: { addEventListener() {} }
  });
  return { service, storage, getState: () => state, cloudWrites, KEY };
}

const base = {
  name: '測試玩家',
  rolls: 100,
  bag: { d1: 5 },
  first: { d1: '2026-11-01T00:00:00.000Z' },
  rollCounts: { d1: 100 },
  best: { id: 'd1', den: 2, time: '2026-11-01T00:00:00.000Z' },
  autoSold: 0,
  bagCapacity: 35,
  coins: 50,
  pets: [],
  equippedPetUids: [],
  petDiscovered: {},
  achievements: {},
  gloves: [],
  lockedDice: [],
  potions: { inventory: {} }
};

test('three-way merge keeps independent dice rolls from two devices', async () => {
  const version = '2026-11-10T10:00:00.000Z';
  const local = {
    ...base,
    rolls: 110,
    bag: { d1: 6, d65: 1 },
    rollCounts: { d1: 105, d65: 1 },
    first: {
      ...base.first,
      d65: '2026-11-14T08:03:16.927Z'
    },
    best: { id: 'd65', den: 7777777, time: '2026-11-14T08:03:16.927Z' }
  };
  const cloud = {
    ...base,
    rolls: 103,
    bag: { d1: 7, d66: 1 },
    rollCounts: { d1: 103, d66: 1 },
    first: {
      ...base.first,
      d66: '2026-11-14T09:00:00.000Z'
    }
  };
  const { service, getState, cloudWrites } = setup({
    local, base, localBaseVersion: version, cloud, cloudUpdatedAt: '2026-11-14T00:30:00.000Z'
  });

  await service.loadCloudSave();

  assert.equal(getState().rolls, 113);
  assert.deepEqual(getState().bag, { d1: 8, d65: 1, d66: 1 });
  assert.deepEqual(getState().rollCounts, { d1: 108, d65: 1, d66: 1 });
  assert.equal(getState().first.d65, '2026-11-14T08:03:16.927Z');
  assert.equal(getState().best.id, 'd65');
  assert.ok(cloudWrites.some(write => write.name === 'sync_player_game_save_delta'));
});

test('three-way bag merge keeps a local sale and a remote roll of the same die', async () => {
  const version = '2026-11-10T10:00:00.000Z';
  const local = { ...base, bag: { d1: 3 }, rolls: 100, rollCounts: { d1: 100 } };
  const cloud = { ...base, bag: { d1: 6 }, rolls: 101, rollCounts: { d1: 101 } };
  const { service, getState } = setup({
    local, base, localBaseVersion: version, cloud, cloudUpdatedAt: '2026-11-14T00:30:00.000Z'
  });

  await service.loadCloudSave();

  assert.equal(getState().bag.d1, 4, 'local sale (-2) and remote roll (+1) are both applied');
  assert.equal(getState().rolls, 101);
  assert.equal(getState().rollCounts.d1, 101);
});

test('legacy local snapshot cannot win from a later timestamp or higher roll count without a baseline', async () => {
  const local = { ...base, rolls: 500, bag: { d1: 999 } };
  const cloud = { ...base, rolls: 200, bag: { d1: 10 } };
  const { service, getState, storage, KEY } = setup({
    local,
    localSavedAt: Date.parse('2026-11-14T12:00:00.000Z'),
    cloud,
    cloudUpdatedAt: '2026-11-14T11:59:00.000Z',
    base: null
  });

  await service.loadCloudSave();

  assert.equal(getState().rolls, 200);
  assert.deepEqual(getState().bag, { d1: 10 });
  const recovery = JSON.parse(storage.getItem(KEY + '_recovery_user-1'));
  assert.equal(recovery.snapshot.bag.d1, 999, 'the legacy snapshot is retained for recovery');
});

test('cloud wins for transaction-backed coins and pet inventory when both sides changed', async () => {
  const version = '2026-11-10T10:00:00.000Z';
  const baseState = {
    ...base,
    coins: 100,
    pets: [{ uid: 'pet-base', id: 'c1' }],
    equippedPetUids: ['pet-base']
  };
  const local = {
    ...baseState,
    coins: 90,
    pets: [{ uid: 'pet-local', id: 'c2' }],
    equippedPetUids: ['pet-local']
  };
  const cloud = {
    ...baseState,
    coins: 80,
    pets: [],
    equippedPetUids: []
  };
  const { service, getState } = setup({
    local, base: baseState, localBaseVersion: version, cloud,
    cloudUpdatedAt: '2026-11-14T00:30:00.000Z'
  });

  await service.loadCloudSave();

  assert.equal(getState().coins, 80);
  assert.deepEqual(getState().pets, []);
  assert.deepEqual(getState().equippedPetUids, []);
});

test('older local baseline is recovered from history after another tab advances the current baseline', async () => {
  const oldVersion = '2026-11-10T10:00:00.000Z';
  const currentVersion = '2026-11-14T00:20:00.000Z';
  const local = { ...base, rolls: 105, bag: { d1: 5, d65: 1 }, rollCounts: { d1: 100, d65: 1 } };
  const cloud = { ...base, rolls: 103, bag: { d1: 8 }, rollCounts: { d1: 103 } };
  const { service, getState } = setup({
    local,
    localBaseVersion: oldVersion,
    cloud,
    cloudUpdatedAt: '2026-11-14T00:30:00.000Z',
    baseHistory: [
      { version: currentVersion, payload: { ...base, rolls: 102, bag: { d1: 7 }, rollCounts: { d1: 102 } } },
      { version: oldVersion, payload: base }
    ]
  });

  await service.loadCloudSave();

  assert.equal(getState().rolls, 106);
  assert.deepEqual(getState().bag, { d1: 6, d65: 1 });
  assert.deepEqual(getState().rollCounts, { d1: 103, d65: 1 });
});
