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

function setup({ local, localSavedAt, cloud, cloudUpdatedAt }) {
  const KEY = 'diceRealm';
  const storage = storageMock({
    [KEY]: JSON.stringify(local),
    [KEY + '_user_user-1']: JSON.stringify(local),
    [KEY + '_local_saved_at_user-1']: String(localSavedAt)
  });
  let state = { ...local };
  const cloudWrites = [];
  const supabaseClient = {
    async rpc(name, args) { cloudWrites.push({ name, args }); return { data: { ok: true, conflict: false, updated_at: '2026-11-14T00:34:00.000Z', total_rolls: Number(args.p_save_patch.rolls) || 0 }, error: null }; },
    from(table) {
      if (table === 'player_grants') {
        return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } };
      }
      if (table === 'game_saves') {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() { return { data: { save_data: cloud, updated_at: cloudUpdatedAt }, error: null }; }
        };
      }
      throw new Error('Unexpected table ' + table);
    }
  };
  const service = createCloudSaveService({
    KEY, D: [], POTIONS: [], supabaseClient,
    getState: () => state, setState: value => { state = value; },
    getCurrentUser: () => ({ id: 'user-1' }),
    fresh: () => ({ potions: { inventory: {}, active: {}, activeSpeed: {} } }),
    normalizeGloves: value => value, migrateCurrency: value => value,
    ensurePetData() {}, restoreAutoSellPrefs() {}, totalUnique: () => 1,
    render() {}, refreshLeaderboards: async () => {}, toast() {},
    openAuth() {}, showAuthMessage() {}, timerManager: timersMock(),
    localStorageRef: storage,
    documentRef: { getElementById() { return { textContent: '' }; }, addEventListener() {} },
    windowRef: { addEventListener() {} }
  });
  return { service, storage, getState: () => state, cloudWrites, KEY };
}

const base = {
  name: '測試玩家', rolls: 100, bag: { d1: 100 }, first: {}, rollCounts: { d1: 100 },
  coins: 50, pets: [], equippedPetUids: [], petDiscovered: {}, gloves: [], potions: { inventory: {} }
};

test('login preserves locally saved rolls when the cloud row is older', async () => {
  const local = { ...base, rolls: 125, bag: { d1: 125 }, rollCounts: { d1: 125 } };
  const cloud = { ...base, rolls: 100, bag: { d1: 100 }, rollCounts: { d1: 100 } };
  const { service, getState, cloudWrites, storage, KEY } = setup({
    local, localSavedAt: Date.parse('2026-11-10T10:05:00.000Z'),
    cloud, cloudUpdatedAt: '2026-11-10T10:00:00.000Z'
  });

  await service.loadCloudSave();

  assert.equal(getState().rolls, 125);
  assert.equal(getState().bag.d1, 125);
  assert.equal(JSON.parse(storage.getItem(KEY + '_user_user-1')).rolls, 125);
  assert.equal(cloudWrites.length, 1, 'the newer local snapshot is uploaded to replace the stale cloud row');
  assert.equal(cloudWrites[0].name, 'sync_player_game_save_delta');
  assert.equal(cloudWrites[0].args.p_save_patch.rolls, 125);
  assert.equal(cloudWrites[0].args.p_expected_updated_at, '2026-11-10T10:00:00.000Z');
});

test('legacy local save with a higher roll count wins even without a local timestamp', async () => {
  const local = { ...base, rolls: 126, bag: { d1: 126 }, rollCounts: { d1: 126 } };
  const cloud = { ...base, rolls: 100, bag: { d1: 100 }, rollCounts: { d1: 100 } };
  const { service, getState, cloudWrites } = setup({
    local, localSavedAt: 0, cloud, cloudUpdatedAt: '2026-11-10T10:00:00.000Z'
  });

  await service.loadCloudSave();

  assert.equal(getState().rolls, 126);
  assert.equal(getState().bag.d1, 126);
  assert.equal(cloudWrites[0].name, 'sync_player_game_save_delta');
  assert.equal(cloudWrites[0].args.p_save_patch.rolls, 126);
});


test('cloud save sends only changed fields and skips unchanged snapshots', async () => {
  const { service, getState, cloudWrites } = setup({
    local: { ...base },
    localSavedAt: 0,
    cloud: { ...base },
    cloudUpdatedAt: '2026-11-13T23:00:00.000Z'
  });

  await service.loadCloudSave();
  const initialWriteCount = cloudWrites.length;
  getState().coins = 75;
  await service.syncCloudSave();

  assert.equal(cloudWrites.length, initialWriteCount + 1);
  assert.deepEqual(Object.keys(cloudWrites.at(-1).args.p_save_patch), ['coins']);
  assert.equal(cloudWrites.at(-1).args.p_expected_updated_at, '2026-11-14T00:34:00.000Z');

  const writeCountAfterChange = cloudWrites.length;
  await service.syncCloudSave();
  assert.equal(cloudWrites.length, writeCountAfterChange, 'unchanged saves must not call Supabase');
});
