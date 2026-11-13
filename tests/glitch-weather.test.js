import test from 'node:test';
import assert from 'node:assert/strict';
import { D } from '../data/dice.js';
import { WEATHER_TYPES } from '../config.js';

const expected = [
  ['d64', '錯誤代碼', 100000000],
  ['d65', '異常殘響', 7777777],
  ['d66', '系統崩解', 25000000],
  ['d67', '虛空漏洞', 800000]
];

test('四顆故障骰子以正確基礎機率加入一般圖鑑', () => {
  for (const [id, name, den] of expected) {
    const dice = D.find(item => item.id === id);
    assert.ok(dice, id + ' exists');
    assert.equal(dice.name, name);
    assert.equal(dice.den, den);
    assert.equal(dice.specialWeather, 'glitch');
    assert.equal(dice.weather, undefined);
  }
});

test('故障天氣登記為獨立特殊天氣，四顆骰子的有效分母為基礎值十分之一', () => {
  assert.equal(WEATHER_TYPES.glitch.label, '故障天氣');
  for (const [id, , den] of expected) {
    const dice = D.find(item => item.id === id);
    assert.equal(Math.floor(dice.den / 10), den / 10);
  }
});
