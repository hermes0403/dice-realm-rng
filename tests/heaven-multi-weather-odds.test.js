import test from 'node:test';
import assert from 'node:assert/strict';
import { addWeatherDiceOdds } from '../systems/dice.js';

test('Heaven potion adds weather dice from every active weather in a pair', () => {
  const entries = [
    { dice: { id: 'base-a' }, weight: 50 },
    { dice: { id: 'base-b' }, weight: 50 }
  ];
  const pool = [
    { id: 'rain-rare', weather: 'rain', den: 3000 },
    { id: 'snow-rare', weather: 'snow', den: 4000 },
    { id: 'thunder-rare', weather: 'thunder', den: 5000 },
    { id: 'rain-common', weather: 'rain', den: 2048 }
  ];
  const result = addWeatherDiceOdds(entries, pool, ['rain', 'snow']);
  assert.deepEqual(result.filter(entry => entry.dice.weather).map(entry => entry.dice.id), ['rain-rare', 'snow-rare']);
  assert.equal(result.find(entry => entry.dice.id === 'rain-rare').weight, 1);
  assert.equal(result.find(entry => entry.dice.id === 'snow-rare').weight, 1);
  assert.ok(Math.abs(result.reduce((sum, entry) => sum + entry.weight, 0) - 100) < 1e-9);
});

test('single weather keeps its existing special-dice odds', () => {
  const entries = [{ dice: { id: 'base' }, weight: 100 }];
  const pool = [{ id: 'hell-rare', weather: 'hell', den: 5000 }];
  const result = addWeatherDiceOdds(entries, pool, ['hell']);
  assert.equal(result.length, 2);
  assert.equal(result[1].dice.id, 'hell-rare');
});
