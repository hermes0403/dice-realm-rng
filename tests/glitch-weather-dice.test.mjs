import test from 'node:test';
import assert from 'node:assert/strict';
import { D } from '../data/dice.js';
import { addGlitchDiceOdds, applyGlitchWeight } from '../systems/glitch-dice.js';

const glitchDice = D.filter(dice => dice.glitchBonus);

test('故障天氣只將四顆故障骰子的擲骰權重乘以 10', () => {
  assert.equal(glitchDice.length, 4);
  const ordinary = D.find(dice => dice.id === 'd14');
  assert.equal(applyGlitchWeight(ordinary, 5, false), 5);
  assert.equal(applyGlitchWeight(ordinary, 5, true), 5);
  for (const dice of glitchDice) {
    assert.equal(applyGlitchWeight(dice, 2, false), 2);
    assert.equal(applyGlitchWeight(dice, 2, true), 20);
  }
});

test('天堂藥水抽選池保留四顆故障骰子的基礎權重，故障天氣再乘 10', () => {
  const ordinary = D.find(dice => dice.id === 'd14');
  const entries = [{ dice: ordinary, weight: 100 }];
  const normal = addGlitchDiceOdds(entries, D, false);
  const glitch = addGlitchDiceOdds(entries, D, true);
  assert.equal(normal.length, 5);
  assert.equal(glitch.length, 5);
  for (const dice of glitchDice) {
    const baseWeight = normal.find(entry => entry.dice.id === dice.id).weight;
    const boostedWeight = glitch.find(entry => entry.dice.id === dice.id).weight;
    assert.ok(baseWeight > 0);
    assert.equal(boostedWeight, baseWeight * 10);
  }
  assert.equal(glitch.find(entry => entry.dice.id === ordinary.id).weight, 100);
});
