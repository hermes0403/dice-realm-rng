import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiceSystem } from '../systems/dice.js';

function makeElement() {
  const classes = new Set();
  return {
    textContent: '',
    disabled: false,
    style: { setProperty() {} },
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, force) => force ? classes.add(name) : classes.delete(name)
    },
    removeAttribute() {},
    get offsetWidth() { return 1; }
  };
}

test('roll count and obtained dice are saved before asynchronous reveal work', async () => {
  const state = {
    rolls: 0,
    bag: {},
    first: {},
    best: null,
    coins: 0,
    bagCapacity: 35,
    quest: { rolls: 0, rare: 0, coinsEarned: 0 },
    rollCounts: {},
    potions: { angelCharges: 0, autoAdd: false, materials: {}, autoAddPotions: [] },
    autoDeleteDice: [],
    autoDepositWeatherEnabled: false,
    autoDepositDice: []
  };
  const saves = [];
  const timers = [];
  const dice = { id: 'd1', name: 'Basic Dice', den: 2, icon: '🎲', color: '#fff' };
  const elements = new Map();
  const documentRef = {
    hidden: false,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    }
  };

  const system = createDiceSystem({
    D: [dice],
    ANGEL_ODDS: [],
    POTIONS: [],
    KEY: 'unused',
    timerManager: {
      setTimeout(fn, ms, scope) {
        const timer = { fn, ms, scope };
        timers.push(timer);
        return timer;
      },
      setInterval() { return {}; },
      clearInterval() {}
    },
    supabaseClient: null,
    getState: () => state,
    getCurrentUser: () => null,
    getWeather: () => ({ type: 'sunny', types: ['sunny'] }),
    luck: () => 0,
    speed: () => 0,
    byId: id => id === dice.id ? dice : null,
    format: value => String(value),
    chanceText: () => '1/2',
    totalDice: () => Object.values(state.bag).reduce((sum, count) => sum + count, 0),
    go() {},
    toast() {},
    isLockHeld: () => false,
    isHeartbeatActive: () => true,
    scheduleUnlock() {},
    applyPetRollSkills: () => 0,
    potionMaterialTotal: () => 0,
    checkAchievements() {},
    checkDailyReward() {},
    save: () => saves.push(JSON.parse(JSON.stringify(state))),
    autoDepositRolledWeatherDice: async () => {},
    broadcastRareRoll: async () => {
      assert.ok(saves.length >= 2, 'completed roll must be saved before network work');
    },
    render() {},
    documentRef
  });

  system.doRoll();
  assert.equal(state.rolls, 1);
  assert.equal(saves.length, 1, 'roll count must be saved immediately');

  const processing = timers.find(timer => timer.scope === 'dice-roll-processing');
  assert.ok(processing, 'roll processing timer should be scheduled');
  await processing.fn();

  assert.equal(state.bag.d1, 1);
  assert.equal(state.rollCounts.d1, 1);
  assert.equal(state.quest.rolls, 1);
  assert.equal(saves.length, 2, 'obtained dice and counters must be saved before async work');
});
