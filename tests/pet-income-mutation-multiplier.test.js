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

test('Hermes equipped pets retain the established 4,346$/s income', () => {
  const system = createSystem();
  const pets = [
    { uid: 'hawk', id: 'l7', kg: 77, mutation: 'thunder', variant: null },
    { uid: 'serpent', id: 'l6', kg: 50, mutation: 'hell', variant: null },
    { uid: 'hound', id: 'l8', kg: 469, mutation: null, variant: null }
  ];
  assert.deepEqual(pets.map(pet => system.petIncomePerSecond(pet)), [1584, 1740, 1021]);
  assert.equal(pets.reduce((sum, pet) => sum + system.petIncomePerSecond(pet), 0), 4345);
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
  assert.ok(script.includes("setupPetSellingUI({ getState: () => S, petById, petRarity, petArt, escapeHTML, PET_MUTATIONS, petIncomePerSecond, save, toast, render, renderPetsPage, coinEarningMultiplier, supabaseClient, getCurrentUser: () => currentUser });"));
});
