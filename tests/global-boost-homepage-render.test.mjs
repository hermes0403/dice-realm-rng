import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobalBoostSystem } from '../systems/global-boost.js';

function makeSystem({ boost = null, welcome = null } = {}) {
  const panel = { hidden: true, innerHTML: '' };
  const documentRef = {
    getElementById(id) {
      if (id === 'realmHeroWelcome') return welcome;
      if (id === 'realmAdminActivity') return panel;
      return null;
    }
  };
  const system = createGlobalBoostSystem({
    supabaseClient: null,
    getBoostState: () => boost,
    setBoostState: () => {},
    render: () => {},
    restartAutoInterval: () => {},
    loadAdminIncomeMonitor: () => {},
    documentRef,
    timerManager: { clearScope() {}, setInterval() {} }
  });
  return { system, panel };
}

test('renders global boost cards when the legacy welcome element is absent', () => {
  const endsAt = new Date(Date.now() + 120_000).toISOString();
  const { system, panel } = makeSystem({
    boost: { luck_percent: 25, speed_percent: 40, ends_at: endsAt }
  });

  system.renderRealmActivity();

  assert.equal(panel.hidden, false);
  assert.match(panel.innerHTML, /全服運氣 \+25%/);
  assert.match(panel.innerHTML, /全服速度 \+40%/);
});

test('hides and clears the activity panel when no boost is active', () => {
  const { system, panel } = makeSystem();

  system.renderRealmActivity();

  assert.equal(panel.hidden, true);
  assert.equal(panel.innerHTML, '');
});

test('keeps legacy welcome visibility behavior when that element exists', () => {
  const welcome = { hidden: false };
  const endsAt = new Date(Date.now() + 120_000).toISOString();
  const { system, panel } = makeSystem({
    boost: { luck_percent: 25, speed_percent: 0, ends_at: endsAt },
    welcome
  });

  system.renderRealmActivity();

  assert.equal(welcome.hidden, true);
  assert.equal(panel.hidden, false);
});
