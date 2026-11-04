import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAutoSellDice } from '../ui/inventory.js';
import { sortOwnedPets } from '../systems/pets.js';

test('auto-sell options exclude Halloween dice and discard legacy selected IDs', () => {
  const dice = [
    { id: 'd2', den: 4 },
    { id: 'd33', den: 2560 },
    { id: 'd10', den: 1024 },
    { id: 'd37', den: 500, weather: 'rain' },
    { id: 'd34', den: 20500 }
  ];
  const result = filterAutoSellDice(dice, ['d2', 'd33', 'd34']);
  assert.deepEqual(result.dice.map(item => item.id), ['d2', 'd10', 'd37']);
  assert.deepEqual(result.selectedIds, ['d2']);
});

test('auto-sell options are ordered common-to-rare within normal and weather groups', () => {
  const dice = [
    { id: 'rare', den: 1000 },
    { id: 'weather-rare', den: 5000, weather: 'rain' },
    { id: 'common', den: 2 },
    { id: 'weather-common', den: 5, weather: 'rain' }
  ];
  assert.deepEqual(filterAutoSellDice(dice).dice.map(item => item.id), [
    'common', 'rare', 'weather-common', 'weather-rare'
  ]);
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
