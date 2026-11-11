import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobalBoostSystem } from '../systems/global-boost.js';

test('realm activity countdown updates text without rebuilding unchanged cards', () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    let boost = { luck_percent: 10, speed_percent: 0, ends_at: new Date(now + 10000).toISOString() };
    let html = '';
    let writes = 0;
    const countdown = { textContent: '' };
    const panel = {
      hidden: false,
      get innerHTML() { return html; },
      set innerHTML(value) { writes++; html = value; },
      querySelector(selector) {
        return selector === '[data-activity-countdown="luck"]' ? countdown : null;
      }
    };
    const welcome = { hidden: false };
    const system = createGlobalBoostSystem({
      supabaseClient: null,
      getBoostState: () => boost,
      setBoostState: value => { boost = value; },
      render() {},
      restartAutoInterval() {},
      loadAdminIncomeMonitor() {},
      getCoinBoost: () => null,
      documentRef: {
        getElementById(id) {
          if (id === 'realmHeroWelcome') return welcome;
          if (id === 'realmAdminActivity') return panel;
          return null;
        },
        addEventListener() {}
      },
      timerManager: { clearScope() {}, setInterval() {}, clearInterval() {} },
      isCloudSyncBlocked: () => false
    });

    system.renderRealmActivity();
    const firstCountdown = countdown.textContent;
    now += 1000;
    system.renderRealmActivity();
    assert.equal(writes, 1);
    assert.notEqual(countdown.textContent, firstCountdown);

    boost = { ...boost, luck_percent: 20 };
    system.renderRealmActivity();
    assert.equal(writes, 2);
    assert.match(html, /全服運氣 \+20%/);
  } finally {
    Date.now = originalNow;
  }
});

test('global boost realtime waits for login and is removed on logout', async () => {
  let currentUser = null;
  let channels = 0;
  let queries = 0;
  let removed = 0;
  const intervals = [];
  const channel = {
    on() { return this; },
    subscribe() { return this; },
    async unsubscribe() { removed++; return 'ok'; }
  };
  const system = createGlobalBoostSystem({
    supabaseClient: {
      channel() { channels++; return channel; },
      removeChannel() { removed++; return Promise.resolve('ok'); },
      from() {
        queries++;
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() { return { data: null, error: null }; }
        };
      }
    },
    getCurrentUser: () => currentUser,
    getBoostState: () => null,
    setBoostState() {},
    render() {},
    restartAutoInterval() {},
    loadAdminIncomeMonitor() {},
    getCoinBoost: () => null,
    documentRef: {
      addEventListener() {},
      getElementById() { return null; }
    },
    timerManager: {
      clearScope() {},
      setInterval(_callback, delay, scope) { intervals.push(scope); },
      clearInterval() {}
    },
    isCloudSyncBlocked: () => false
  });

  system.setupGlobalBoostUI();
  assert.equal(channels, 0);
  assert.equal(queries, 0);

  currentUser = { id: 'player-1' };
  assert.equal(system.startGlobalBoostRealtime(), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(channels, 1);
  assert.equal(queries, 1);

  system.stopGlobalBoostRealtime();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(removed, 1);
  currentUser = null;
  await system.refreshGlobalBoost();
  assert.equal(queries, 1);
});


test('fusion luck activity is displayed and its countdown is refreshed for all players', () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    let boost = {
      luck_percent: 0,
      speed_percent: 0,
      fusion_luck_percent: 50,
      fusion_luck_starts_at: new Date(now - 1000).toISOString(),
      fusion_luck_ends_at: new Date(now + 10000).toISOString()
    };
    let html = '';
    const countdown = { textContent: '' };
    const panel = {
      hidden: false,
      get innerHTML() { return html; },
      set innerHTML(value) { html = value; },
      querySelector(selector) {
        return selector === '[data-activity-countdown="fusion"]' ? countdown : null;
      }
    };
    const system = createGlobalBoostSystem({
      supabaseClient: null,
      getBoostState: () => boost,
      setBoostState: value => { boost = value; },
      render() {},
      restartAutoInterval() {},
      loadAdminIncomeMonitor() {},
      getCoinBoost: () => null,
      documentRef: {
        getElementById(id) {
          if (id === 'realmHeroWelcome') return { hidden: false };
          if (id === 'realmAdminActivity') return panel;
          return null;
        },
        addEventListener() {}
      },
      timerManager: { clearScope() {}, setInterval() {}, clearInterval() {} },
      isCloudSyncBlocked: () => false
    });

    assert.equal(system.activeFusionLuckBoost().percent, 50);
    system.renderRealmActivity();
    assert.match(html, /融合運氣 \+50%/);
    assert.match(countdown.textContent, /剩餘/);
    now += 1000;
    system.renderRealmActivity();
    assert.match(countdown.textContent, /剩餘/);

    now += 11000;
    assert.equal(system.activeFusionLuckBoost(), null);
  } finally {
    Date.now = originalNow;
  }
});
