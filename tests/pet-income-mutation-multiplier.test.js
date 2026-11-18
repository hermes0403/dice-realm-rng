import test from 'node:test';
import assert from 'node:assert/strict';
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

test('weather mutation multiplies weight income bonus instead of adding to it', () => {
  const system = createSystem();
  const pet = { id: 'c1', kg: 200, mutation: 'rain', variant: null };
  assert.equal(system.petIncomeMultiplier(pet), 1.2 * 1.2);
  assert.equal(system.petIncomePerSecond(pet), Math.floor(petBaseIncome(pet) * 1.44));
});

test('gold, diamond, and rainbow variants multiply after weight and weather mutation', () => {
  const system = createSystem();
  const pet = { id: 'c1', kg: 200, mutation: 'rain', variant: 'golden' };
  assert.equal(system.petIncomeMultiplier(pet), 1.2 * 1.2 * 1.2);
  pet.variant = 'diamond';
  assert.equal(system.petIncomeMultiplier(pet), 1.2 * 1.2 * 1.6);
  pet.variant = 'rainbow';
  assert.equal(system.petIncomeMultiplier(pet), 1.2 * 1.2 * 2);
});
