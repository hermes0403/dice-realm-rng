import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudSaveService } from '../services/cloud-save.js';
import { setupAccountActions } from '../services/account-actions.js';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    has(key) { return values.has(key); }
  };
}

function createTimers() {
  let nextId = 1;
  const timeouts = new Map();
  return {
    timeouts,
    setTimeout(callback, delay, scope) {
      const id = nextId++;
      timeouts.set(id, { callback, delay, scope });
      return id;
    },
    clearTimeout(id) { timeouts.delete(id); },
    async run(id) {
      const timer = timeouts.get(id);
      assert.ok(timer, 'expected timer to exist');
      timeouts.delete(id);
      timer.callback();
      await new Promise(resolve => setImmediate(resolve));
      return timer;
    }
  };
}

function makeState() {
  return {
    name: '測試玩家', joined: '2026-11-09', rolls: 12, bag: { d1: 12 },
    bagCapacity: 35, first: {}, rollCounts: { d1: 12 }, gloves: [], equipped: '',
    best: { id: 'd1', den: 2 }, coins: 20, pets: [], equippedPetUids: [],
    petDiscovered: {}, petSkillLuckCharges: 0, petSkillDaily: {}, adminGrantApplied: {},
    autoDeleteDice: [], autoSold: 0, autoDepositWeatherEnabled: false,
    autoDepositThreshold: 700, autoDepositDice: [], questDate: '2026-11-09',
    quest: {}, dailyQuestCompletions: 0, weatherConvertAt: 0, achievements: {},
    potions: { inventory: {}, active: {}, activeSpeed: {} }, petAutoSellRarities: {}
  };
}

function makeCloudService({ upsert = async () => ({ error: null }) } = {}) {
  const KEY = 'diceRealmTest';
  const storage = createStorage();
  const timers = createTimers();
  const writes = [];
  const listeners = { document: {}, window: {} };
  const documentRef = {
    visibilityState: 'visible',
    getElementById() { return { textContent: '' }; },
    addEventListener(type, handler) { listeners.document[type] = handler; }
  };
  const windowRef = {
    addEventListener(type, handler) { listeners.window[type] = handler; }
  };
  const state = makeState();
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
          async upsert(row) {
            writes.push(row);
            return upsert(row);
          }
        };
      }
      throw new Error('Unexpected table: ' + table);
    }
  };
  const service = createCloudSaveService({
    KEY, D: [], POTIONS: [], supabaseClient,
    getState: () => state, setState() {},
    getCurrentUser: () => ({ id: 'user-a' }),
    fresh: () => ({ potions: { inventory: {}, active: {}, activeSpeed: {} } }),
    normalizeGloves: value => value, migrateCurrency: value => value,
    ensurePetData() {}, restoreAutoSellPrefs() {}, totalUnique: () => 1,
    render() {}, refreshLeaderboards: async () => {}, toast() {},
    openAuth() {}, showAuthMessage() {}, timerManager: timers,
    localStorageRef: storage, documentRef, windowRef
  });
  return { service, storage, timers, writes, listeners, documentRef, windowRef, state, KEY };
}

test('each save is immediate locally while cloud uploads are coalesced into five-minute batches', async () => {
  const { service, storage, timers, writes, state, KEY } = makeCloudService();

  for (let i = 0; i < 10; i++) {
    state.coins = 100 + i;
    service.save();
  }
  assert.equal(JSON.parse(storage.getItem(KEY)).coins, 109);
  assert.equal(JSON.parse(storage.getItem(KEY + '_user_user-a')).coins, 109);
  assert.equal(writes.length, 0, 'local saves do not wait for or trigger one upload per roll');
  assert.equal(timers.timeouts.size, 1);
  const firstTimer = [...timers.timeouts.entries()][0];
  assert.equal(firstTimer[1].delay, 700, 'the first cloud save is allowed to initialize promptly');
  await timers.run(firstTimer[0]);
  assert.equal(writes.length, 1);

  for (let i = 0; i < 10; i++) {
    state.coins++;
    service.save();
  }
  assert.equal(writes.length, 1, 'subsequent local saves do not upload individually');
  assert.equal(timers.timeouts.size, 1);
  assert.equal([...timers.timeouts.values()][0].delay, 5 * 60 * 1000);
});

test('failed forced cloud sync preserves the newest local save for retry', async () => {
  const { service, storage, state, KEY } = makeCloudService({
    upsert: async () => ({ error: new Error('network unavailable') })
  });
  state.coins = 987654;
  service.save();

  const saved = await service.flushCloudSave();
  assert.equal(saved, false);
  assert.equal(JSON.parse(storage.getItem(KEY)).coins, 987654);
  assert.equal(JSON.parse(storage.getItem(KEY + '_user_user-a')).coins, 987654);
});

test('visibilitychange and pagehide share one best-effort exit backup request', async () => {
  let resolveUpsert;
  const pendingUpsert = new Promise(resolve => { resolveUpsert = resolve; });
  const { listeners, writes, documentRef } = makeCloudService({ upsert: () => pendingUpsert });

  documentRef.visibilityState = 'hidden';
  listeners.document.visibilitychange();
  listeners.window.pagehide();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(writes.length, 1, 'duplicate exit events share the same in-flight backup');

  resolveUpsert({ error: null });
  await new Promise(resolve => setImmediate(resolve));
});

test('manual logout waits for successful cloud sync and keeps the session on failure', async () => {
  const elements = new Map(['saveName', 'resetBtn', 'profileLogoutBtn'].map(id => [id, {
    disabled: false,
    addEventListener(type, handler) { this[type] = handler; }
  }]));
  const documentRef = { getElementById(id) { return elements.get(id); } };
  let signOutCalls = 0;
  const messages = [];
  const supabaseClient = { auth: { async signOut() { signOutCalls++; return { error: null }; } } };
  const setup = flushCloudSave => setupAccountActions({
    documentRef, getState: () => ({}), setState() {},
    getCurrentUser: () => ({ id: 'user-a' }), setCurrentUser() {},
    supabaseClient, SUPABASE_URL: '', SUPABASE_KEY: '',
    totalUnique: () => 0, achievementStats: () => ({}),
    save() {}, render() {}, flushCloudSave,
    toast: message => messages.push(message), stopAuto() {}, KEY: 'test',
    localStorageRef: createStorage(), fresh: () => ({}), refreshLeaderboards: async () => {}
  });

  setup(async () => false);
  await elements.get('profileLogoutBtn').click();
  assert.equal(signOutCalls, 0, 'failed sync must prevent sign-out');

  setup(async () => true);
  await elements.get('profileLogoutBtn').click();
  assert.equal(signOutCalls, 1, 'successful forced sync allows sign-out');
});
