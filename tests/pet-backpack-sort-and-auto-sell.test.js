import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAutoSellDice } from '../ui/inventory.js';
import { sortOwnedPets } from '../systems/pets.js';
import { lockedDiceIndexes, unlockedDiceCount, consumeUnlockedDice } from '../systems/dice-locks.js';

test('auto-sell options contain only the configured 18 ordinary dice and discard all other saved IDs', () => {
  const dice = [
    { id: 'd2', den: 4 },
    { id: 'd33', den: 2560 },
    { id: 'd10', den: 1024 },
    { id: 'd37', den: 500, weather: 'rain' },
    { id: 'd34', den: 20500 }
  ];
  const result = filterAutoSellDice(dice, ['d2', 'd33', 'd34', 'd37']);
  assert.deepEqual(result.dice.map(item => item.id), ['d2', 'd10']);
  assert.deepEqual(result.selectedIds, ['d2']);
});

test('auto-sell options are ordered common-to-rare and exclude weather and higher-tier dice', () => {
  const dice = [
    { id: 'rare', den: 1000 },
    { id: 'weather-rare', den: 5000, weather: 'rain' },
    { id: 'common', den: 2, name: '初始骰子' },
    { id: 'weather-common', den: 5, weather: 'rain' },
    { id: 'd17', den: 131072 }
  ];
  assert.deepEqual(filterAutoSellDice(dice).dice.map(item => item.id), ['common']);
});

test('pet backpack supports income and rarity sorting in both directions without mutating ownership', () => {
  const definitions = {
    c: { id: 'c', name: '普通獸', rarity: 'common' },
    l: { id: 'l', name: '傳奇獸', rarity: 'legendary' },
    s: { id: 's', name: '秘密獸', rarity: 'secret' }
  };
  const pets = [
    { uid: 'legendary', id: 'l', kg: 2 },
    { uid: 'common', id: 'c', kg: 1 },
    { uid: 'secret', id: 's', kg: 3 }
  ];
  const income = pet => ({ common: 5, legendary: 100, secret: 500 }[pet.uid]);
  const options = { petById: id => definitions[id], petIncomePerSecond: income, rarityOrder: ['common', 'rare', 'legendary', 'mythic', 'secret'] };
  assert.deepEqual(sortOwnedPets(pets, { ...options, mode: 'income-asc' }).map(p => p.uid), ['common', 'legendary', 'secret']);
  assert.deepEqual(sortOwnedPets(pets, { ...options, mode: 'income-desc' }).map(p => p.uid), ['secret', 'legendary', 'common']);
  assert.deepEqual(sortOwnedPets(pets, { ...options, mode: 'rarity-asc' }).map(p => p.uid), ['common', 'legendary', 'secret']);
  assert.deepEqual(sortOwnedPets(pets, { ...options, mode: 'rarity-desc' }).map(p => p.uid), ['secret', 'legendary', 'common']);
  assert.deepEqual(pets.map(p => p.uid), ['legendary', 'common', 'secret']);
});


test('locked dice are excluded from available sale and fusion counts', () => {
  const state = { bag: { d1: 3 }, lockedDice: ['d1:1'] };
  assert.deepEqual([...lockedDiceIndexes(state, 'd1')], [1]);
  assert.equal(unlockedDiceCount(state, 'd1'), 2);
  assert.equal(consumeUnlockedDice(state, 'd1', 2), true);
  assert.equal(state.bag.d1, 1);
  assert.deepEqual(state.lockedDice, ['d1:0']);
  assert.equal(unlockedDiceCount(state, 'd1'), 0);
  assert.equal(consumeUnlockedDice(state, 'd1', 1), false);
  assert.equal(state.bag.d1, 1);
});

test('consuming an unlocked dice keeps later locked dice attached to their instance', () => {
  const state = { bag: { d2: 4 }, lockedDice: ['d2:3'] };
  assert.equal(consumeUnlockedDice(state, 'd2', 1), true);
  assert.equal(state.bag.d2, 3);
  assert.deepEqual(state.lockedDice, ['d2:2']);
  assert.equal(unlockedDiceCount(state, 'd2'), 2);
});
