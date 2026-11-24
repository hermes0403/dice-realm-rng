import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('Shark weather announcements describe the actual admin-only effect', () => {
  const source = readFileSync(new URL('../systems/global-announcements.js', import.meta.url), 'utf8');
  assert.match(source, /管理員啟動了鯊鯊天氣/);
  assert.match(source, /擲骰速度提高 100%/);
});
