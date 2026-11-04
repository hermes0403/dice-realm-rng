import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PETS, REMOVED_PET_IDS, UNOBTAINABLE_PET_IDS, PET_INDIVIDUAL_ODDS,
  getPetFusionPool, getPetFusionWeights, randomPet
} from '../data/pets.js';
import { aggregatePetInventoryCounts } from '../admin/monitoring.js';
import { getPetCodexEntries } from '../systems/pets.js';
import { formatPlayerJoinTime } from '../admin/player-management.js';

test('four retired pets are removed from the canonical pet definitions', () => {
  assert.deepEqual(REMOVED_PET_IDS, ['c9', 'r4', 'l1', 'm2']);
  assert.deepEqual(UNOBTAINABLE_PET_IDS, []);
  assert.ok(PETS.every(pet => !REMOVED_PET_IDS.includes(pet.id)));
  assert.ok(!PETS.some(pet => ['冰原兔', '藍晶甲蟲', '日蝕金狼', '星焰鳳皇'].includes(pet.name)));
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
        assert.ok(!REMOVED_PET_IDS.includes(randomPet(rarity).id));
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
  assert.equal(stats.totalPets, 5);
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

test('admin page contains the requested pet sort labels and global inventory panel', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const labels = [
    '<option value="rarity-asc">依稀有度遞增</option>',
    '<option value="rarity-desc">依稀有度遞減</option>',
    '<option value="income-asc">依每秒金錢遞增</option>',
    '<option value="income-desc">依每秒金錢遞減</option>'
  ];
  let previousIndex = -1;
  for (const label of labels) {
    const index = html.indexOf(label);
    assert.ok(index > previousIndex, 'sort labels should appear in the requested order');
    previousIndex = index;
  }
  assert.ok(html.includes('id="adminPetInventoryCountsFold"'));
  assert.ok(html.includes('id="adminPetInventoryCountsList"'));
});


test('retired pets are excluded from codex for everyone, including previous owners', () => {
  const entries = getPetCodexEntries(PETS, ['c9', 'r4', 'l1', 'm2', 'c1']);
  assert.ok(entries.every(pet => !UNOBTAINABLE_PET_IDS.includes(pet.id)));
  assert.equal(entries.length, PETS.length);
  assert.equal(entries.find(pet => pet.id === 'c1').discovered, true);
  assert.ok(!entries.some(pet => pet.discovered && REMOVED_PET_IDS.includes(pet.id)));
});

test('join time uses Auth created_at and renders in Taiwan time', () => {
  assert.equal(formatPlayerJoinTime('2026-10-23T14:00:36.222Z'), '2026/10/23 22:00:36');
  assert.equal(formatPlayerJoinTime(null), '後端未提供加入時間');
  assert.equal(formatPlayerJoinTime('invalid'), '加入時間資料無效');
});
