import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobalAnnouncements } from '../systems/global-announcements.js';

test('global announcement channel keeps broadcasts without duplicating weather table subscription', () => {
  const registered = [];
  let subscribed = false;
  const channel = {
    unsubscribed: false,
    on(type, filter) {
      registered.push({ type, event: filter?.event, table: filter?.table });
      return this;
    },
    subscribe() {
      subscribed = true;
      return this;
    },
    async unsubscribe() {
      this.unsubscribed = true;
      return 'ok';
    }
  };
  const system = createGlobalAnnouncements({
    getState: () => ({}),
    getCurrentUser: () => ({ id: 'player-1' }),
    weatherApi: { applyForcedWeather() {}, applyServerWeatherRow() {} },
    supabaseClient: { channel: () => channel },
    toast() {},
    isAdmin: () => false,
    petById: () => null,
    escapeHTML: value => String(value),
    format: value => String(value),
    WEATHER_TYPES: {},
    documentRef: {},
    timerManager: { clearTimeout() {}, setTimeout() {} }
  });

  system.setupGlobalAnnouncements();

  assert.equal(subscribed, true);
  assert.deepEqual(registered.filter(item => item.type === 'broadcast').map(item => item.event).sort(), [
    'rare_roll',
    'secret_pet',
    'weather_changed',
    'weather_summoned'
  ]);
  assert.equal(registered.some(item => item.type === 'postgres_changes' && item.table === 'realm_weather_state'), false);
  system.stopGlobalAnnouncements();
  assert.equal(channel.unsubscribed, true);
});

test('global announcement realtime is not opened before login or while cloud is restricted', () => {
  let currentUser = null;
  let channels = 0;
  const system = createGlobalAnnouncements({
    getState: () => ({}),
    getCurrentUser: () => currentUser,
    weatherApi: { applyForcedWeather() {}, applyServerWeatherRow() {} },
    supabaseClient: {
      channel() { channels++; return { on() { return this; }, subscribe() { return this; } }; }
    },
    toast() {},
    isAdmin: () => false,
    petById: () => null,
    escapeHTML: value => String(value),
    format: value => String(value),
    WEATHER_TYPES: {},
    documentRef: {},
    timerManager: { clearTimeout() {}, setTimeout() {} },
    isCloudSyncBlocked: () => false
  });

  system.setupGlobalAnnouncements();
  assert.equal(channels, 0);
  currentUser = { id: 'player-1' };
  system.setupGlobalAnnouncements();
  assert.equal(channels, 1);

  const blockedSystem = createGlobalAnnouncements({
    getState: () => ({}),
    getCurrentUser: () => currentUser,
    weatherApi: { applyForcedWeather() {}, applyServerWeatherRow() {} },
    supabaseClient: { channel() { channels++; return { on() { return this; }, subscribe() { return this; } }; } },
    toast() {},
    isAdmin: () => false,
    petById: () => null,
    escapeHTML: value => String(value),
    format: value => String(value),
    WEATHER_TYPES: {},
    documentRef: {},
    timerManager: { clearTimeout() {}, setTimeout() {} },
    isCloudSyncBlocked: () => true
  });
  blockedSystem.setupGlobalAnnouncements();
  assert.equal(channels, 1);
});
