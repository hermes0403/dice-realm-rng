import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameStateService } from '../core/game-state.js';

test('load preserves diamond and candy glove achievements', () => {
  const achievements = {
    craftVoid: { name: '鑽石', rewardGiven: true },
    craftUniverse: { name: '糖果', rewardGiven: true }
  };
  const saved = { bag: {}, gloves: { g0: 1, g5: 1, g6: 1 }, equipped: 'g5', achievements };
  const service = createGameStateService({
    KEY: 'save', D: [], G: [{ id: 'g0' }, { id: 'g5' }, { id: 'g6' }],
    POTIONS: [], ensurePetData() {}, getCurrentUser: () => null, getState: () => saved,
    localStorageRef: { getItem: () => JSON.stringify(saved), setItem() {} }
  });
  const loaded = service.load();
  assert.deepEqual(loaded.achievements, achievements);
});
