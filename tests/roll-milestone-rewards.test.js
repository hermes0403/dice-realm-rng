import test from 'node:test';
import assert from 'node:assert/strict';
import { MILESTONES } from '../systems/weekly-realm-event.js';

test('weekly 300,000-roll milestone displays Speed II and Luck II ×5', () => {
  const item = MILESTONES.find(entry => entry.target === 300000);
  assert.ok(item);
  assert.equal(item.reward, '速度藥水 II ×5 · 幸運藥水 II ×5');
});

test('weekly 500,000-roll milestone displays Heaven Potion I ×1', () => {
  const item = MILESTONES.find(entry => entry.target === 500000);
  assert.ok(item);
  assert.equal(item.reward, '天堂藥水 I ×1');
});

test('other weekly milestone targets and rewards remain unchanged', () => {
  assert.deepEqual(MILESTONES.filter(item => ![300000,500000].includes(item.target)), [
    { target: 50000, reward: '1M$' },
    { target: 150000, reward: '幸運藥水 III ×1' },
    { target: 800000, reward: '天堂藥水 II ×1 · 100M$' }
  ]);
});
