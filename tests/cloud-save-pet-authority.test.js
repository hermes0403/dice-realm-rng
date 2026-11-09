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

function createService({ localSave, cloudSave, rpcHandler, storage: providedStorage, version: initialVersion, gameSavePromise } = {}) {
  const KEY = 'diceRealmTest';
  const storage = providedStorage || createStorage({
    [KEY + '_user_user-a']: JSON.stringify(localSave || {})
  });
  const writes = [];
  const scheduled = [];
  let version = initialVersion || '2026-11-09T00:00:00.000Z';
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
            if (gameSavePromise) return await gameSavePromise;
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
  let currentUserId = 'user-a';
  const timerManager = {
    clearTimeout() {},
    setTimeout(callback, delay) { scheduled.push({ callback, delay }); return scheduled.length; }
  };
  const service = createCloudSaveService({
    KEY, D: [], POTIONS: [], supabaseClient,
    getState: () => state,
    setState: value => { state = value; },
    getCurrentUser: () => ({ id: currentUserId }),
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
  return { service, storage, writes, scheduled, getState: () => state, setUserId: value => { currentUserId = value; } };
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
  assert.equal(Object.hasOwn(writes[0].args.p_save_patch, 'pets'), false, 'unchanged authoritative pets should not be resent');

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
  assert.equal(Object.hasOwn(writes[0].args.p_save_patch, 'pets'), false, 'unchanged empty pet inventory should not be resent');
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

test('manual cloud flush sends pending changes immediately', async () => {
  const { service, writes, scheduled, getState } = createService({
    cloudSave: { bag: { d1: 1 }, pets: [], equippedPetUids: [], coins: 100, rolls: 10 }
  });

  await service.loadCloudSave();
  getState().coins = 140;
  service.save();
  assert.equal(scheduled.length, 1);
  const before = writes.length;

  assert.equal(await service.flushCloudSave(), true);
  assert.equal(writes.length, before + 1);
  assert.deepEqual(Object.keys(writes.at(-1).args.p_save_patch), ['coins']);
});

test('page-exit backup callers share one in-flight flush', async () => {
  const { service, writes, getState } = createService({
    cloudSave: { bag: { d1: 1 }, pets: [], equippedPetUids: [], coins: 100, rolls: 10 }
  });

  await service.loadCloudSave();
  getState().coins = 150;
  const before = writes.length;
  const visibilityFlush = service.flushOnExit('visibilitychange');
  const pageHideFlush = service.flushOnExit('pagehide');

  const results = await Promise.all([visibilityFlush, pageHideFlush]);
  assert.deepEqual(results, [true, true]);
  assert.equal(writes.length, before + 1);
});

test('a previous account snapshot is never written into a different account', async () => {
  const { service, writes, setUserId, getState } = createService({
    cloudSave: { bag: { d1: 1 }, pets: [], equippedPetUids: [], coins: 100, rolls: 10 }
  });

  await service.loadCloudSave();
  const before = writes.length;
  setUserId('user-b');
  getState().coins = 999;

  assert.equal(await service.syncCloudSave(), false);
  assert.equal(writes.length, before);
});


test('dirty local progress survives reload and uses the saved cloud version as a safe sync baseline', async () => {
  const cloudSave = { bag: { d1: 1 }, pets: [], equippedPetUids: [], coins: 100, rolls: 10 };
  const first = createService({ cloudSave });
  await first.service.loadCloudSave();
  first.service.markCloudSyncBlocked({
    status: 402,
    message: 'Service for this project is restricted due to exceed_egress_quota'
  });
  first.getState().coins = 175;
  first.service.save();

  const dirtyKey = 'diceRealmTest_cloud_dirty_user-a';
  const marker = JSON.parse(first.storage.getItem(dirtyKey));
  assert.ok(marker.baseVersion, 'the marker should retain the latest acknowledged cloud version');

  const second = createService({
    storage: first.storage,
    cloudSave,
    version: '2026-11-09T00:00:00.000Z'
  });
  assert.equal(await second.service.loadCloudSave(), false);
  assert.equal(second.getState().coins, 175, 'the newer local state must not be replaced by the cloud snapshot');
  assert.equal(second.scheduled.length, 1, 'a version-checked local recovery sync should be scheduled');
  assert.equal(second.writes.length, 0, 'recovery should not overwrite the cloud before the version check');
});

test('dirty local progress is preserved without upload when no cloud baseline exists but a remote save is present', async () => {
  const first = createService();
  first.service.markCloudSyncBlocked({
    status: 402,
    message: 'Service for this project is restricted due to exceed_egress_quota'
  });
  first.getState().coins = 250;
  first.service.save();

  const second = createService({
    storage: first.storage,
    cloudSave: { bag: { d1: 1 }, pets: [], equippedPetUids: [], coins: 100, rolls: 10 }
  });
  assert.equal(await second.service.loadCloudSave(), false);
  assert.equal(second.getState().coins, 250, 'local progress must remain active');
  assert.equal(second.scheduled.length, 0, 'without a known baseline, do not upload over an existing cloud save');
  assert.equal(second.writes.length, 0);
});

test('dirty local progress can initialize cloud storage when no remote save exists', async () => {
  const first = createService();
  first.service.markCloudSyncBlocked({
    status: 402,
    message: 'Service for this project is restricted due to exceed_egress_quota'
  });
  first.getState().coins = 300;
  first.service.save();

  const second = createService({ storage: first.storage });
  assert.equal(await second.service.loadCloudSave(), false);
  assert.equal(second.getState().coins, 300);
  assert.equal(second.scheduled.length, 1, 'a new cloud save may be created when no remote save exists');
});


test('local changes made while cloud load is pending are not overwritten by its older response', async () => {
  let resolveCloudRead;
  const gameSavePromise = new Promise(resolve => { resolveCloudRead = resolve; });
  const service = createService({ gameSavePromise });
  const loading = service.service.loadCloudSave();

  service.getState().coins = 350;
  service.service.save();
  resolveCloudRead({
    data: {
      save_data: { bag: { d1: 1 }, pets: [], equippedPetUids: [], coins: 100, rolls: 10 },
      updated_at: '2026-11-09T00:00:00.000Z'
    },
    error: null
  });

  assert.equal(await loading, false);
  assert.equal(service.getState().coins, 350);
  assert.ok(service.storage.getItem('diceRealmTest_cloud_dirty_user-a'));
  assert.equal(service.writes.length, 0);
});

test('a cloud version conflict keeps dirty local progress instead of replacing it', async () => {
  const cloudSave = { bag: { d1: 1 }, pets: [], equippedPetUids: [], coins: 100, rolls: 10 };
  const first = createService({ cloudSave });
  await first.service.loadCloudSave();
  first.service.markCloudSyncBlocked({
    status: 402,
    message: 'Service for this project is restricted due to exceed_egress_quota'
  });
  first.getState().coins = 180;
  first.service.save();
  const marker = JSON.parse(first.storage.getItem('diceRealmTest_cloud_dirty_user-a'));

  const second = createService({
    storage: first.storage,
    cloudSave,
    version: '2026-11-09T00:00:10.000Z',
    rpcHandler: async (_name, args) => ({
      data: { ok: false, conflict: true, expected: args.p_expected_updated_at },
      error: null
    })
  });
  await second.service.loadCloudSave();
  assert.equal(await second.service.syncCloudSave(), false);
  assert.equal(second.getState().coins, 180);
  assert.equal(second.writes[0].args.p_expected_updated_at, marker.baseVersion);
  assert.ok(second.storage.getItem('diceRealmTest_cloud_dirty_user-a'));
});
