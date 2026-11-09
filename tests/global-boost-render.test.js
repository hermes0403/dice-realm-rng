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
