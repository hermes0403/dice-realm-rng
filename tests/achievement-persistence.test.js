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

import { createGloveUI } from '../ui/gloves.js';

for (const [gloveId, achievementId, achievementName, potionId, potionAmount] of [
  ['g5', 'craftVoid', '鑽石', 'speed1', 1],
  ['g6', 'craftUniverse', '糖果', 'speed2', 2]
]) {
  test(`buying ${achievementName} glove schedules save with achievement`, async () => {
    const state = { coins: 100, gloves: { g0: 1 }, equipped: 'g0', achievements: {}, potions: { inventory: {} } };
    let saveCalls = 0;
    const elements = new Map();
    const documentRef = {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', hidden: false, disabled: false });
        return elements.get(id);
      },
      addEventListener() {}
    };
    const item = { id: gloveId, price: 10, name: achievementName + '手套', icon: '✦', luck: 1, speed: 1 };
    const ui = createGloveUI({
      getState: () => state, D: [],
      G: [{ id: 'g0', name: '基礎手套', icon: '✦', price: 0 }, item],
      supabaseClient: {
        async rpc() {
          return { data: { ok: true, coins: 90, gloves: { g0: 1, [gloveId]: 1 }, equipped: gloveId }, error: null };
        },
        from() { return { async upsert() { return { error: null }; } }; }
      },
      getCurrentUser: () => ({ id: 'test-user' }),
      byId: () => null, glove: () => item,
      currentGlove: () => ({ name: item.name, icon: '✦', desc: '', luck: 1, speed: 1 }),
      format: String, formatWalletScientific: String,
      save() { saveCalls++; }, async flushCloudSave() {}, render() {}, toast() {},
      achievementStats: () => ({}), rewardText: () => 'Potion reward',
      grantAchievementReward(reward) {
        state.potions.inventory[reward.id] = (state.potions.inventory[reward.id] || 0) + reward.amount;
      },
      showAchievementPopup() {}, checkAchievements() {}, logCraft() {},
      KEY: 'save', userSaveKey: () => 'user-save', documentRef,
      confirmAction: () => true, openAuth() {}, totalUnique: () => 0,
      localStorageRef: { setItem() {} }
    });

    await ui.purchaseGlove(gloveId);
    assert.equal(saveCalls, 1);
    assert.equal(state.achievements[achievementId].name, achievementName);
    assert.equal(state.achievements[achievementId].rewardGiven, true);
    assert.equal(state.potions.inventory[potionId], potionAmount);
  });
}
