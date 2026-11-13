import test from 'node:test';
import assert from 'node:assert/strict';
import { D } from '../data/dice.js';
import { WEATHER_TYPES } from '../config.js';

const expected = [
  ['d64', '錯誤代碼', 100000000, 100000],
  ['d65', '異常殘響', 7777777, 250000],
  ['d66', '系統崩解', 25000000, 500000],
  ['d67', '虛空漏洞', 800000, 1000000]
];

test('四顆故障骰子列入一般圖鑑並使用固定里程碑解鎖', () => {
  for (const [id, name, den, unlockRolls] of expected) {
    const dice = D.find(item => item.id === id);
    assert.ok(dice, id + ' exists');
    assert.equal(dice.name, name);
    assert.equal(dice.den, den);
    assert.equal(dice.specialWeather, 'glitch');
    assert.equal(dice.weather, undefined);
    assert.equal(dice.unlockRolls, unlockRolls);
  }
});

test('故障天氣獨立顯示，四顆骰子採固定解鎖', () => {
  assert.equal(WEATHER_TYPES.glitch.label, '故障天氣');
  assert.ok(expected.every(([id]) => Number(D.find(item => item.id === id).unlockRolls) > 0));
});
