import test from 'node:test';
import assert from 'node:assert/strict';
import { getWeatherNameParts } from '../systems/weather.js';

const WEATHER_TYPES = {
  crystal: { label: '水晶天氣' },
  rain: { label: '雨天氣' },
  snow: { label: '雪天氣' }
};

test('同時存在的天氣名稱會保留各自標籤並依序並列', () => {
  assert.deepEqual(getWeatherNameParts(['crystal', 'rain'], WEATHER_TYPES), [
    { type: 'crystal', label: '水晶天氣' },
    { type: 'rain', label: '雨天氣' }
  ]);
});

test('單一天氣維持單一標籤，重複或未知天氣不會產生重複標籤', () => {
  assert.deepEqual(getWeatherNameParts(['rain', 'rain', 'unknown'], WEATHER_TYPES), [
    { type: 'rain', label: '雨天氣' }
  ]);
});
