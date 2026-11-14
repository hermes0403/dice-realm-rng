import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgressionSystem, isAchievementCompleteForDisplay } from '../systems/progression.js';

test('weather collection 4/5 displays incomplete even when its saved unlock record exists', () => {
  assert.equal(isAchievementCompleteForDisplay('rainCollect2', '已獲得 4/5 種雨天骰子', true), false);
  assert.equal(isAchievementCompleteForDisplay('thunderCollect2', '已獲得 4/5 種打雷骰子', true), false);
  assert.equal(isAchievementCompleteForDisplay('hellCollect2', '已獲得 4/5 種地獄骰子', true), false);
});

test('weather collection 5/5 displays complete', () => {
  for (const id of ['rainCollect2', 'snowCollect2', 'thunderCollect2', 'crystalCollect2', 'hellCollect2']) {
    assert.equal(isAchievementCompleteForDisplay(id, '已獲得 5/5 種天氣骰子', false), true);
  }
});

test('non-weather achievements continue to use their saved completion record', () => {
  assert.equal(isAchievementCompleteForDisplay('collect28', '發現 4/28 種骰子', true), true);
  assert.equal(isAchievementCompleteForDisplay('daily5', '累計完成 4/5 次每日任務', false), false);
});

test('an existing weather achievement record prevents duplicate reward grants', () => {
  const savedRecord = { name: '雨中收藏家', reward: '500$', rewardGiven: true, unlockedAt: '2026-11-01T00:00:00.000Z' };
  const state = {
    rolls: 0,
    first: { rain1: true, rain2: true, rain3: true, rain4: true },
    bag: {},
    achievements: { rainCollect2: savedRecord },
    dailyQuestCompletions: 0,
    coins: 100,
    potions: { inventory: {} }
  };
  const dice = Array.from({ length: 5 }, (_, i) => ({ id: `rain${i + 1}`, weather: 'rain' }));
  const progression = createProgressionSystem({
    getState: () => state,
    D: dice,
    DAILY_TASKS: [],
    POTIONS: [],
    format: String,
    compactNum: String,
    totalUnique: () => 0,
    coinEarningMultiplier: () => 1,
    fresh: () => ({ potions: { inventory: {} } }),
    save() {},
    toast() {},
    timerManager: { clearTimeout() {}, setTimeout() { return 1; } }
  });

  progression.checkAchievements();
  assert.equal(state.coins, 100);
  assert.deepEqual(state.achievements.rainCollect2, savedRecord);
});
