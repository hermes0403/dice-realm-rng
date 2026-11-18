import test from 'node:test';
import assert from 'node:assert/strict';
import { PETS, EVENT_PETS, PET_IMAGE_ASSETS, REMOVED_PET_IDS } from '../data/pets.js';

test('all regular and event pets have explicit stable-ID image mappings', () => {
  const regularIds = PETS.map(pet => pet.id);
  const eventIds = EVENT_PETS.map(pet => pet.id);
  const allIds = [...regularIds, ...eventIds];
  assert.equal(regularIds.length, 39);
  assert.equal(eventIds.length, 6);
  assert.equal(new Set(allIds).size, allIds.length);
  assert.deepEqual(Object.keys(PET_IMAGE_ASSETS), allIds, 'image mapping order must follow regular pets then event pets');
  for (const pet of PETS) {
    assert.equal(typeof PET_IMAGE_ASSETS[pet.id], 'string', pet.id);
    assert.ok(PET_IMAGE_ASSETS[pet.id].startsWith('data:image/jpeg;base64,'), pet.id);
  }
  for (const pet of EVENT_PETS) {
    assert.equal(typeof PET_IMAGE_ASSETS[pet.id], 'string', pet.id);
    assert.ok(PET_IMAGE_ASSETS[pet.id].endsWith('/assets/pets/events/event-pets-sprite.jpg'), pet.id);
  }
});

test('retired pet IDs do not retain image mappings', () => {
  for (const id of REMOVED_PET_IDS) assert.equal(Object.hasOwn(PET_IMAGE_ASSETS, id), false, id);
});

test('regular pet image assets are distinct and event pets use the dedicated sprite sheet', () => {
  const regularImages = PETS.map(pet => PET_IMAGE_ASSETS[pet.id]);
  assert.equal(new Set(regularImages).size, regularImages.length);
  const eventImages = EVENT_PETS.map(pet => PET_IMAGE_ASSETS[pet.id]);
  assert.equal(new Set(eventImages).size, 1);
});
