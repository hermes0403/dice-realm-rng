import test from 'node:test';
import assert from 'node:assert/strict';
import { getPetSellMutationTags, sortPetSellItems } from '../ui/pet-selling.js';

const definitions = {
  p1: { id: 'p1', name: '小獸', rarity: 'common' },
  p2: { id: 'p2', name: '巨獸', rarity: 'legendary' },
  p3: { id: 'p3', name: '神獸', rarity: 'secret' }
};
const petById = id => definitions[id] || null;

test('pet sale list sorts rarity in both directions and income in both directions', () => {
  const pets = [
    { uid: 'a', id: 'p2', kg: 2 },
    { uid: 'b', id: 'p1', kg: 1 },
    { uid: 'c', id: 'p3', kg: 3 }
  ];
  const income = item => ({ a: 100, b: 5, c: 500 }[item.uid]);
  assert.deepEqual(sortPetSellItems(pets, { mode: 'rarity-asc', petById, petIncomePerSecond: income }).map(p => p.uid), ['b', 'a', 'c']);
  assert.deepEqual(sortPetSellItems(pets, { mode: 'rarity-desc', petById, petIncomePerSecond: income }).map(p => p.uid), ['c', 'a', 'b']);
  assert.deepEqual(sortPetSellItems(pets, { mode: 'income-desc', petById, petIncomePerSecond: income }).map(p => p.uid), ['c', 'a', 'b']);
  assert.deepEqual(sortPetSellItems(pets, { mode: 'income-asc', petById, petIncomePerSecond: income }).map(p => p.uid), ['b', 'a', 'c']);
  assert.deepEqual(pets.map(p => p.uid), ['a', 'b', 'c'], 'sorting must not mutate the owned-pet array');
});

test('pet sale mutation labels include appearance and weather mutations without duplicates', () => {
  const tags = getPetSellMutationTags({
    variant: 'rainbow',
    variants: ['rainbow', 'diamond'],
    mutation: 'thunder',
    mutations: ['thunder', 'crystal']
  }, {
    thunder: { name: '打雷變異' },
    crystal: { name: '水晶變異' }
  });
  assert.deepEqual(tags.map(tag => tag.label), ['彩虹', '鑽石', '打雷', '水晶']);
  assert.deepEqual(tags.map(tag => tag.className), [
    'pet-mutation-rainbow',
    'pet-mutation-diamond',
    'pet-mutation-weather-thunder',
    'pet-mutation-weather-crystal'
  ]);
  assert.deepEqual(getPetSellMutationTags({ uid: 'plain' }, {}), []);
});
