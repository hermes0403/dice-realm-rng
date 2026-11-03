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
    classList: {
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
      contains(name) { return classes.has(name); }
    },
    style: { setProperty() {} },
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
  const elements = new Map(['autoBtn', 'stopBtn', 'rollBtn', 'diceFace'].map(id => [id, makeElement(id)]));
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
  const dice = createDiceSystem({
    D: [], ANGEL_ODDS: [], POTIONS: [], KEY: 'test-save',
    timerManager: timers.manager, supabaseClient: null,
    getState: () => ({ bagCapacity: 35, rolls: 0, bag: {} }),
    getCurrentUser: () => null, getWeather: () => ({ type: 'sunny', types: ['sunny'] }),
    luck: () => 0, speed: () => 0, byId: () => null,
    format: String, chanceText: String, totalDice: () => 0,
    go() {}, toast() {}, isLockHeld: () => false, isHeartbeatActive: () => true,
    scheduleUnlock() {}, applyPetRollSkills: () => 0, potionMaterialTotal: () => 0,
    checkAchievements() {}, checkDailyReward() {}, save() {},
    autoDepositRolledWeatherDice: async () => {}, broadcastRareRoll: async () => {},
    render() {}, documentRef
  });
  return { dice, timers, elements, listeners };
}

test('auto-roll watchdog starts with auto-roll and is cleared by manual stop', () => {
  const { dice, timers, elements } = makeDiceSystem();
  assert.equal(dice.setupAutoRollUI(), true);
  elements.get('autoBtn').onclick();
  assert.equal(timers.intervals.size, 2);
  assert.equal([...timers.manager.getStats().scopes['auto-roll-watchdog']?.intervals || []].length, 0);
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
