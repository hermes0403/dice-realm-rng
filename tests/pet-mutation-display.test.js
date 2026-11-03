import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPetMutationLabels, formatPetMutationTags } from '../systems/pets.js';

const PET_MUTATIONS = {
  rain: { name: '雨變異', multiplier: 1.2 },
  snow: { name: '雪變異', multiplier: 1.3 },
  thunder: { name: '打雷變異', multiplier: 1.4 },
  crystal: { name: '水晶變異', multiplier: 1.7 },
  hell: { name: '地獄變異', multiplier: 2 }
};

test('shows appearance and weather mutations together in stable order', () => {
  assert.equal(formatPetMutationLabels({ variant: 'rainbow', mutation: 'thunder' }, PET_MUTATIONS), '彩虹、打雷');
  assert.equal(formatPetMutationLabels({ variant: 'golden', mutation: 'rain' }, PET_MUTATIONS), '黃金、雨');
  assert.equal(formatPetMutationLabels({ variant: 'diamond', mutation: 'crystal' }, PET_MUTATIONS), '鑽石、水晶');
});

test('supports legacy arrays and removes duplicate labels', () => {
  assert.equal(
    formatPetMutationLabels({ variants: ['rainbow', 'rainbow'], mutations: ['thunder', 'thunder'] }, PET_MUTATIONS),
    '彩虹、打雷'
  );
});

test('omits the mutation row content when no valid mutation exists', () => {
  assert.equal(formatPetMutationLabels({ variant: null, mutation: null }, PET_MUTATIONS), '');
  assert.equal(formatPetMutationLabels({ variant: 'unknown', mutation: 'unknown' }, PET_MUTATIONS), '');
  assert.equal(formatPetMutationLabels(null, PET_MUTATIONS), '');
});

test('formats each pet independently without carrying labels across instances', () => {
  const rainbowThunder = { variant: 'rainbow', mutation: 'thunder' };
  const plainPet = { variant: null, mutation: null };
  assert.equal(formatPetMutationLabels(rainbowThunder, PET_MUTATIONS), '彩虹、打雷');
  assert.equal(formatPetMutationLabels(plainPet, PET_MUTATIONS), '');
});

test('assigns an independent color class to every mutation type', () => {
  const tags = formatPetMutationTags({
    variants: ['golden', 'diamond', 'rainbow'],
    mutations: ['thunder', 'crystal', 'hell', 'snow', 'rain']
  }, PET_MUTATIONS);
  assert.deepEqual(tags.map(tag => [tag.label, tag.className]), [
    ['黃金', 'pet-mutation-golden'],
    ['鑽石', 'pet-mutation-diamond'],
    ['彩虹', 'pet-mutation-rainbow'],
    ['打雷', 'pet-mutation-weather-thunder'],
    ['水晶', 'pet-mutation-weather-crystal'],
    ['地獄', 'pet-mutation-weather-hell'],
    ['雪', 'pet-mutation-weather-snow'],
    ['雨', 'pet-mutation-weather-rain']
  ]);
});

test('colored mutation tags still de-duplicate repeated appearance and weather values', () => {
  const tags = formatPetMutationTags({
    variants: ['golden', 'golden'],
    mutations: ['rain', 'rain']
  }, PET_MUTATIONS);
  assert.deepEqual(tags.map(tag => tag.className), [
    'pet-mutation-golden',
    'pet-mutation-weather-rain'
  ]);
});
