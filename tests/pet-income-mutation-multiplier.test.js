import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPetIncomeSystem } from '../systems/pet-income.js';
import { PET_MUTATIONS, petBaseIncome } from '../data/pets.js';
import { petWeightSkillMultiplier } from '../systems/pet-skills.js';

function createSystem() {
  return createPetIncomeSystem({
    getState: () => ({ pets: [], equippedPetUids: [] }),
    getCurrentUser: () => null,
    PET_MUTATIONS,
    petBaseIncome,
    petWeightSkillMultiplier,
    coinEarningMultiplier: () => 1,
    format: String,
    formatWalletScientific: String,
    KEY: 'test',
    refreshCoinBoosts() {},
    save() {},
    timerManager: { setInterval() { return 1; } },
    localStorageRef: { setItem() {}, getItem() { return null; } }
  });
}


test('pet weight multiplier uses every new tier and inclusive boundary', () => {
  const cases = [
    [1, 1], [99, 1],
    [100, 1.2], [200, 1.2],
    [201, 1.5], [500, 1.5],
    [501, 1.8], [1000, 1.8],
    [1001, 2], [2000, 2],
    [2001, 2.5], [5000, 2.5],
    [5001, 2.8], [10000, 2.8],
    [10001, 3], [40000, 3],
    [40001, 3.5], [100000, 3.5],
    [100001, 3.8], [500000, 3.8],
    [500001, 4], [3000000, 4],
    [3000001, 4.5], [10000000, 4.5], [1000000000, 4.5]
  ];
  for (const [weight, expected] of cases) {
    assert.equal(petWeightSkillMultiplier(weight), expected, `weight ${weight} kg`);
  }
});

test('weather mutation adds its bonus to the weight multiplier', () => {
  const system = createSystem();
  const pet = { id: 'c1', kg: 200, mutation: 'rain', variant: null };
  assert.equal(system.petIncomeMultiplier(pet), 1.2 + 1.2);
  assert.equal(system.petIncomePerSecond(pet), Math.floor(petBaseIncome(pet) * 2.4));
});

test('gold, diamond, and rainbow variants multiply after additive weight and weather bonuses', () => {
  const system = createSystem();
  const pet = { id: 'c1', kg: 200, mutation: 'rain', variant: 'golden' };
  assert.equal(system.petIncomeMultiplier(pet), (1.2 + 1.2) * 1.2);
  pet.variant = 'diamond';
  assert.equal(system.petIncomeMultiplier(pet), (1.2 + 1.2) * 1.6);
  pet.variant = 'rainbow';
  assert.equal(system.petIncomeMultiplier(pet), (1.2 + 1.2) * 2);
});

test('Hermes equipped pets use the updated weight tier for 4,419$/s income', () => {
  const system = createSystem();
  const pets = [
    { uid: 'hawk', id: 'l7', kg: 77, mutation: 'thunder', variant: null },
    { uid: 'serpent', id: 'l6', kg: 50, mutation: 'hell', variant: null },
    { uid: 'hound', id: 'l8', kg: 469, mutation: null, variant: null }
  ];
  assert.deepEqual(pets.map(pet => system.petIncomePerSecond(pet)), [1584, 1740, 1095]);
  assert.equal(pets.reduce((sum, pet) => sum + system.petIncomePerSecond(pet), 0), 4419);
});

test('雜魚的三隻已裝備神話寵物收益依照雪變異正確計算', () => {
  const system = createSystem();
  const pets = [
    { uid: 'm9', id: 'm9', kg: 50, mutation: null, variant: null },
    { uid: 'm5', id: 'm5', kg: 48, mutation: null, variant: null },
    { uid: 'm3', id: 'm3', kg: 25, mutation: 'snow', variant: null }
  ];
  assert.equal(system.petIncomePerSecond(pets[0]), 3000);
  assert.equal(system.petIncomePerSecond(pets[1]), 2200);
  assert.equal(system.petIncomePerSecond(pets[2]), 3795);
  assert.equal(pets.reduce((sum, pet) => sum + system.petIncomePerSecond(pet), 0), 8995);
});

test('signed-in pet sale UI receives the server transaction dependencies', async () => {
  const script = await readFile(new URL('../script.js', import.meta.url), 'utf8');
  assert.ok(script.includes("setupPetSellingUI({ getState: () => S, petById, petRarity, petArt, escapeHTML, PET_MUTATIONS, petIncomePerSecond, save, flushCloudSave, toast, render, renderPetsPage, coinEarningMultiplier, supabaseClient, getCurrentUser: () => currentUser });"));
});
