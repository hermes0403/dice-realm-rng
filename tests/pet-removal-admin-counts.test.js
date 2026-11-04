import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PETS, UNOBTAINABLE_PET_IDS, PET_INDIVIDUAL_ODDS,
  getPetFusionPool, getPetFusionWeights, randomPet
} from '../data/pets.js';
import { aggregatePetInventoryCounts } from '../admin/monitoring.js';

test('four retired pets remain defined for old saves but are excluded from fusion pools', () => {
  const names = ['冰原兔', '藍晶甲蟲', '日蝕金狼', '星焰鳳皇'];
  const retired = PETS.filter(pet => UNOBTAINABLE_PET_IDS.includes(pet.id));
  assert.deepEqual(retired.map(pet => pet.name), names);
  assert.ok(retired.every(pet => pet.unobtainable === true));
  for (const rarity of ['common', 'rare', 'legendary', 'mythic']) {
    assert.ok(getPetFusionPool(rarity).every(pet => !UNOBTAINABLE_PET_IDS.includes(pet.id)));
  }
});

test('remaining pet weights keep their original relative values and normalize over the remaining pool', () => {
  const expected = {
    common: [15, 15, 15, 14, 12, 11, 9, 5],
    rare: [15, 15, 14, 12, 10, 9, 7, 5],
    legendary: [15, 14, 13, 12, 10, 9, 7, 5],
    mythic: [15, 14, 13, 12, 10, 9, 7, 5],
    secret: [25, 22, 18, 15, 12, 8]
  };
  for (const [rarity, weights] of Object.entries(expected)) {
    assert.deepEqual(getPetFusionWeights(rarity), weights);
    assert.equal(getPetFusionPool(rarity).length, weights.length);
    assert.ok(PET_INDIVIDUAL_ODDS[rarity].reduce((sum, weight) => sum + weight, 0) > 0);
  }
});

test('random fusion never returns a retired pet', () => {
  const originalRandom = Math.random;
  try {
    for (let i = 0; i < 100; i++) {
      Math.random = () => i / 100;
      for (const rarity of ['common', 'rare', 'legendary', 'mythic']) {
        assert.ok(!UNOBTAINABLE_PET_IDS.includes(randomPet(rarity).id));
      }
    }
  } finally {
    Math.random = originalRandom;
  }
});

test('admin aggregation counts pet instances and unique holders without exposing player IDs', () => {
  const stats = aggregatePetInventoryCounts([
    { user_id: 'player-a', save_data: { pets: [{ id: 'c1' }, { id: 'c1' }, { id: 'm2' }] } },
    { user_id: 'player-b', save_data: { pets: [{ id: 'c1' }, { id: 'unknown-pet' }] } },
    { user_id: 'player-c', save_data: { pets: [] } }
  ], PETS);
  const byId = new Map(stats.counts.map(row => [row.petId, row]));
  assert.equal(stats.totalPets, 4);
  assert.equal(stats.playersWithPets, 2);
  assert.equal(stats.speciesWithOwners, 3);
  assert.equal(byId.get('c1').count, 3);
  assert.equal(byId.get('c1').playerCount, 2);
  assert.equal(byId.get('m2').count, 1);
  assert.equal(byId.get('m2').playerCount, 1);
  assert.equal(byId.get('s1').count, 0);
  assert.equal(byId.get('unknown-pet').count, 1);
  assert.ok(stats.counts.every(row => !('user_id' in row) && !('username' in row)));
});
