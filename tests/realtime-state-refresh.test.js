import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobalBoostSystem } from '../systems/global-boost.js';
import { createWeatherSystem } from '../systems/weather.js';
import { createTimerManager } from '../core/timer-manager.js';

function fakeTimers() {
  let next = 1;
  const intervals = new Map();
  const timerManager = createTimerManager({
    setIntervalFn(callback, delay) {
      const id = next++;
      intervals.set(id, { callback, delay });
      return id;
    },
    clearIntervalFn(id) { intervals.delete(id); },
    setTimeoutFn(callback, delay) { return this.setIntervalFn(callback, delay); },
    clearTimeoutFn(id) { intervals.delete(id); }
  });
  return { timerManager, intervals };
}

function realtimeClient() {
  const handlers = new Map();
  const tables = [];
  const client = {
    handlers,
    tables,
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() { return { data: null, error: null }; }
      };
      tables.push(table);
      return query;
    },
    channel(name) {
      const channel = {
        on(event, filter, callback) {
          handlers.set(filter.table, callback);
          return channel;
        },
        subscribe(callback) {
          callback?.('SUBSCRIBED');
          return channel;
        }
      };
      return channel;
    },
    removeChannel() {}
  };
  return client;
}

test('global boost uses Realtime and keeps a five-minute fallback plus live UI timers', async () => {
  const { timerManager, intervals } = fakeTimers();
  const client = realtimeClient();
  let boost = null;
  let renders = 0;
  let restarts = 0;
  const system = createGlobalBoostSystem({
    supabaseClient: client,
    getBoostState: () => boost,
    setBoostState: value => { boost = value; },
    render: () => { renders++; },
    restartAutoInterval: () => { restarts++; },
    loadAdminIncomeMonitor() {},
    documentRef: { addEventListener() {}, getElementById() { return null; } },
    timerManager
  });

  system.setupGlobalBoostUI();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.ok(client.handlers.has('realm_global_boost'));
  assert.ok([...intervals.values()].some(timer => timer.delay === 300_000));
  assert.ok([...intervals.values()].some(timer => timer.delay === 1_000));
  assert.ok(![...intervals.values()].some(timer => timer.delay === 3_000));

  client.handlers.get('realm_global_boost')({
    eventType: 'UPDATE',
    new: {
      luck_percent: 25,
      speed_percent: 10,
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 60_000).toISOString()
    }
  });

  assert.equal(system.activeGlobalBoost().luck_percent, 25);
  assert.equal(system.activeGlobalBoost().speed_percent, 10);
  assert.equal(renders, 1);
  assert.equal(restarts, 1);
});

test('shared weather uses Realtime and retains local countdown plus five-minute reconciliation', async () => {
  const originalDocument = globalThis.document;
  const originalStorage = globalThis.localStorage;
  const { timerManager, intervals } = fakeTimers();
  const client = realtimeClient();
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  };
  globalThis.document = {
    body: {
      classList: { toggle() {} },
      appendChild() {}
    },
    createElement() {
      return { setAttribute() {}, classList: { add() {}, remove() {} } };
    },
    getElementById() { return null; },
    addEventListener() {}
  };

  try {
    const system = createWeatherSystem({
      D: [],
      WEATHER_TYPES: {},
      format: String,
      escapeHTML: String,
      chanceText: String,
      byId: () => null,
      supabaseClient: client,
      timerManager,
      getState: () => ({ bag: {}, equipped: '', gloves: {} }),
      getCurrentUser: () => ({ id: 'player-1' }),
      getAnnouncementChannel: () => null,
      openAuth() {},
      toast() {},
      save() {},
      render() {},
      renderCodex() {},
      renderGloves() {},
      async flushCloudSave() {},
      announceWeatherSummon() {},
      triggerWeatherSurge() {}
    });

    system.setupServerWeatherSubscription();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.ok(client.handlers.has('realm_weather_state'));
    assert.ok([...intervals.values()].some(timer => timer.delay === 300_000));
    assert.ok([...intervals.values()].some(timer => timer.delay === 1_000));
    assert.ok(![...intervals.values()].some(timer => timer.delay === 12_000));

    client.handlers.get('realm_weather_state')({
      eventType: 'UPDATE',
      new: {
        weather_type: 'rain',
        ends_at: new Date(Date.now() + 300_000).toISOString(),
        summoned_by: '測試玩家',
        updated_at: new Date().toISOString()
      }
    });

    assert.equal(system.getWeather().type, 'rain');
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});
