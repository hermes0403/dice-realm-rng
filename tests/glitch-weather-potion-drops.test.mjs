import test from 'node:test';
import assert from 'node:assert/strict';
import { POTIONS } from '../data/equipment.js';
import { createGlitchWeatherDropSystem } from '../systems/glitch-weather-drops.js';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    values
  };
}

function createLockCoordinator() {
  let held = false;
  return {
    locks: {
      async request(name, options, callback) {
        if (held && options?.ifAvailable) return callback(null);
        held = true;
        try {
          return await callback({ name });
        } finally {
          held = false;
        }
      }
    }
  };
}

function createFixture({
  user = { id: 'player-1' },
  weather = { type: 'glitch', types: ['glitch'], until: 5000 },
  ready = true,
  online = true,
  randomValues = [],
  now = 1000,
  storage = createStorage(),
  locks = createLockCoordinator()
} = {}) {
  const state = { potions: { inventory: { angel1: 0, luck1: 0 } } };
  const messages = [];
  let saved = 0;
  let rendered = 0;
  let randomCalls = 0;
  const system = createGlitchWeatherDropSystem({
    getState: () => state,
    getCurrentUser: () => user,
    getWeather: () => weather,
    isReady: () => ready,
    POTIONS,
    save: () => { saved += 1; },
    render: () => { rendered += 1; },
    toast: message => messages.push(message),
    timerManager: {
      setInterval: () => 1,
      clearInterval: () => {}
    },
    navigatorRef: { onLine: online, locks: locks.locks },
    localStorageRef: storage,
    random: () => {
      randomCalls += 1;
      return randomValues.length ? randomValues.shift() : 1;
    },
    now: () => now
  });
  return {
    system, state, messages, storage,
    get saved() { return saved; },
    get rendered() { return rendered; },
    get randomCalls() { return randomCalls; },
    setNow(value) { now = value; },
    setUser(value) { user = value; },
    setWeather(value) { weather = value; },
    setReady(value) { ready = value; },
    setOnline(value) { online = value; }
  };
}

test('故障天氣每秒獨立判定，天堂藥水 I 與運氣藥水 I 可同秒一起獲得', async () => {
  const fixture = createFixture({ randomValues: [0.0009, 0.0019] });
  assert.equal(await fixture.system.tick(), true);
  assert.equal(fixture.state.potions.inventory.angel1, 1);
  assert.equal(fixture.state.potions.inventory.luck1, 1);
  assert.equal(fixture.saved, 1);
  assert.equal(fixture.rendered, 1);
  assert.deepEqual(fixture.messages, ['故障天氣獎勵：天堂藥水 I、運氣藥水 I']);
  assert.equal(POTIONS.find(item => item.id === 'angel1')?.name, '天堂藥水 I');
  assert.equal(POTIONS.find(item => item.id === 'luck1')?.name, '運氣藥水 I');
});

test('兩種藥水獨立抽選，且同一玩家同一秒不會重複結算', async () => {
  const fixture = createFixture({ randomValues: [0.0005, 0.9, 0, 0] });
  assert.equal(await fixture.system.tick(), true);
  assert.equal(fixture.state.potions.inventory.angel1, 1);
  assert.equal(fixture.state.potions.inventory.luck1, 0);
  assert.equal(await fixture.system.tick(), false);
  assert.equal(fixture.randomCalls, 2);
  fixture.setNow(2000);
  assert.equal(await fixture.system.tick(), true);
  assert.equal(fixture.state.potions.inventory.angel1, 2);
  assert.equal(fixture.state.potions.inventory.luck1, 1);
  assert.equal(fixture.saved, 2);
});

test('非故障天氣、天氣已結束、離線或雲端存檔尚未載入時不發放', async () => {
  const fixture = createFixture({ randomValues: [0, 0] });
  fixture.setWeather({ type: 'sunny', types: ['sunny'], until: 0 });
  assert.equal(await fixture.system.tick(), false);
  fixture.setWeather({ type: 'glitch', types: ['glitch'], until: 999 });
  assert.equal(await fixture.system.tick(), false);
  fixture.setWeather({ type: 'glitch', types: ['glitch'], until: 5000 });
  fixture.setOnline(false);
  assert.equal(await fixture.system.tick(), false);
  fixture.setOnline(true);
  fixture.setReady(false);
  assert.equal(await fixture.system.tick(), false);
  assert.equal(fixture.randomCalls, 0);
  assert.equal(fixture.saved, 0);
});

test('多分頁共用 Web Lock 與本機秒數標記，同一秒最多發放一次', async () => {
  const storage = createStorage();
  const locks = createLockCoordinator();
  const sharedState = { potions: { inventory: { angel1: 0, luck1: 0 } } };
  let saved = 0;
  const makeSystem = () => createGlitchWeatherDropSystem({
    getState: () => sharedState,
    getCurrentUser: () => ({ id: 'player-shared' }),
    getWeather: () => ({ type: 'glitch', types: ['glitch'], until: 5000 }),
    isReady: () => true,
    POTIONS,
    save: () => { saved += 1; },
    render: () => {},
    toast: () => {},
    timerManager: { setInterval: () => 1, clearInterval: () => {} },
    navigatorRef: { onLine: true, locks: locks.locks },
    localStorageRef: storage,
    random: () => 0,
    now: () => 1000
  });
  const first = makeSystem();
  const second = makeSystem();
  await Promise.all([first.tick(), second.tick()]);
  assert.equal(sharedState.potions.inventory.angel1, 1);
  assert.equal(sharedState.potions.inventory.luck1, 1);
  assert.equal(saved, 1);
});

test('重新載入後仍會沿用本機秒數標記，且離線期間不補發', async () => {
  const storage = createStorage();
  const first = createFixture({ storage, randomValues: [0, 0] });
  assert.equal(await first.system.tick(), true);
  const reloaded = createFixture({ storage, randomValues: [0, 0] });
  assert.equal(await reloaded.system.tick(), false);
  assert.equal(reloaded.randomCalls, 0);
  reloaded.setNow(6000);
  reloaded.setWeather({ type: 'glitch', types: ['glitch'], until: 10000 });
  assert.equal(await reloaded.system.tick(), true);
  assert.equal(reloaded.state.potions.inventory.angel1, 1);
  assert.equal(reloaded.state.potions.inventory.luck1, 1);
});
