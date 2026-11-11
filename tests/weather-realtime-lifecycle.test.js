import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherSystem } from '../systems/weather.js';

test('shared weather realtime and refresh wait for login and unsubscribe on logout', async () => {
  const originalDocument = globalThis.document;
  const originalStorage = globalThis.localStorage;
  globalThis.document = {
    body: { classList: { toggle() {} }, appendChild() {} },
    createElement() { return { setAttribute() {}, classList: { add() {}, remove() {} } }; },
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  };

  try {
    let currentUser = null;
    let blocked = false;
    let channelCount = 0;
    let queryCount = 0;
    let removedCount = 0;
    const timerCallbacks = [];
    const channel = {
      on() { return this; },
      subscribe() { return this; },
      async unsubscribe() { removedCount++; return 'ok'; }
    };
    const supabaseClient = {
      channel() { channelCount++; return channel; },
      removeChannel() { removedCount++; return Promise.resolve('ok'); },
      from() {
        queryCount++;
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() { return { data: null, error: null }; }
        };
      }
    };
    const timerManager = {
      setInterval(callback, delay, scope) {
        timerCallbacks.push({ callback, delay, scope });
        return timerCallbacks.length;
      },
      clearInterval() {},
      clearScope() {},
      setTimeout() {},
      clearTimeout() {}
    };
    const weather = createWeatherSystem({
      D: [],
      WEATHER_TYPES: { sunny: { label: '晴天' } },
      format: value => String(value),
      escapeHTML: value => String(value),
      chanceText: value => String(value),
      byId: () => null,
      supabaseClient,
      timerManager,
      getState: () => ({}),
      getCurrentUser: () => currentUser,
      getAnnouncementChannel: () => null,
      openAuth() {},
      toast() {},
      save() {},
      render() {},
      renderCodex() {},
      renderGloves() {},
      flushCloudSave: async () => {},
      announceWeatherSummon() {},
      triggerWeatherSurge() {},
      isCloudSyncBlocked: () => blocked,
      markCloudSyncBlocked: () => false
    });

    assert.equal(channelCount, 0);
    assert.equal(weather.setupServerWeatherSubscription(), false);
    await weather.refreshServerWeather(false);
    assert.equal(channelCount, 0);
    assert.equal(queryCount, 0);

    const refreshTimer = timerCallbacks.find(timer => timer.scope === 'weather-refresh');
    assert.ok(refreshTimer);
    refreshTimer.callback();
    assert.equal(queryCount, 0);

    currentUser = { id: 'player-1' };
    assert.equal(weather.setupServerWeatherSubscription(), true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(channelCount, 1);
    assert.equal(queryCount, 1);

    weather.stopServerWeatherSubscription();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(removedCount, 1);
    blocked = true;
    assert.equal(weather.setupServerWeatherSubscription(), false);
    await weather.refreshServerWeather(false);
    assert.equal(channelCount, 1);
    assert.equal(queryCount, 1);
    currentUser = null;
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});
