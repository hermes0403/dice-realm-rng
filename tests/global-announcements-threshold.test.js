import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobalAnnouncements } from '../systems/global-announcements.js';

function createHarness(playerName = '測試玩家') {
  let rareRollListener = null;
  const sent = [];
  const rows = [];
  const list = {
    children: [],
    _innerHTML: '',
    get innerHTML() { return this._innerHTML; },
    set innerHTML(value) {
      this._innerHTML = value;
      if (value === '') {
        this.children.forEach(node => { node.parentNode = null; });
        this.children = [];
      }
    },
    appendChild(node) { node.parentNode = this; this.children.push(node); }
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
    createElement() {
      const listeners = new Map();
      return {
        className: '', innerHTML: '', textContent: '', style: {}, parentNode: null, offsetWidth: 1,
        listeners,
        addEventListener(name, callback) { listeners.set(name, callback); },
        setAttribute() {},
        appendChild() {},
        remove() {
          if (!this.parentNode) return;
          const index = this.parentNode.children.indexOf(this);
          if (index >= 0) this.parentNode.children.splice(index, 1);
          this.parentNode = null;
        }
      };
    },
    body: { appendChild() {} }
  };
  const system = createGlobalAnnouncements({
    getState: () => ({ name: playerName }),
    getCurrentUser: () => ({ id: 'player-1' }),
    weatherApi: { applyForcedWeather() {}, applyServerWeatherRow() {} },
    supabaseClient,
    toast() {},
    isAdmin: () => false,
    petById: () => null,
    escapeHTML: value => String(value),
    format: value => new Intl.NumberFormat('en-US').format(value),
    WEATHER_TYPES: { crystal: { label: '水晶天氣', icon: '💎' } },
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
  assert.match(list.children[0].innerHTML, /玩家測試玩家/);
  assert.match(list.children[0].innerHTML, /抽到了/);
  assert.match(list.children[0].innerHTML, /1\/4,096/);
  assert.match(list.children[0].innerHTML, /邊界骰子/);
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
  assert.match(list.children[0].innerHTML, /玩家其他玩家/);
  assert.match(list.children[0].innerHTML, /抽到了/);
  assert.match(list.children[0].innerHTML, /1\/4,096/);
  assert.match(list.children[0].innerHTML, /達標骰/);
});

test('長玩家名稱只顯示前四字並以兩個句點省略', async () => {
  const { system, list } = createHarness('可愛的孩子們');
  await system.broadcastRareRoll({ name: '🪐天體骰子', den: 131072 });
  assert.match(list.children[0].innerHTML, /玩家可愛的孩\.\./);
  assert.match(list.children[0].innerHTML, /抽到了/);
  assert.match(list.children[0].innerHTML, /1\/131,072/);
  assert.match(list.children[0].innerHTML, /🪐天體骰子/);
});

test('天氣召喚彈幕會依序完整播放兩次', () => {
  const { system, list } = createHarness();
  system.announceWeatherSummon('crystal', '玩家甲');
  assert.equal(list.children.length, 1);
  const line = list.children[0];
  const onAnimationEnd = line.listeners.get('animationend');
  assert.equal(typeof onAnimationEnd, 'function');
  onAnimationEnd();
  assert.equal(list.children.length, 1, '第一次播放結束後應重新播放同一則公告');
  assert.equal(line.parentNode, list);
  onAnimationEnd();
  assert.equal(list.children.length, 0, '第二次播放結束後才移除公告');
});
