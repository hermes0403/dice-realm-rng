import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimerManager } from '../core/timer-manager.js';
import { createDiceSystem } from '../systems/dice.js';

function makeElement(id) {
  const classes = new Set();
  return {
    id,
    disabled: false,
    onclick: null,
    textContent: '',
    style: { setProperty() {} },
    classList: {
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
      toggle(name, force) {
        if (force === undefined ? !classes.has(name) : force) classes.add(name);
        else classes.delete(name);
      },
      contains(name) { return classes.has(name); }
    },
    removeAttribute() { this.disabled = false; }
  };
}

function makeTimers() {
  let nextHandle = 1;
  const intervals = new Map();
  const timeouts = new Map();
  const manager = createTimerManager({
    setIntervalFn(callback, delay) {
      const handle = nextHandle++;
      intervals.set(handle, { callback, delay });
      return handle;
    },
    clearIntervalFn(handle) { intervals.delete(handle); },
    setTimeoutFn(callback, delay) {
      const handle = nextHandle++;
      timeouts.set(handle, { callback, delay });
      return handle;
    },
    clearTimeoutFn(handle) { timeouts.delete(handle); }
  });
  return { manager, intervals, timeouts };
}

function makeDiceSystem() {
  const ids = [
    'autoBtn', 'stopBtn', 'rollBtn', 'diceFace',
    'resultName', 'resultRarity', 'resultSub'
  ];
  const elements = new Map(ids.map(id => [id, makeElement(id)]));
  const listeners = new Map();
  const documentRef = {
    hidden: false,
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    getElementById(id) { return elements.get(id) || null; }
  };
  const timers = makeTimers();
  let saves = 0;
  const state = {
    bagCapacity: 35, rolls: 0, bag: {}, first: {},
    quest: { rolls: 0, coinsEarned: 0, rare: 0 },
    potions: {}, autoDepositWeatherEnabled: true,
    autoDepositDice: ['rain-die'], best: null, rollCounts: {}
  };
  const dice = createDiceSystem({
    D: [{ id: 'rain-die', den: 2048, weather: 'rain', color: '#55aaff', icon: '🌧️', name: '雨骰' }],
    ANGEL_ODDS: [], POTIONS: [], KEY: 'test-save',
    timerManager: timers.manager, supabaseClient: {},
    getState: () => state,
    getCurrentUser: () => ({ id: 'test-user' }),
    getWeather: () => ({ type: 'rain', types: ['rain'] }),
    luck: () => 0, speed: () => 0, byId: () => null,
    format: String, chanceText: String, totalDice: () => 0,
    go() {}, toast() {}, isLockHeld: () => false, isHeartbeatActive: () => true,
    scheduleUnlock() {}, applyPetRollSkills: () => 0, potionMaterialTotal: () => 0,
    checkAchievements() {}, checkDailyReward() {}, save() { saves++; },
    autoDepositRolledWeatherDice: () => new Promise(() => {}),
    broadcastRareRoll: async () => {},
    render() {}, documentRef
  });
  return { dice, timers, elements, listeners, getSaveCount: () => saves };
}

test('auto-roll watchdog starts with auto-roll and is cleared by manual stop', () => {
  const { dice, timers, elements } = makeDiceSystem();
  assert.equal(dice.setupAutoRollUI(), true);
  elements.get('autoBtn').onclick();
  assert.equal(timers.intervals.size, 2);
  assert.equal(timers.manager.getStats().scopes['auto-roll-watchdog'].intervals, 1);
  assert.equal(timers.manager.getStats().scopes['auto-roll'].intervals, 1);

  elements.get('stopBtn').onclick();
  assert.equal(timers.intervals.size, 0);
  assert.equal(dice.isAutoRolling(), false);
});

test('restarting the auto-roll interval keeps exactly one watchdog', () => {
  const { dice, timers, elements } = makeDiceSystem();
  dice.setupAutoRollUI();
  elements.get('autoBtn').onclick();
  dice.restartAutoInterval();
  assert.equal(timers.manager.getStats().scopes['auto-roll-watchdog'].intervals, 1);
  assert.equal(timers.manager.getStats().scopes['auto-roll'].intervals, 1);
  dice.stopAuto();
  assert.equal(timers.manager.getStats().total, 0);
});

test('watchdog recovers a roll that remains locked beyond the timeout', async () => {
  const previousNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  try {
    const { dice, timers, elements, getSaveCount } = makeDiceSystem();
    dice.setupAutoRollUI();
    elements.get('autoBtn').onclick();

    const [autoInterval, watchdogInterval] = [...timers.intervals.values()];
    autoInterval.callback();
    const processing = [...timers.timeouts.values()].find(timer => timer.delay === 650);
    assert.ok(processing, 'roll processing timer should be scheduled');
    processing.callback();
    await Promise.resolve();
    assert.equal(dice.isRolling(), true);
    assert.equal(getSaveCount(), 1);

    now += 46000;
    watchdogInterval.callback();
    assert.equal(dice.isRolling(), true);
    assert.equal(getSaveCount(), 2);

    dice.stopAuto();
    timers.manager.clearAll();
  } finally {
    Date.now = previousNow;
  }
});
