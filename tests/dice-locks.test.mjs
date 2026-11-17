import test from 'node:test';
import assert from 'node:assert/strict';
import { addDiceToBag, consumeUnlockedDice, lockedDiceIndexes, normalizeLockedDice, unlockedDiceCount } from '../systems/dice-locks.js';

test('load-time lock normalization removes stale and malformed indexes but preserves valid stars', () => {
  const state = {
    bag: { ice: 1, rain: 2 },
    lockedDice: ['ice:0', 'ice:4', 'rain:1', 'rain:-1', 'rain:nope', 'missing:0', 'rain:1', null]
  };
  assert.deepEqual(normalizeLockedDice(state).sort(), ['ice:0', 'rain:1']);
  assert.equal(unlockedDiceCount(state, 'ice'), 0);
  assert.equal(unlockedDiceCount(state, 'rain'), 1);
});

test('adding a new copy cannot reactivate an out-of-range stale lock', () => {
  const state = { bag: { ice: 1 }, lockedDice: ['ice:1'] };
  assert.equal(addDiceToBag(state, 'ice'), true);
  assert.equal(state.bag.ice, 2);
  assert.deepEqual(state.lockedDice, []);
  assert.deepEqual([...lockedDiceIndexes(state, 'ice')], []);
  assert.equal(unlockedDiceCount(state, 'ice'), 2);
});

test('consuming unlocked dice compacts later lock indexes without unlocking the protected copy', () => {
  const state = { bag: { ice: 3 }, lockedDice: ['ice:2'] };
  assert.equal(consumeUnlockedDice(state, 'ice', 1), true);
  assert.equal(state.bag.ice, 2);
  assert.deepEqual(state.lockedDice, ['ice:1']);
  assert.equal(unlockedDiceCount(state, 'ice'), 1);
});

test('adding a different dice type does not remove valid locks', () => {
  const state = { bag: { ice: 2 }, lockedDice: ['ice:1', 'old:3'] };
  addDiceToBag(state, 'crystal', 1);
  assert.deepEqual(state.lockedDice, ['ice:1']);
  assert.equal(unlockedDiceCount(state, 'ice'), 1);
});
