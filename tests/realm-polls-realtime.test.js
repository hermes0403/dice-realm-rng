import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealmPolls } from '../systems/realm-polls.js';

test('realm poll sync uses broadcasts and lowers fallback polling after realtime connects', async () => {
  let currentUser = null;
  let subscriptionCallback = null;
  let channels = 0;
  let unsubscribed = 0;
  const registered = [];
  const queries = [];
  const intervalDelays = [];
  const channel = {
    on(type, filter) {
      registered.push({ type, event: filter?.event });
      return this;
    },
    subscribe(callback) {
      subscriptionCallback = callback;
      return this;
    },
    async send() { return 'ok'; },
    async unsubscribe() { unsubscribed++; return 'ok'; }
  };
  const timerManager = {
    clearScope(scope) {
      if (scope === 'realm-poll-sync') intervalDelays.length = 0;
    },
    setInterval(_callback, delay, scope) {
      if (scope === 'realm-poll-sync') intervalDelays.push(delay);
      return intervalDelays.length;
    },
    clearInterval() {},
    setTimeout() {},
    clearTimeout() {}
  };
  const documentRef = {
    getElementById() { return { addEventListener() {}, style: {}, textContent: '' }; },
    querySelector() { return { textContent: '' }; },
    querySelectorAll() { return []; }
  };
  const supabaseClient = {
    channel() { channels++; return channel; },
    from(table) {
      queries.push(table);
      const builder = {
        select() { return this; },
        gt() { return this; },
        eq() { return this; },
        order() { return this; },
        async limit() { return { data: [], error: null }; }
      };
      return builder;
    }
  };
  const system = createRealmPolls({
    getState: () => ({ name: 'Test Player' }),
    getCurrentUser: () => currentUser,
    supabaseClient,
    isAdmin: () => false,
    escapeHTML: value => String(value),
    format: value => String(value),
    documentRef,
    timerManager
  });

  system.setupRealmSocialUI();
  assert.equal(channels, 0);
  assert.deepEqual(intervalDelays, []);

  currentUser = { id: 'player-1' };
  await system.startRealmPollSync();
  assert.equal(channels, 1);
  assert.deepEqual(
    registered.filter(item => item.type === 'broadcast').map(item => item.event).sort(),
    ['admin_message', 'poll_started', 'poll_vote']
  );
  assert.deepEqual(queries, ['realm_admin_messages', 'realm_polls']);
  assert.equal(intervalDelays.at(-1), 1500);

  queries.length = 0;
  subscriptionCallback('SUBSCRIBED');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(queries, ['realm_polls']);
  assert.equal(intervalDelays.at(-1), 60000);

  subscriptionCallback('CHANNEL_ERROR');
  assert.equal(intervalDelays.at(-1), 1500);
  queries.length = 0;
  await system.realmPollTick();
  assert.deepEqual(queries, ['realm_admin_messages', 'realm_polls']);

  system.stopRealmPollSync();
  assert.equal(unsubscribed, 1);
  assert.deepEqual(intervalDelays, []);
});

test('realm poll setup sends no requests or subscriptions while cloud is restricted', () => {
  let channels = 0;
  const intervals = [];
  const system = createRealmPolls({
    getState: () => ({}),
    getCurrentUser: () => ({ id: 'player-1' }),
    supabaseClient: { channel() { channels++; return {}; } },
    isAdmin: () => false,
    escapeHTML: value => String(value),
    format: value => String(value),
    documentRef: { getElementById() { return { addEventListener() {} }; } },
    timerManager: {
      clearScope() {},
      setInterval(_callback, delay, scope) { if (scope === 'realm-poll-sync') intervals.push(delay); },
      clearInterval() {},
      setTimeout() {},
      clearTimeout() {}
    },
    isCloudSyncBlocked: () => true
  });

  system.setupRealmSocialUI();
  await system.startRealmPollSync();
  assert.equal(channels, 0);
  assert.deepEqual(intervals, []);
});
