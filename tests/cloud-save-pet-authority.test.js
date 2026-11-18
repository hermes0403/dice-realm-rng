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

function createService({ localSave, cloudSave, baseSave = null, baseVersion = '2026-11-13T22:00:00.000Z' }) {
  const KEY = 'diceRealmTest';
  const initialStorage = {
    [KEY + '_user_user-a']: JSON.stringify(localSave)
  };
  if (baseSave) {
    initialStorage[KEY + '_cloud_base_history_user-a'] = JSON.stringify([{ version: baseVersion, payload: baseSave }]);
  }
  const storage = createStorage(initialStorage);
  const writes = [];
  const documentRef = {
    getElementById() { return { textContent: '' }; }
  };
  const supabaseClient = {
    async rpc(name, args) { writes.push({ name, args }); return { data: { ok: true, conflict: false, updated_at: '2026-11-14T00:34:00.000Z', total_rolls: Number(args.p_save_patch.rolls) || 0 }, error: null }; },
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
          async maybeSingle() { return { data: { save_data: cloudSave, updated_at: '2026-11-13T23:00:00.000Z' }, error: null }; }
        };
      }
      if (table === 'player_profiles') {
        return { async upsert() { return { error: null }; } };
      }
      throw new Error('Unexpected table: ' + table);
    }
  };
  let state = { pets: [], equippedPetUids: [] };
  const timerManager = {
    clearTimeout() {},
    setTimeout() { return 1; }
  };
  const service = createCloudSaveService({
    KEY, D: [], POTIONS: [], supabaseClient,
    getState: () => state,
    setState: value => { state = value; },
    getCurrentUser: () => ({ id: 'user-a' }),
    fresh: () => ({ bag: {}, pets: [], equippedPetUids: [], potions: { inventory: {}, active: {}, activeSpeed: {} } }),
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
    documentRef
  });
  return { service, storage, writes, getState: () => state };
}

test('cloud pet inventory does not merge a sold pet from a stale local snapshot', async () => {
  const stalePet = { uid: 'sold-pet-1', id: 'c1', rarity: 'common' };
  const currentPet = { uid: 'cloud-pet-2', id: 'r1', rarity: 'rare' };
  const { service, writes, getState } = createService({
    localSave: {
      bag: { d1: 1 },
      pets: [stalePet],
      equippedPetUids: [stalePet.uid],
      coins: 100
    },
    cloudSave: {
      bag: { d1: 1 },
      pets: [currentPet],
      equippedPetUids: [currentPet.uid],
      coins: 100
    }
  });

  await service.loadCloudSave();

  assert.deepEqual(getState().pets.map(pet => pet.uid), [currentPet.uid]);
  assert.deepEqual(getState().equippedPetUids, [currentPet.uid]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].name, 'sync_player_game_save_delta');
  assert.ok(!writes[0].args.p_save_patch.pets || writes[0].args.p_save_patch.pets.every(pet => pet.uid === currentPet.uid));
});

test('an empty authoritative cloud pet inventory stays empty despite old local pets', async () => {
  const stalePet = { uid: 'sold-pet-2', id: 'c2', rarity: 'common' };
  const { service, writes, getState } = createService({
    localSave: {
      bag: { d1: 1 },
      pets: [stalePet],
      equippedPetUids: [stalePet.uid],
      coins: 100
    },
    cloudSave: {
      bag: { d1: 1 },
      pets: [],
      equippedPetUids: [],
      coins: 100
    }
  });

  await service.loadCloudSave();

  assert.deepEqual(getState().pets, []);
  assert.deepEqual(getState().equippedPetUids, []);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].name, 'sync_player_game_save_delta');
  assert.ok(!writes[0].args.p_save_patch.pets || writes[0].args.p_save_patch.pets.length === 0);
});


