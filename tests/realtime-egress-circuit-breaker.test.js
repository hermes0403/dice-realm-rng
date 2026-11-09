import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudSaveService } from '../services/cloud-save.js';
import { createGlobalBoostSystem } from '../systems/global-boost.js';
import { createWeatherSystem } from '../systems/weather.js';

test('Realtime HTTP 402 trips the shared breaker and prevents refresh or resubscribe', async () => {
  let blocked = false;
  let disconnectCalls = 0;
  let channelCreations = 0;
  let refreshQueries = 0;
  let subscribeCallback = null;
  const clearedScopes = [];
  const timerManager = {
    clearTimeout() {},
    clearScope(scope) { clearedScopes.push(scope); },
    setTimeout() { return 1; }
  };
  const statusElement = { textContent: '' };
  const documentRef = {
    getElementById() { return statusElement; },
    addEventListener() {}
  };
  const supabaseClient = {
    realtime: { disconnect() { disconnectCalls++; } },
    channel() {
      channelCreations++;
      const channel = {
        on() { return channel; },
        subscribe(callback) { subscribeCallback = callback; return channel; }
      };
      return channel;
    },
    from() {
      refreshQueries++;
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: null, error: null }; }
      };
    }
  };
  const cloudSave = createCloudSaveService({
    KEY: 'diceRealm',
    D: [],
    POTIONS: [],
    supabaseClient,
    getState: () => ({}),
    setState() {},
    getCurrentUser: () => null,
    fresh: () => ({}),
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
    localStorageRef: { setItem() {}, getItem() { return null; } },
    documentRef,
    windowRef: { addEventListener() {} }
  });
  const globalBoost = createGlobalBoostSystem({
    supabaseClient,
    getBoostState: () => null,
    setBoostState() {},
    render() {},
    restartAutoInterval() {},
    loadAdminIncomeMonitor() {},
    documentRef,
    timerManager,
    isCloudSyncBlocked: () => blocked,
    markCloudSyncBlocked: error => {
      const result = cloudSave.markCloudSyncBlocked(error);
      blocked = cloudSave.isCloudSyncBlocked();
      return result;
    }
  });

  assert.equal(globalBoost.setupGlobalBoostSubscription(), true);
  assert.equal(channelCreations, 1);
  subscribeCallback('CHANNEL_ERROR', {
    status: 402,
    message: 'Service for this project is restricted due to exceed_egress_quota'
  });

  assert.equal(blocked, true);
  assert.equal(disconnectCalls, 1);
  assert.ok(clearedScopes.includes('weather-refresh'));
  assert.ok(clearedScopes.includes('global-boost-refresh'));

  await globalBoost.refreshGlobalBoost();
  assert.equal(globalBoost.setupGlobalBoostSubscription(), false);
  assert.equal(refreshQueries, 0);
  assert.equal(channelCreations, 1);
  assert.equal(disconnectCalls, 1, 'the shared realtime socket is disconnected only once');
});


test('weather realtime and refresh methods do not connect or query while blocked', async () => {
  const previousStorage = globalThis.localStorage;
  const previousDocument = globalThis.document;
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  };
  let channelCreations = 0;
  let reads = 0;
  const makeElement = () => ({
    textContent: '',
    hidden: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}
  });
  const elements = new Map();
  const documentRef = {
    body: { classList: { add() {}, remove() {}, toggle() {} }, appendChild() {} },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    createElement() { return makeElement(); },
    addEventListener() {}
  };
  globalThis.document = documentRef;
  const timerManager = { setInterval() { return 1; } };
  const supabaseClient = {
    channel() { channelCreations++; return { on() { return this; }, subscribe() { return this; } }; },
    from() {
      reads++;
      return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } };
    }
  };
  try {
    const weather = createWeatherSystem({
      D: [],
      WEATHER_TYPES: {},
      format: String,
      escapeHTML: value => String(value),
      chanceText: () => '',
      byId: () => null,
      supabaseClient,
      timerManager,
      getState: () => ({}),
      getCurrentUser: () => ({ id: 'user-1' }),
      getAnnouncementChannel: () => null,
      openAuth() {},
      toast() {},
      save() {},
      isCloudSyncBlocked: () => true,
      markCloudSyncBlocked: () => false,
      render() {},
      renderCodex() {},
      renderGloves() {},
      flushCloudSave: async () => false,
      announceWeatherSummon() {},
      triggerWeatherSurge() {},
      documentRef
    });
    assert.equal(weather.setupServerWeatherSubscription(), false);
    weather.setupPlayerWeatherSubscription();
    await weather.refreshServerWeather(false);
    await weather.refreshPlayerWeatherOverride(false);
    assert.equal(channelCreations, 0);
    assert.equal(reads, 0);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
