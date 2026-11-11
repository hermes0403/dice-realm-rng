import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFusionLuckToRates } from '../systems/pets.js';

test('fusion luck multiplies mythic and secret rates and deducts the increase from the highest other rarity', () => {
  const base = { common: 70, rare: 20, legendary: 8.9, mythic: 1, secret: 0.1 };
  const result = applyFusionLuckToRates(base, 50);
  assert.equal(result.rates.mythic, 1.5);
  assert.ok(Math.abs(result.rates.secret - 0.15) < 1e-12);
  assert.equal(result.donorKey, 'common');
  assert.equal(result.rates.common, 69.45);
  assert.ok(Math.abs(Object.values(result.rates).reduce((sum, value) => sum + value, 0) - 100) < 1e-10);
});

test('100% fusion luck doubles mythic and secret odds and deducts 1.1 percentage points', () => {
  const base = { common: 70, rare: 20, legendary: 8.9, mythic: 1, secret: 0.1 };
  const result = applyFusionLuckToRates(base, 100);
  assert.equal(result.rates.mythic, 2);
  assert.equal(result.rates.secret, 0.2);
  assert.equal(result.donorKey, 'common');
  assert.equal(result.rates.common, 68.9);
  assert.ok(Math.abs(result.deductedPercent - 1.1) < 1e-12);
  assert.ok(Math.abs(Object.values(result.rates).reduce((sum, value) => sum + value, 0) - 100) < 1e-10);
});

test('fusion luck never makes a donor rarity negative when the requested increase exceeds its rate', () => {
  const base = { common: 0.01, rare: 0.02, legendary: 0.03, mythic: 50, secret: 49.94 };
  const result = applyFusionLuckToRates(base, 500);
  assert.equal(result.donorKey, 'legendary');
  assert.equal(result.rates.legendary, 0);
  assert.ok(result.appliedPercent < 500);
  assert.ok(Object.values(result.rates).every(value => value >= 0));
  assert.ok(Math.abs(Object.values(result.rates).reduce((sum, value) => sum + value, 0) - 100) < 1e-10);
});

test('zero fusion luck leaves all original rarity rates unchanged', () => {
  const base = { common: 60, rare: 25, legendary: 13, mythic: 1.5, secret: 0.5 };
  assert.deepEqual(applyFusionLuckToRates(base, 0).rates, base);
});
