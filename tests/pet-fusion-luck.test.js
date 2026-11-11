import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFusionLuckToRates } from '../systems/pets.js';

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
