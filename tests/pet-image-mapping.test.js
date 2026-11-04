import test from 'node:test';
import assert from 'node:assert/strict';
import { PETS, PET_IMAGE_ASSETS, REMOVED_PET_IDS } from '../data/pets.js';

test('every active pet has one explicit image mapping by stable ID', () => {
  const activeIds = PETS.map(pet => pet.id);
  assert.equal(activeIds.length, 39);
  assert.equal(new Set(activeIds).size, activeIds.length);
  assert.deepEqual(Object.keys(PET_IMAGE_ASSETS).sort(), [...activeIds].sort());
  for (const pet of PETS) {
    assert.equal(typeof PET_IMAGE_ASSETS[pet.id], 'string', pet.id);
    assert.match(PET_IMAGE_ASSETS[pet.id], /^data:image\/jpeg;base64,/);
  }
});

test('retired pet IDs do not retain image mappings', () => {
  for (const id of REMOVED_PET_IDS) assert.equal(Object.hasOwn(PET_IMAGE_ASSETS, id), false, id);
});

test('every active pet has a distinct image asset', () => {
  const images = Object.values(PET_IMAGE_ASSETS);
  assert.equal(new Set(images).size, images.length);
});
