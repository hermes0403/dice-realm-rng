import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgressionSystem } from '../systems/progression.js';

function makeSystem(rolls) {
  const state = {
    rolls, best: null, first: {}, bag: {}, coins: 0, dailyQuestCompletions: 0,
    achievements: {
      roll100: {}, roll1000: {}, roll10000: {}, roll100000: {}
    },
    potions: { inventory: { speed2: 0, luck2: 0, angel1: 0 } }
  };
  const previousDocument = globalThis.document;
  globalThis.document = { getElementById() { return null; } };
  const system = createProgressionSystem({
    getState: () => state, D: [], DAILY_TASKS: [],
    POTIONS: [
      { id: 'speed2', name: '速度藥水 II' },
      { id: 'luck2', name: '幸運藥水 II' },
      { id: 'angel1', name: '天堂藥水 I' }
    ],
    format: String, compactNum: String, totalUnique: () => 0,
    coinEarningMultiplier: () => 1, fresh: () => ({ potions: { inventory: {} } }),
    save() {}, toast() {},
    timerManager: { clearTimeout() {}, setTimeout() { return 1; } }
  });
  return { state, system, restore() { globalThis.document = previousDocument; } };
}

test('300,000-roll milestone grants five Speed II and five Luck II potions', () => {
  const { state, system, restore } = makeSystem(300000);
  try {
    system.checkAchievements();
    assert.equal(state.potions.inventory.speed2, 5);
    assert.equal(state.potions.inventory.luck2, 5);
    assert.equal(state.achievements.roll300000.reward, '速度藥水 II ×5 · 幸運藥水 II ×5');
  } finally { restore(); }
});

test('500,000-roll milestone grants one Heaven Potion I', () => {
  const { state, system, restore } = makeSystem(500000);
  try {
    state.achievements.roll300000 = {};
    system.checkAchievements();
    assert.equal(state.potions.inventory.angel1, 1);
    assert.equal(state.achievements.roll500000.reward, '天堂藥水 I ×1');
  } finally { restore(); }
});