test('locked dice indexes are included in the cloud save payload', () => {
  const { service, getState } = createService({
    localSave: { bag: { d1: 3 }, lockedDice: ['d1:0', 'd1:2'] },
    cloudSave: { bag: { d1: 3 }, lockedDice: ['d1:0', 'd1:2'] }
  });
  getState().lockedDice = ['d1:0', 'd1:2'];
  const payload = service.savePayload();
  assert.deepEqual(payload.lockedDice, ['d1:0', 'd1:2']);
});


test('concurrent cloud updates preserve a locally fused pet added since the baseline', async () => {
  const basePet = { uid: 'pet-base', id: 'c1', rarity: 'common' };
  const localPet = { uid: 'pet-local-new', id: 'l1', rarity: 'legendary', createdAt: '2026-11-14T00:01:00.000Z' };
  const cloudPet = { uid: 'pet-cloud-new', id: 'r1', rarity: 'rare' };
  const baseSave = { bag: { d1: 1 }, rolls: 10, rollCounts: {}, first: {}, best: {}, pets: [basePet], equippedPetUids: [basePet.uid] };
  const localSave = { ...baseSave, pets: [basePet, localPet], equippedPetUids: [basePet.uid, localPet.uid], _cloudBaseVersion: '2026-11-13T22:00:00.000Z' };
  const cloudSave = { ...baseSave, pets: [basePet, cloudPet], equippedPetUids: [basePet.uid, cloudPet.uid] };
  const { service, getState } = createService({ localSave, cloudSave, baseSave });

  await service.loadCloudSave({ syncAfterLoad: false });

  assert.deepEqual(new Set(getState().pets.map(pet => pet.uid)), new Set([basePet.uid, localPet.uid, cloudPet.uid]));
  assert.deepEqual(new Set(getState().equippedPetUids), new Set([basePet.uid, localPet.uid, cloudPet.uid]));
});

test('local pet sale/removal since the baseline is applied without dropping other cloud pets', async () => {
  const soldPet = { uid: 'pet-sold-local', id: 'c1', rarity: 'common' };
  const cloudPet = { uid: 'pet-cloud-new', id: 'r1', rarity: 'rare' };
  const baseSave = { bag: { d1: 1 }, rolls: 10, rollCounts: {}, first: {}, best: {}, pets: [soldPet], equippedPetUids: [soldPet.uid] };
  const localSave = { ...baseSave, pets: [], equippedPetUids: [], _cloudBaseVersion: '2026-11-13T22:00:00.000Z' };
  const cloudSave = { ...baseSave, pets: [soldPet, cloudPet], equippedPetUids: [soldPet.uid, cloudPet.uid] };
  const { service, getState } = createService({ localSave, cloudSave, baseSave });

  await service.loadCloudSave({ syncAfterLoad: false });

  assert.deepEqual(getState().pets.map(pet => pet.uid), [cloudPet.uid]);
  assert.deepEqual(getState().equippedPetUids, [cloudPet.uid]);
});

test('a stale local pet cannot resurrect a pet removed by another device', async () => {
  const removedPet = { uid: 'pet-removed-cloud', id: 'c1', rarity: 'common' };
  const cloudPet = { uid: 'pet-cloud-new', id: 'r1', rarity: 'rare' };
  const baseSave = { bag: { d1: 1 }, rolls: 10, rollCounts: {}, first: {}, best: {}, pets: [removedPet], equippedPetUids: [removedPet.uid] };
  const localSave = { ...baseSave, _cloudBaseVersion: '2026-11-13T22:00:00.000Z' };
  const cloudSave = { ...baseSave, pets: [cloudPet], equippedPetUids: [cloudPet.uid] };
  const { service, getState } = createService({ localSave, cloudSave, baseSave });

  await service.loadCloudSave({ syncAfterLoad: false });

  assert.deepEqual(getState().pets.map(pet => pet.uid), [cloudPet.uid]);
  assert.deepEqual(getState().equippedPetUids, [cloudPet.uid]);
});
