import test from 'node:test';
import assert from 'node:assert/strict';
import { setupAdminPetOddsUI } from '../admin/pet-odds.js';

test('legacy database tiers cannot overwrite Eternal fusion tiers 10-18', async () => {
  globalThis.document = { getElementById: () => null };
  const config = {
    9: { min_den: 550001, max_den: 1100000 },
    10: { min_den: 1100001, max_den: 5000001 },
    11: { min_den: 5000002, max_den: 10000000 },
    12: { min_den: 10000001, max_den: 25000000 },
    13: { min_den: 25000001, max_den: 40000000 },
    14: { min_den: 40000001, max_den: 60000000 },
    15: { min_den: 60000001, max_den: 80000000 },
    16: { min_den: 80000001, max_den: 100000000 },
    17: { min_den: 100000001, max_den: 119999999 },
    18: { min_den: 120000000, max_den: null }
  };
  const rates = Object.fromEntries(Object.keys(config).map(key => [key, {
    common: 0, rare: 0, legendary: 0, mythic: 0, secret: 0, eternal: 0
  }]));
  rates[10] = { common: 0, rare: 0, legendary: 73, mythic: 25, secret: 2, eternal: 0 };
  rates[11] = { common: 0, rare: 0, legendary: 70, mythic: 27, secret: 3, eternal: 0 };
  rates[13] = { common: 0, rare: 0, legendary: 60, mythic: 23, secret: 16, eternal: 1 };

  const legacyRows = [
    { tier: 10, min_den: 1100001, max_den: 10000000, rates: { legendary: 73, mythic: 25, secret: 2 } },
    { tier: 11, min_den: 10000001, max_den: 45000000, rates: { legendary: 60, mythic: 23, secret: 17 } },
    { tier: 12, min_den: 45000001, max_den: 64999999, rates: { mythic: 60, secret: 40 } },
    { tier: 13, min_den: 65000000, max_den: null, rates: { secret: 100 } }
  ];
  const supabaseClient = {
    from: () => ({
      select: () => ({
        order: async () => ({ data: legacyRows, error: null })
      })
    })
  };

  const ui = setupAdminPetOddsUI({
    PET_TIER_RATES: rates,
    PET_TIER_CONFIG: config,
    PET_RARITIES: [
      { id: 'common', name: '普通' }, { id: 'rare', name: '稀有' },
      { id: 'legendary', name: '傳奇' }, { id: 'mythic', name: '神話' },
      { id: 'secret', name: '秘密' }, { id: 'eternal', name: '永恆' }
    ],
    supabaseClient,
    isAdmin: () => false,
    toast: () => {},
    loadAdminPetFusionLogs: () => {},
    renderPetChance: () => {},
    dicePairTier: () => 10,
    byId: () => null,
    escapeHTML: value => String(value)
  });

  await ui.loadPetFusionOdds();
  assert.deepEqual(config[11], { min_den: 5000002, max_den: 10000000 });
  assert.deepEqual(rates[11], { common: 0, rare: 0, legendary: 70, mythic: 27, secret: 3, eternal: 0 });
  assert.deepEqual(config[13], { min_den: 25000001, max_den: 40000000 });
  assert.deepEqual(rates[13], { common: 0, rare: 0, legendary: 60, mythic: 23, secret: 16, eternal: 1 });
  assert.equal(config[18].min_den, 120000000);
});
