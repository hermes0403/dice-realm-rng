import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFusionLuckToRates } from '../systems/pets.js';

import { ETERNAL_PETS, ETERNAL_PET_WEIGHTS, ETERNAL_PET_INCOME, ETERNAL_TIER_CONFIG, ETERNAL_TIER_RATES, NEW_DICE } from '../data/eternal-update.js';

test('fusion luck +50% increases mythic and secret proportionally and preserves total', () => {
  const result = applyFusionLuckToRates({ common: 70, rare: 20, legendary: 8.9, mythic: 1, secret: 0.1 }, 50);
  assert.equal(result.rates.mythic, 1.5);
  assert.ok(Math.abs(result.rates.secret - 0.15) < 1e-12);
  assert.equal(result.donorKey, 'common');
  assert.ok(Math.abs(result.rates.common - 69.45) < 1e-12);
  assert.ok(Math.abs(Object.values(result.rates).reduce((a,b)=>a+b,0)-100)<1e-10);
});

test('fusion luck +100% doubles target rarities and deducts 1.1 percentage points', () => {
  const result = applyFusionLuckToRates({ common: 70, rare: 20, legendary: 8.9, mythic: 1, secret: 0.1 }, 100);
  assert.equal(result.rates.mythic, 2);
  assert.equal(result.rates.secret, 0.2);
  assert.ok(Math.abs(result.deductedPercent - 1.1) < 1e-12);
  assert.ok(Math.abs(Object.values(result.rates).reduce((a,b)=>a+b,0)-100)<1e-10);
});

test('fusion luck never creates negative rarity probabilities', () => {
  const result = applyFusionLuckToRates({ common: 0.01, rare: 0.02, legendary: 0.03, mythic: 50, secret: 49.94 }, 500);
  assert.ok(Object.values(result.rates).every(value => value >= 0));
  assert.ok(result.appliedPercent < 500);
  assert.ok(Math.abs(Object.values(result.rates).reduce((a,b)=>a+b,0)-100)<1e-10);
});

test('zero fusion luck leaves base probabilities unchanged', () => {
  const base = { common: 60, rare: 25, legendary: 13, mythic: 1.5, secret: 0.5 };
  assert.deepEqual(applyFusionLuckToRates(base, 0).rates, base);
});


test('永恆階級九個分母區間連續且各組品質機率總和為 100%', () => {
  const tiers = Object.keys(ETERNAL_TIER_CONFIG).map(Number).sort((a,b)=>a-b);
  assert.equal(tiers.length, 9);
  for (let i = 0; i < tiers.length; i++) {
    const range = ETERNAL_TIER_CONFIG[tiers[i]];
    const rates = ETERNAL_TIER_RATES[tiers[i]];
    assert.equal(Object.values(rates).reduce((sum,value)=>sum+value,0), 100);
    assert.equal(rates.eternal, [0,0,0,1,6,18,65,95,100][i]);
    if (i < tiers.length - 1) {
      assert.equal(range.max_den + 1, ETERNAL_TIER_CONFIG[tiers[i+1]].min_den);
    } else {
      assert.equal(range.min_den, 120000000);
      assert.equal(range.max_den, null);
    }
  }
});

test('永恆寵物兩隻的融合比率、技能與每秒收益符合設定', () => {
  assert.equal(ETERNAL_PETS.length, 2);
  assert.deepEqual(ETERNAL_PET_WEIGHTS, [60, 40]);
  assert.deepEqual(ETERNAL_PET_INCOME, { eternal_dawn_guardian: 18000, eternal_starwish_deer: 22000 });
  assert.match(ETERNAL_PETS[0].skill, /運氣 \+35%.*速度 \+35%/);
  assert.match(ETERNAL_PETS[1].skill, /24 小時.*天堂藥水 I（40%）.*幸運藥水 III（60%）/);
});

test('五顆新骰子分母與 ID 不重複', () => {
  assert.deepEqual(NEW_DICE.map(dice => dice.den), [24888888,8050000,110050000,8255000,974000]);
  assert.equal(new Set(NEW_DICE.map(dice => dice.id)).size, 5);
});
