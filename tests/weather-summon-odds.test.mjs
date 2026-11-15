import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WEATHER_SUMMON_ODDS, pickWeatherSummonType } from '../systems/weather-summon-odds.js';

test('玩家特殊天氣召喚比例固定為水晶 60%、地獄 27%、故障 13%', () => {
  assert.deepEqual(
    WEATHER_SUMMON_ODDS.map(({ type, percent }) => [type, percent]),
    [['crystal', 60], ['hell', 27], ['glitch', 13]]
  );
  assert.equal(WEATHER_SUMMON_ODDS.reduce((sum, item) => sum + item.percent, 0), 100);
});

test('召喚抽選邊界正確且沒有重疊或空隙', () => {
  assert.equal(pickWeatherSummonType(0), 'crystal');
  assert.equal(pickWeatherSummonType(0.599999), 'crystal');
  assert.equal(pickWeatherSummonType(0.60), 'hell');
  assert.equal(pickWeatherSummonType(0.869999), 'hell');
  assert.equal(pickWeatherSummonType(0.87), 'glitch');
  assert.equal(pickWeatherSummonType(0.999999), 'glitch');
  assert.throws(() => pickWeatherSummonType(-0.01), RangeError);
  assert.throws(() => pickWeatherSummonType(1), RangeError);
});

test('正式資料庫 migration 使用相同的 60/27/13 門檻並保護故障天氣', () => {
  const sql = readFileSync(new URL('../docs/migrations/20261113171000_glitch_weather_summon_odds.sql', import.meta.url), 'utf8');
  assert.match(sql, /v_roll\s*<\s*0\.60/);
  assert.match(sql, /v_roll\s*<\s*0\.87/);
  assert.match(sql, /'crystal','hell','glitch'/);
});
