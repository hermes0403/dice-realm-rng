import test from 'node:test';
import assert from 'node:assert/strict';
import { createGloveUI } from '../ui/gloves.js';

function makeHarness(rpcHandler) {
  const state = {
    bag: { d14: 1, d15: 1, d64: 1 },
    gloves: { g0: 1 },
    items: {},
    coins: 0,
    equipped: 'g0',
    equippedItem: '',
    quest: { craft: 0 }
  };
  const elements = new Map();
  const documentRef = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', style: {} });
      return elements.get(id);
    },
    addEventListener() {}
  };
  const calls = [];
  const messages = [];
  const supabaseClient = {
    async rpc(name, args) {
      calls.push({ name, args });
      return rpcHandler(name, args, state);
    }
  };
  const baseGlove = { id: 'g0', name: '基礎手套', icon: '🧤', luck: 0, speed: 0, desc: '基本手套。' };
  const converter = { id: 'g7', name: '天氣轉換器', icon: '🌦️', luck: 0, speed: 0, desc: '', recipe: [] };
  const dice = [
    { id: 'd14', name: '虛空骰子', den: 16384, icon: '◉' },
    { id: 'd15', name: '時序骰子', den: 32768, icon: '⌛' },
    { id: 'd64', name: '錯誤代碼', den: 100000000, icon: '⚠️', glitchBonus: true }
  ];
  const ui = createGloveUI({
    getState: () => state,
    D: dice,
    G: [baseGlove, converter],
    supabaseClient,
    getCurrentUser: () => ({ id: 'test-user' }),
    byId: id => dice.find(item => item.id === id),
    glove: () => baseGlove,
    currentGlove: () => baseGlove,
    format: value => String(value),
    formatWalletScientific: value => String(value),
    save() {},
    flushCloudSave: async () => {},
    render() {},
    toast: message => messages.push(message),
    rewardText: () => '',
    grantAchievementReward() {},
    showAchievementPopup() {},
    checkAchievements() {},
    logCraft() {},
    KEY: 'test',
    userSaveKey: 'test',
    documentRef,
    confirmAction: () => true,
    openAuth() {}
  });
  return { ui, state, calls, messages, elements };
}

test('Time Crystal workshop shows exact description and required materials', async () => {
  const h = makeHarness(async name => {
    if (name === 'get_time_crystal_status') {
      return { data: { owned: false, pending: false, cooldown_until: null }, error: null };
    }
    throw new Error('Unexpected RPC: ' + name);
  });
  await h.ui.loadTimeCrystalStatus(true);
  h.ui.renderGloves();
  const html = h.elements.get('itemWorkshopList').innerHTML;
  assert.match(html, /可使下個天氣延長20%時間/);
  assert.match(html, /時序骰子/);
  assert.match(html, /虛空骰子/);
  assert.match(html, /故障骰子/);
});

test('Time Crystal crafting uses server RPC and adopts returned bag', async () => {
  const h = makeHarness(async (name) => {
    if (name === 'get_time_crystal_status') {
      return { data: { owned: true, pending: false, cooldown_until: null }, error: null };
    }
    if (name === 'craft_time_crystal') {
      return { data: { ok: true, owned: true, bag: { d14: 0, d15: 0, d64: 0 } }, error: null };
    }
    throw new Error('Unexpected RPC: ' + name);
  });
  await h.ui.craftTimeCrystal();
  assert.ok(h.calls.some(call => call.name === 'craft_time_crystal'));
  assert.deepEqual(h.state.bag, { d14: 0, d15: 0, d64: 0 });
  assert.ok(h.messages.some(message => message.includes('合成成功')));
});

test('admin weather rejection shows exact message and does not arm local effect', async () => {
  const h = makeHarness(async name => {
    if (name === 'get_time_crystal_status') {
      return { data: { owned: true, pending: false, cooldown_until: null }, error: null };
    }
    if (name === 'activate_time_crystal') {
      return { data: null, error: { message: '活動進行中...' } };
    }
    throw new Error('Unexpected RPC: ' + name);
  });
  await h.ui.activateTimeCrystal();
  assert.ok(h.messages.includes('活動進行中...'));
  assert.equal(h.state.timeCrystalPending, false);
});
