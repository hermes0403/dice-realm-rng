import test from 'node:test';
import assert from 'node:assert/strict';
import { PETS, EVENT_PETS, PET_BASE_INCOME, PET_IMAGE_ASSETS, getPetFusionPool, petById } from '../data/pets.js';
import { getPetCodexEntries } from '../systems/pets.js';

test('all six limited-event pets appear in the codex with the approved tier and income', () => {
  const expected = [
    ['晶銅獸', 'common', 15],
    ['鏡冰靈', 'common', 30],
    ['晶龍哨兵', 'rare', 100],
    ['異核雙子龍', 'legendary', 750],
    ['月光龍', 'mythic', 2500],
    ['鯊皇', 'secret', 9000]
  ];
  assert.equal(EVENT_PETS.length, 6);
  for (const [name, rarity, income] of expected) {
    const pet = EVENT_PETS.find(item => item.name === name);
    assert.ok(pet, name);
    assert.equal(pet.rarity, rarity);
    assert.equal(PET_BASE_INCOME[pet.id], income);
    assert.equal(petById(pet.id).id, pet.id);
  }
});

test('limited-event pets are listed as undiscovered and do not enter normal fusion pools', () => {
  const entries = getPetCodexEntries(PETS, []);
  for (const pet of EVENT_PETS) {
    assert.equal(entries.find(item => item.id === pet.id)?.discovered, false, pet.name);
    assert.ok(!getPetFusionPool(pet.rarity).some(item => item.id === pet.id), pet.name);
  }
});

test('limited-event pets become discovered from saved ownership or discovery records', () => {
  const target = EVENT_PETS[0];
  const entries = getPetCodexEntries(PETS, [target.id]);
  assert.equal(entries.find(item => item.id === target.id)?.discovered, true);
});


test('all limited-event pets resolve to the dedicated sprite-sheet asset', () => {
  for (const pet of EVENT_PETS) {
    assert.match(PET_IMAGE_ASSETS[pet.id], /\\/assets\\/pets\\/events\\/event-pets-sprite\\.jpg$/);
  }
});
