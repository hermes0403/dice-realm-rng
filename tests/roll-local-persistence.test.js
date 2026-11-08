import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimerManager } from '../core/timer-manager.js';
import { createDiceSystem } from '../systems/dice.js';

function makeElement(id) {
  const classes = new Set();
  return {
    id, disabled: false, onclick: null, textContent: '',
    style: { setProperty() {} },
    classList: {
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
      toggle(name, force) {
        if (force === undefined ? !classes.has(name) : force) classes.add(name);
        else classes.delete(name);
      }
    },
    removeAttribute() { this.disabled = false; }
  };
}

function makeTimers() {
  let nextHandle = 1;
  const timeouts = new Map();
  const intervals = new Map();
  const manager = createTimerManager({
    setTimeoutFn(callback, delay) {
      const id = nextHandle++;
      timeouts.set(id, { callback, delay });
      return id;
    },
    clearTimeoutFn(id) { timeouts.delete(id); },
    setIntervalFn(callback, delay) {
      const id = nextHandle++;
      intervals.set(id, { callback, delay });
      return id;
    },
    clearIntervalFn(id) { intervals.delete(id); }
  });
  return { manager, timeouts, intervals };
}

test('a completed roll is saved locally before an unresolved remote announcement', async () => {
  const previousStorage = globalThis.localStorage;
  const localWrites = [];
  globalThis.localStorage = {
    setItem(key, value) { localWrites.push({ key, value: JSON.parse(value) }); }
  };
  const state = {
    bagCapacity: 35, rolls: 0, bag: {}, first: {},
    quest: { rolls: 0, coinsEarned: 0, rare: 0 },
    rollCounts: {}, potions: {}, autoDeleteDice: [],
    autoDepositWeatherEnabled: false, autoDepositDice: [], best: null
  };
  const ids = ['diceFace', 'rollBtn', 'autoBtn', 'resultName', 'resultRarity', 'resultSub'];
  const elements = new Map(ids.map(id => [id, makeElement(id)]));
  const documentRef = {
    hidden: false,
    getElementById(id) { return elements.get(id) || null; },
    addEventListener() {}
  };
  const timers = makeTimers();
  let saveCalls = 0;
  let savedSnapshot = null;
  const dice = createDiceSystem({
    D: [{ id: 'd1', den: 2048, name: '測試骰', icon: '🎲', color: '#ffffff' }],
    ANGEL_ODDS: [], POTIONS: [], KEY: 'roll-test',
    timerManager: timers.manager, supabaseClient: null,
    getState: () => state, getCurrentUser: () => null,
    getWeather: () => ({ type: 'sunny', types: ['sunny'] }),
    luck: () => 0, speed: () => 0, byId: () => null,
    format: String, chanceText: () => '1/2048', totalDice: () => 0,
    go() {}, toast() {}, isLockHeld: () => false, isHeartbeatActive: () => true,
    scheduleUnlock() {}, applyPetRollSkills: () => 0, potionMaterialTotal: () => 0,
    checkAchievements() {}, checkDailyReward() {},
    save() { saveCalls++; savedSnapshot = structuredClone(state); },
    autoDepositRolledWeatherDice: async () => {},
    broadcastRareRoll: () => new Promise(() => {}),
    render() {}, documentRef
  });

  try {
    dice.doRoll();
    assert.equal(state.rolls, 1);
    assert.equal(localWrites.length, 1, 'roll sequence is written locally as soon as the roll starts');
    const processing = [...timers.timeouts.values()].find(timer => timer.delay === 650);
    assert.ok(processing, 'existing roll processing timing remains unchanged');
    processing.callback();
    await Promise.resolve();

    assert.equal(state.bag.d1, 1);
    assert.equal(saveCalls, 1, 'the completed result is saved before remote work resolves');
    assert.equal(savedSnapshot.bag.d1, 1);
    assert.equal(savedSnapshot.rolls, 1);
    assert.equal([...timers.timeouts.values()].some(timer => timer.delay === 250), true,
      'the roll lifecycle continues without waiting for the remote announcement');
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
