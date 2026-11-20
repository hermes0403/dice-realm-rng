import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherSystem } from '../systems/weather.js';

function createWeatherHarness() {
  const wrap = {
    innerHTML: '',
    classList: { add() {}, remove() {} }
  };
  const elements = {};
  const documentRef = {
    body: { classList: { toggle() {} }, appendChild(element) { elements[element.id] = element; } },
    getElementById(id) { return id === 'weatherStatus' ? wrap : (elements[id] || null); },
    createElement() { return { id: '', className: '', setAttribute() {} }; },
    addEventListener() {}
  };
  const localStorageRef = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const previousDocument = globalThis.document;
  const previousStorage = globalThis.localStorage;
  globalThis.document = documentRef;
  globalThis.localStorage = localStorageRef;

  const system = createWeatherSystem({
    D: [],
    WEATHER_TYPES: {
      sunny: { label: '晴天', icon: '☀️' },
      crystal: { label: '水晶天氣', icon: '💎' },
      rain: { label: '雨天', icon: '🌧️' }
    },
    format: String,
    escapeHTML: String,
    chanceText: () => '',
    byId: () => null,
    supabaseClient: null,
    timerManager: { setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {} },
    getState: () => ({}),
    getCurrentUser: () => null,
    getAnnouncementChannel: () => null,
    openAuth() {},
    toast() {},
    save() {},
    render() {},
    renderCodex() {},
    renderGloves() {},
    async flushCloudSave() {},
    announceWeatherSummon() {},
    triggerWeatherSurge() {}
  });

  return {
    wrap,
    system,
    restore() {
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
      if (previousStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousStorage;
    }
  };
}

test('水晶天氣名稱與倒數都顯示紫色，其他天氣不套用紫色', () => {
  const harness = createWeatherHarness();
  try {
    harness.system.applyServerWeatherRow({
      weather_type: 'crystal',
      ends_at: new Date(Date.now() + 60_000).toISOString(),
      summoned_by: '測試玩家'
    });
    assert.match(harness.wrap.innerHTML, /class="weather-name" style="color:#d59aff">水晶天氣/);
    assert.match(harness.wrap.innerHTML, /class="weather-countdown" style="color:#d59aff">\d{2}:\d{2}/);

    harness.system.applyServerWeatherRow({
      weather_type: 'rain',
      ends_at: new Date(Date.now() + 60_000).toISOString(),
      summoned_by: '測試玩家'
    });
    assert.doesNotMatch(harness.wrap.innerHTML, /style="color:#d59aff"/);
  } finally {
    harness.restore();
  }
});
