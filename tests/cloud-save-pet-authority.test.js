import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudSaveService } from '../services/cloud-save.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    has(key) { return values.has(key); }
  };
}

function createService({ localSave, cloudSave, rpcHandler } = {}) {
  const KEY = 'diceRealmTest';
  const storage = createStorage({
    [KEY + '_user_user-a']: JSON.stringify(localSave || {})
  });
  const writes = [];
  const scheduled = [];
  let version = '2026-11-09T00:00:00.000Z';
  const documentRef = {
    visibilityState: 'visible',
    addEventListener() {},
    getElementById() { return { textContent: '' }; }
  };
  const supabaseClient = {
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
            return { data: cloudSave ? { save_data: cloudSave, updated_at: version } : null, error: null };
          }
        };
      }
      throw new Error('Unexpected table: ' + table);
    },
    async rpc(name, args) {
      writes.push({ name, args });
      if (rpcHandler) return rpcHandler(name, args, writes.length);
      version = new Date(Date.parse(version) + 1000).toISOString();
      return { data: { ok: true, updated_at: version, total_rolls: Number(args.p_save_patch.rolls) || 0 }, error: null };
    }
  };
  let state = { pets: [], equippedPetUids: [], coins: 100, rolls: 10 };
  const timerManager = {
    clearTimeout() {},
    setTimeout(callback, delay) { scheduled.push({ callback, delay }); return scheduled.length; }
  };
  const service = createCloudSaveService({
    KEY, D: [], POTIONS: [], supabaseClient,
    getState: () => state,
    setState: value => { state = value; },
    getCurrentUser: () => ({ id: 'user-a' }),
    fresh: () => ({
      bag: {}, pets: [], equippedPetUids: [], coins: 0, rolls: 0,
      potions: { inventory: {}, active: {}, activeSpeed: {} }
    }),
    normalizeGloves: value => value,
    migrateCurrency: value => value,
    ensurePetData() {},
    restoreAutoSellPrefs() {},
    totalUnique: () => 0,
    render() {},
    refreshLeaderboards: async () => {},
    toast() {},
    openAuth() {},
    showAuthMessage() {},
    timerManager,
    localStorageRef: storage,
    documentRef,
    windowRef: { addEventListener() {} }
  });
  return { service, storage, writes, scheduled, getState: () => state };
}

test('cloud pet inventory does not merge a sold pet from a stale local snapshot', async () => {
  const stalePet = { uid: 'sold-pet-1', id: 'c1', rarity: 'common' };
  const currentPet = { uid: 'cloud-pet-2', id: 'r1', rarity: 'rare' };
  const { service, writes, getState } = createService({
    localSave: { bag: { d1: 1 }, pets: [stalePet], equippedPetUids: [stalePet.uid], coins: 100 },
    cloudSave: { bag: { d1: 1 }, pets: [currentPet], equippedPetUids: [currentPet.uid], coins: 100, rolls: 10 }
  });

  await service.loadCloudSave();

  assert.deepEqual(getState().pets.map(pet => pet.uid), [currentPet.uid]);
  assert.deepEqual(getState().equippedPetUids, [currentPet.uid]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].name, 'sync_player_game_save_delta');
  assert.deepEqual(writes[0].args.p_save_patch.pets.map(pet => pet.uid), [currentPet.uid]);

  await service.syncCloudSave();
  assert.equal(writes.length, 1, 'unchanged state must not issue another save RPC');
});

test('an empty authoritative cloud pet inventory stays empty despite old local pets', async () => {
  const stalePet = { uid: 'sold-pet-2', id: 'c2', rarity: 'common' };
  const { service, writes, getState } = createService({
    localSave: { bag: { d1: 1 }, pets: [stalePet], equippedPetUids: [stalePet.uid], coins: 100 },
    cloudSave: { bag: { d1: 1 }, pets: [], equippedPetUids: [], coins: 100, rolls: 10 }
  });

  await service.loadCloudSave();

  assert.deepEqual(getState().pets, []);
  assert.deepEqual(getState().equippedPetUids, []);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].args.p_save_patch.pets, []);
});

test('a single changed save field sends only that field', async () => {
  const { service, writes, getState } = createService({
    cloudSave: { bag: { d1: 1 }, pets: [], equippedPetUids: [], coins: 100, rolls: 10 }
  });

  await service.loadCloudSave();
  const before = writes.length;
  getState().coins = 125;
  await service.syncCloudSave();

  assert.equal(writes.length, before + 1);
  assert.deepEqual(Object.keys(writes.at(-1).args.p_save_patch), ['coins']);
  assert.equal(writes.at(-1).args.p_save_patch.coins, 125);
});

test('save scheduling keeps the five-minute cloud backup interval', async () => {
  const { service, scheduled, getState } = createService({
    cloudSave: { bag: { d1: 1 }, pets: [], equippedPetUids: [], coins: 100, rolls: 10 }
  });

  await service.loadCloudSave();
  getState().coins = 101;
  service.save();

  assert.equal(scheduled.length, 1);
  assert.ok(scheduled[0].delay >= 299000 && scheduled[0].delay <= 300000);
});

test('failed delta writes do not advance the baseline and can be retried', async () => {
  const { service, writes, getState } = createService({
    cloudSave: { bag: { d1: 1 }, pets: [], equippedPetUids: [], coins: 100, rolls: 10 },
    rpcHandler: async (_name, _args, count) => count === 2
      ? { data: null, error: new Error('temporary network failure') }
      : { data: { ok: true, updated_at: '2026-11-09T00:00:05.000Z', total_rolls: 10 }, error: null }
  });

  await service.loadCloudSave();
  getState().coins = 130;
  await service.syncCloudSave();
  assert.equal(writes.length, 2);

  await service.syncCloudSave();
  assert.equal(writes.length, 3);
  assert.deepEqual(Object.keys(writes.at(-1).args.p_save_patch), ['coins']);
  assert.equal(writes.at(-1).args.p_save_patch.coins, 130);
});
