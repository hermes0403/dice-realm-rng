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


test('四顆故障骰子在普通池及四張天堂表中都有正權重，可被抽中', () => {
  const glitchIds = ['d64', 'd65', 'd66', 'd67'];
  const ordinaryPool = D.filter(dice => !dice.weather);
  for (const id of glitchIds) {
    const dice = ordinaryPool.find(item => item.id === id);
    assert.ok(dice, `ordinary pool missing ${id}`);
    assert.ok(applyGlitchWeight(dice, 1 / dice.den, false) > 0);
  }
  for (const [heaven2, high] of [[false, false], [false, true], [true, false], [true, true]]) {
    const entries = buildHeavenBaseEntries(byId, heaven2, high);
    for (const id of glitchIds) {
      const entry = entries.find(item => item.dice.id === id);
      assert.ok(entry, `heaven table missing ${id}`);
      assert.ok(entry.weight > 0, `heaven table has no weight for ${id}`);
      const weatherEntry = applyHeavenWeatherWeights([entry], ['glitch'], heaven2, !heaven2, true)[0];
      assert.ok(weatherEntry.weight > 0, `glitch weather made ${id} unreachable`);
    }
  }
});

test('普通擲骰的地獄與故障同時存在時採加法 9% 權重，顯示分母與抽選一致', () => {
  const dice = byId('d30');
  assert.equal(heavenWeatherBonus(dice, ['hell', 'glitch'], false, false), 9);
  assert.equal(Math.floor(dice.den / (1 + heavenWeatherBonus(dice, ['hell', 'glitch'], false, false) / 100)), Math.floor(dice.den / 1.09));
});


test('四組機率表套用最大天氣與故障倍率後仍無負值或超過 100% 的單項', () => {
  for (const [heaven2, high] of [[false, false], [false, true], [true, false], [true, true]]) {
    const entries = buildHeavenBaseEntries(byId, heaven2, high);
    for (const weatherTypes of [['hell'], ['glitch'], ['hell', 'glitch']]) {
      const boosted = applyHeavenWeatherWeights(entries, weatherTypes, heaven2, true, weatherTypes.includes('glitch'));
      assert.ok(boosted.every(entry => Number.isFinite(entry.weight) && entry.weight >= 0 && entry.weight <= 100));
      assert.ok(boosted.reduce((sum, entry) => sum + entry.weight, 0) > 0);
    }
  }
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


test('天堂 I 創世骰子與天堂 II 終焉骰子的四組基礎機率均錨定 1.5%', () => {
  const cases = [
    { heaven2: false, high: false, target: 'd21' },
    { heaven2: false, high: true, target: 'd21' },
    { heaven2: true, high: false, target: 'd23' },
    { heaven2: true, high: true, target: 'd23' }
  ];
  for (const item of cases) {
    const entries = buildHeavenBaseEntries(byId, item.heaven2, item.high);
    const target = entries.find(entry => entry.dice.id === item.target);
    assert.ok(target, `missing target ${item.target}`);
    assert.ok(Math.abs(target.weight - 1.5) < 1e-9, `unexpected ${item.target} weight: ${target.weight}`);
    assert.ok(Math.abs(entries.reduce((sum, entry) => sum + entry.weight, 0) - 100) < 1e-10);
  }
});

test('四組基礎表的中間骰子均依既定稀有度順序嚴格遞減', () => {
  for (const [heaven2, high] of [[false, false], [false, true], [true, false], [true, true]]) {
    const fixedId = heaven2 ? (high ? 'd15' : 'd14') : (high ? 'd13' : 'd12');
    const middle = buildHeavenBaseEntries(byId, heaven2, high)
      .filter(entry => HEAVEN_MIDDLE_IDS.includes(entry.dice.id) && entry.dice.id !== fixedId);
    for (let index = 1; index < middle.length; index++) {
      assert.ok(middle[index].weight < middle[index - 1].weight);
    }
  }
});

test('地獄與故障天氣仍加權提升符合條件的目標骰子', () => {
  for (const [heaven2, high, targetId] of [
    [false, false, 'd21'], [false, true, 'd21'],
    [true, false, 'd23'], [true, true, 'd23']
  ]) {
    const entries = buildHeavenBaseEntries(byId, heaven2, high);
    const baseTarget = entries.find(entry => entry.dice.id === targetId).weight;
    for (const weatherTypes of [['hell'], ['glitch'], ['hell', 'glitch']]) {
      const boosted = applyHeavenWeatherWeights(entries, weatherTypes, heaven2, true, weatherTypes.includes('glitch'));
      const total = boosted.reduce((sum, entry) => sum + entry.weight, 0);
      const actualPercent = boosted.find(entry => entry.dice.id === targetId).weight / total * 100;
      assert.ok(actualPercent > baseTarget, `${targetId} did not gain odds in ${weatherTypes.join('+')}`);
    }
  }
});
