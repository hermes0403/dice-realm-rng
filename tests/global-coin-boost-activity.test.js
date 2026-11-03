import test from 'node:test';
import assert from 'node:assert/strict';
import { createPetIncomeSystem } from '../systems/pet-income.js';
import { createGlobalBoostSystem } from '../systems/global-boost.js';
import { createTimerManager } from '../core/timer-manager.js';

function fakeTimers() {
  let next = 1;
  const intervals = new Map();
  const timeouts = new Map();
  const timerManager = createTimerManager({
    setIntervalFn(callback, delay) { const id = next++; intervals.set(id, { callback, delay }); return id; },
    clearIntervalFn(id) { intervals.delete(id); },
    setTimeoutFn(callback, delay) { const id = next++; timeouts.set(id, { callback, delay }); return id; },
    clearTimeoutFn(id) { timeouts.delete(id); }
  });
  return { timerManager, intervals };
}

test('global coin boost appears in realm activity without exposing personal boost data', () => {
  const originalNow = Date.now;
  Date.now = () => 1_000_000;
  try {
    const welcome = { hidden: false };
    const panel = { hidden: true, innerHTML: '' };
    const documentRef = {
      getElementById(id) { return id === 'realmHeroWelcome' ? welcome : id === 'realmAdminActivity' ? panel : null; }
    };
    const system = createGlobalBoostSystem({
      getBoostState: () => null,
      setBoostState() {},
      getCoinBoost: () => ({ multiplier: 2, expires_at: Date.now() + 60000 }),
      documentRef
    });

    system.renderRealmActivity();

    assert.equal(welcome.hidden, true);
    assert.equal(panel.hidden, false);
    assert.match(panel.innerHTML, /金錢倍率 x2/);
    assert.match(panel.innerHTML, /剩餘 01:00/);
    assert.doesNotMatch(panel.innerHTML, /personal|個人倍率/);
  } finally {
    Date.now = originalNow;
  }
});

test('expired global coin boost removes its activity card and restores welcome', () => {
  const originalNow = Date.now;
  let now = 2_000_000;
  Date.now = () => now;
  try {
    const welcome = { hidden: false };
    const panel = { hidden: true, innerHTML: '' };
    const documentRef = {
      getElementById(id) { return id === 'realmHeroWelcome' ? welcome : id === 'realmAdminActivity' ? panel : null; }
    };
    const system = createGlobalBoostSystem({
      getBoostState: () => null,
      setBoostState() {},
      getCoinBoost: () => now < 2_000_001 ? { multiplier: 2, expires_at: 2_000_001 } : null,
      documentRef
    });
    system.renderRealmActivity();
    assert.equal(panel.hidden, false);
    now += 1000;
    system.renderRealmActivity();
    assert.equal(panel.hidden, true);
    assert.equal(panel.innerHTML, '');
    assert.equal(welcome.hidden, false);
  } finally {
    Date.now = originalNow;
  }
});

test('pet passive income display and payout apply the effective multiplier exactly once', () => {
  const originalNow = Date.now;
  const originalStorage = globalThis.localStorage;
  const originalDocument = globalThis.document;
  let now = 3_000_000;
  Date.now = () => now;
  globalThis.localStorage = { setItem() {} };
  const elements = { petIncomeRate: { textContent: '' }, petIncomeEquipped: { textContent: '' }, coinBalance: { textContent: '' } };
  globalThis.document = { getElementById: id => elements[id] || null };
  try {
    const { timerManager, intervals } = fakeTimers();
    const state = { coins: 0, pets: [{ uid: 'pet-1', kg: 1 }], equippedPetUids: ['pet-1'] };
    const system = createPetIncomeSystem({
      getState: () => state,
      getCurrentUser: () => ({ id: 'player-1' }),
      PET_MUTATIONS: {},
      petBaseIncome: () => 3222,
      petWeightSkillMultiplier: () => 1,
      coinEarningMultiplier: () => 2,
      format: value => Number(value).toLocaleString('en-US'),
      formatWalletScientific: String,
      KEY: 'test-state',
      refreshCoinBoosts: async () => true,
      save() {},
      timerManager
    });
    system.renderPetIncome();
    assert.equal(elements.petIncomeRate.textContent, '+6,444$/秒（2倍）');
    const tick = [...intervals.values()].find(item => item.delay === 1000)?.callback;
    assert.equal(typeof tick, 'function');
    now += 1000;
    tick();
    assert.equal(state.coins, 6444);
    assert.equal(elements.petIncomeRate.textContent, '+6,444$/秒（2倍）');
  } finally {
    Date.now = originalNow;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
