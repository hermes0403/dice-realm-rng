import test from 'node:test';
import assert from 'node:assert/strict';
import { D } from '../data/dice.js';

const expected = [
  ['d64', '錯誤代碼', 100000000],
  ['d65', '異常殘響', 7777777],
  ['d66', '系統崩解', 25000000],
  ['d67', '虛空漏洞', 800000]
];

test('四顆故障主題骰子加入一般圖鑑與一般擲骰池', () => {
  for (const [id, name, den] of expected) {
    const dice = D.find(item => item.id === id);
    assert.ok(dice, id + ' exists');
    assert.equal(dice.name, name);
    assert.equal(dice.den, den);
    assert.equal(dice.weather, undefined, 'must remain in the normal codex');
    assert.equal(dice.glitchBonus, true, 'must receive the fault-weather weight bonus');
  }
  assert.equal(new Set(expected.map(([id]) => id)).size, 4);
});
