import test from 'node:test';
import assert from 'node:assert/strict';
import { getWeatherSpeedBonus } from '../systems/weather.js';

test('admin Shark weather adds exactly 100 percentage points of roll speed', () => {
  assert.equal(getWeatherSpeedBonus({ type: 'shark' }), 100);
});

test('other weather types do not add Shark speed', () => {
  for (const type of ['sunny', 'rain', 'snow', 'thunder', 'crystal', 'hell', 'glitch', 'dumpling']) {
    assert.equal(getWeatherSpeedBonus({ type }), 0, type);
  }
});

test('combined weather retains the Shark speed bonus once', () => {
  assert.equal(getWeatherSpeedBonus({ type: 'rain', types: ['rain', 'shark'] }), 100);
  assert.equal(getWeatherSpeedBonus({ type: 'shark', types: ['shark', 'shark'] }), 100);
});
