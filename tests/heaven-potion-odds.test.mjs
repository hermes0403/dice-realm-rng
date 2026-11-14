import test from 'node:test';
import assert from 'node:assert/strict';
import { D } from '../data/dice.js';
import {
  HEAVEN_MIDDLE_IDS,
  buildHeavenBaseEntries,
  heavenWeatherBonus,
  applyHeavenWeatherWeights
} from '../systems/heaven-potion-odds.js';
import { applyGlitchWeight } from '../systems/glitch-dice.js';

const byId = id => D.find(dice => dice.id === id);

test('天堂 I／II 四組基礎表固定骰子、數量及總和正確', () => {
  const cases = [
    { heaven2: false, high: false, fixed: 'd12', percent: 20, error: 0.005, count: 26 },
    { heaven2: false, high: true, fixed: 'd13', percent: 19, error: 0.005, count: 25 },
    { heaven2: true, high: false, fixed: 'd14', percent: 17, error: 0.07, count: 25 },
    { heaven2: true, high: true, fixed: 'd15', percent: 17, error: 0.07, count: 25 }
  ];
  for (const item of cases) {
    const entries = buildHeavenBaseEntries(byId, item.heaven2, item.high);
    assert.equal(entries.length, item.count);
    assert.equal(entries.find(entry => entry.dice.id === item.fixed).weight, item.percent);
    assert.equal(entries.find(entry => entry.dice.id === 'd64').weight, item.error);
    assert.ok(Math.abs(entries.reduce((sum, entry) => sum + entry.weight, 0) - 100) < 1e-10);
    assert.equal(new Set(entries.map(entry => entry.dice.id)).size, entries.length);
  }
});

test('四組中間骰子依分母遞增、權重嚴格遞減且包含奇點骰子', () => {
  assert.ok(HEAVEN_MIDDLE_IDS.includes('d20'));
  for (const [heaven2, high] of [[false, false], [false, true], [true, false], [true, true]]) {
    const fixedId = heaven2 ? (high ? 'd15' : 'd14') : (high ? 'd13' : 'd12');
    const entries = buildHeavenBaseEntries(byId, heaven2, high)
      .filter(entry => HEAVEN_MIDDLE_IDS.includes(entry.dice.id) && entry.dice.id !== fixedId);
    assert.equal(entries.length, 24 - (HEAVEN_MIDDLE_IDS.includes(fixedId) ? 1 : 0));
    for (let i = 1; i < entries.length; i++) {
      assert.ok(entries[i].dice.den > entries[i - 1].dice.den);
      assert.ok(entries[i].weight < entries[i - 1].weight);
    }
  }
});

test('天氣加成只作用於 1,000,000 至 100,000,000 的骰子', () => {
  const dice = den => ({ den });
  assert.equal(heavenWeatherBonus(dice(999999), ['hell'], false, false), 0);
  assert.equal(heavenWeatherBonus(dice(1000000), ['hell'], false, false), 4);
  assert.equal(heavenWeatherBonus(dice(100000000), ['hell'], false, false), 4);
  assert.equal(heavenWeatherBonus(dice(100000001), ['hell'], false, false), 0);
  assert.equal(heavenWeatherBonus(dice(1000000), ['glitch'], false, false), 5);
  assert.equal(heavenWeatherBonus(dice(1000000), ['hell'], false, true), 4.5);
  assert.equal(heavenWeatherBonus(dice(1000000), ['glitch'], false, true), 6);
  assert.equal(heavenWeatherBonus(dice(1000000), ['hell'], true, true), 5);
  assert.equal(heavenWeatherBonus(dice(1000000), ['glitch'], true, true), 7);
});

test('故障天氣將四顆故障骰子權重乘以 10，且不重複套用', () => {
  const entries = D.filter(dice => dice.glitchBonus).map(dice => ({ dice, weight: 2 }));
  const boosted = applyHeavenWeatherWeights(entries, ['glitch'], false, false, true);
  assert.equal(boosted.length, 4);
  for (const entry of boosted) {
    const expectedBase = 2 * (1 + heavenWeatherBonus(entry.dice, ['glitch'], false, false) / 100);
    assert.equal(entry.weight, applyGlitchWeight(entry.dice, expectedBase, true));
  }
});
