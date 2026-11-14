import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobalAnnouncements } from '../systems/global-announcements.js';

function createHarness() {
  let rareRollListener = null;
  const sent = [];
  const rows = [];
  const list = {
    children: [],
    _innerHTML: '',
    get innerHTML() { return this._innerHTML; },
    set innerHTML(value) {
      this._innerHTML = value;
      if (value === '') this.children = [];
    },
    appendChild(node) { this.children.push(node); }
  };
  const channel = {
    on(type, filter, callback) {
      if (type === 'broadcast' && filter.event === 'rare_roll') rareRollListener = callback;
      return this;
    },
    subscribe() { return this; },
    send(message) {
      sent.push(message);
      return Promise.resolve();
    }
  };
  const supabaseClient = {
    channel() { return channel; },
    from(table) {
      return {
        async insert(row) {
          rows.push({ table, row });
          return { error: null };
        }
      };
    }
  };
  const documentRef = {
    getElementById(id) { return id === 'globalAnnouncements' ? list : null; },
    createElement() { return { className: '', innerHTML: '', setAttribute() {}, appendChild() {} }; },
    body: { appendChild() {} }
  };
  const system = createGlobalAnnouncements({
    getState: () => ({ name: '測試玩家' }),
    getCurrentUser: () => ({ id: 'player-1' }),
    weatherApi: { applyForcedWeather() {}, applyServerWeatherRow() {} },
    supabaseClient,
    toast() {},
    isAdmin: () => false,
    petById: () => null,
    escapeHTML: value => String(value),
    format: value => String(value),
    WEATHER_TYPES: {},
    documentRef,
    timerManager: { clearTimeout() {}, setTimeout() { return 1; } }
  });
  system.setupGlobalAnnouncements();
  return { system, list, sent, rows, get rareRollListener() { return rareRollListener; } };
}

test('分母低於 4096 時不顯示、不廣播，也不寫入雲端歷史', async () => {
  const { system, list, sent, rows } = createHarness();
  await system.broadcastRareRoll({ name: '測試骰子', den: 4095 });
  assert.equal(list.children.length, 0);
  assert.equal(sent.length, 0);
  assert.equal(rows.length, 0);
});

test('分母等於 4096 時顯示骰子名稱、廣播並寫入雲端歷史', async () => {
  const { system, list, sent, rows } = createHarness();
  await system.broadcastRareRoll({ name: '邊界骰子', den: 4096 });
  assert.equal(list.children.length, 1);
  assert.match(list.children[0].innerHTML, /測試玩家/);
  assert.match(list.children[0].innerHTML, /邊界骰子/);
  assert.match(list.children[0].innerHTML, /1\/4096/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].event, 'rare_roll');
  assert.deepEqual(sent[0].payload, {
    name: '測試玩家',
    den: 4096,
    diceName: '邊界骰子',
    at: sent[0].payload.at
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].table, 'roll_announcements');
  assert.equal(rows[0].row.den, 4096);
});

test('接收端也會拒絕 4096 以下事件，並顯示達標事件的骰子名稱', () => {
  const { list, rareRollListener } = createHarness();
  rareRollListener({ payload: { name: '其他玩家', diceName: '未達標骰', den: 4095 } });
  assert.equal(list.children.length, 0);
  rareRollListener({ payload: { name: '其他玩家', diceName: '達標骰', den: 4096 } });
  assert.equal(list.children.length, 1);
  assert.match(list.children[0].innerHTML, /達標骰/);
  assert.match(list.children[0].innerHTML, /1\/4096/);
});
