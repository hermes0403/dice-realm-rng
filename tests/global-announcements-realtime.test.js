import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobalAnnouncements } from '../systems/global-announcements.js';

test('global announcement channel keeps broadcasts without duplicating weather table subscription', () => {
  const registered = [];
  let subscribed = false;
  const channel = {
    on(type, filter) {
      registered.push({ type, event: filter?.event, table: filter?.table });
      return this;
    },
    subscribe() {
      subscribed = true;
      return this;
    }
  };
  const system = createGlobalAnnouncements({
    getState: () => ({}),
    getCurrentUser: () => null,
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
});
