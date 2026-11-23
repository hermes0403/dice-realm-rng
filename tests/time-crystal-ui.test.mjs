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
  let clickHandler = null;
  const documentRef = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', style: {} });
      return elements.get(id);
    },
    addEventListener(type, handler) {
      if (type === 'click') clickHandler = handler;
    }
  };
  const calls = [];
  const messages = [];
  let saveCalls = 0;
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
    { id: 'd64', name: '錯誤代碼', den: 100000000, icon: '⚠️', glitchBonus: true },
    { id: 'd65', name: '故障核心', den: 7777777, icon: '⚠️', glitchBonus: true }
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
    save() { saveCalls++; },
    flushCloudSave: async () => true,
    adoptServerBag(bag) {
      state.bag = { ...bag };
      return true;
    },
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
  function click(selector, dataset = {}) {
    assert.equal(typeof clickHandler, 'function', 'click handler must be installed');
    const target = {
      closest(candidate) {
        return candidate === selector ? { dataset } : null;
      }
    };
    return clickHandler({ target });
  }
  return { ui, state, calls, messages, elements, click, get saveCalls() { return saveCalls; } };
}

test('Time Crystal recipe is compact and collapsed until opened', async () => {
  const h = makeHarness(async name => {
    if (name === 'get_time_crystal_status') {
      return { data: { owned: false, materials: {}, pending: false, cooldown_until: null }, error: null };
    }
    throw new Error('Unexpected RPC: ' + name);
  });
  await h.ui.loadTimeCrystalStatus(true);
  h.ui.setupGloveUI();
  h.ui.renderGloves();
  let html = h.elements.get('itemWorkshopList').innerHTML;
  assert.match(html, /data-time-crystal-toggle/);
  assert.doesNotMatch(html, /data-time-crystal-add/);

  h.click('[data-time-crystal-toggle]');
  h.ui.renderGloves();
  html = h.elements.get('itemWorkshopList').innerHTML;
  assert.match(html, /可使下個天氣延長20%時間/);
  assert.match(html, /時序骰子/);
  assert.match(html, /虛空骰子/);
  assert.match(html, /故障骰子/);
  assert.match(html, /data-time-crystal-add="time"/);
  assert.match(html, /data-time-crystal-add="void"/);
  assert.match(html, /data-time-crystal-add="glitch"/);
  assert.match(html, /0\/1/);
});

test('confirm button deposits one selected die and material survives a fresh status read', async () => {
  let serverMaterials = {};
  const h = makeHarness(async (name, args) => {
    if (name === 'get_time_crystal_status') {
      return { data: { owned: false, materials: { ...serverMaterials }, pending: false, cooldown_until: null }, error: null };
    }
    if (name === 'deposit_time_crystal_material') {
      assert.deepEqual(args, { p_die_id: 'd15', p_expected_user_id: 'test-user' });
      serverMaterials = { time: 'd15' };
      return {
        data: {
          ok: true,
          already_deposited: false,
          bag: { d14: 1, d64: 1 },
          materials: { ...serverMaterials },
          updated_at: '2026-11-23T10:00:00Z'
        },
        error: null
      };
    }
    throw new Error('Unexpected RPC: ' + name);
  });
  await h.ui.loadTimeCrystalStatus(true);
  h.ui.setupGloveUI();
  h.click('[data-time-crystal-toggle]');
  h.click('[data-time-crystal-add]', { timeCrystalAdd: 'time' });
  h.click('[data-time-crystal-select]', { timeCrystalSelect: 'd15' });
  await h.click('[data-time-crystal-confirm]');

  assert.ok(h.calls.some(call => call.name === 'deposit_time_crystal_material'));
  assert.deepEqual(h.state.bag, { d14: 1, d64: 1 });
  assert.equal(h.saveCalls, 0, 'server inventory transactions must not replay a local bag delta');
  assert.ok(h.messages.includes('材料已投入工坊'));
  await h.ui.loadTimeCrystalStatus(true);
  h.ui.renderGloves();
  assert.match(h.elements.get('itemWorkshopList').innerHTML, /已投入/);
});

test('Time Crystal crafting requires all deposited slots and uses server RPC', async () => {
  let crafted = false;
  const h = makeHarness(async name => {
    if (name === 'get_time_crystal_status') {
      return { data: { owned: crafted, materials: { time: 'd15', void: 'd14', glitch: 'd64' }, pending: false, cooldown_until: null }, error: null };
    }
    if (name === 'craft_time_crystal') {
      crafted = true;
      return { data: { ok: true, owned: true, materials: { time: 'd15', void: 'd14', glitch: 'd64' } }, error: null };
    }
    throw new Error('Unexpected RPC: ' + name);
  });
  await h.ui.loadTimeCrystalStatus(true);
  await h.ui.craftTimeCrystal();
  assert.ok(h.calls.some(call => call.name === 'craft_time_crystal'));
  assert.ok(h.messages.some(message => message.includes('合成成功')));
  assert.deepEqual(h.state.bag, { d14: 1, d15: 1, d64: 1 });
});

test('Time Crystal crafting is blocked until all three materials are deposited', async () => {
  const h = makeHarness(async name => {
    if (name === 'get_time_crystal_status') {
      return { data: { owned: false, materials: { time: 'd15' }, pending: false, cooldown_until: null }, error: null };
    }
    throw new Error('Unexpected RPC: ' + name);
  });
  await h.ui.loadTimeCrystalStatus(true);
  await h.ui.craftTimeCrystal();
  assert.equal(h.calls.some(call => call.name === 'craft_time_crystal'), false);
  assert.ok(h.messages.includes('請先投入全部三種材料'));
});

test('crafted Time Crystal hides materials and shows reusable item action', async () => {
  const h = makeHarness(async name => {
    if (name === 'get_time_crystal_status') {
      return { data: { owned: true, materials: { time: 'd15', void: 'd14', glitch: 'd64' }, pending: false, cooldown_until: null }, error: null };
    }
    throw new Error('Unexpected RPC: ' + name);
  });
  await h.ui.loadTimeCrystalStatus(true);
  h.ui.renderGloves();
  const html = h.elements.get('itemWorkshopList').innerHTML;
  assert.match(html, /已合成/);
  assert.match(html, /data-use-time-crystal/);
  assert.match(html, /可重複使用，每次使用後冷卻 1 小時/);
  assert.doesNotMatch(html, /data-time-crystal-add/);
});

test('Time Crystal cooldown disables use and displays a countdown', async () => {
  const h = makeHarness(async name => {
    if (name === 'get_time_crystal_status') {
      return {
        data: {
          owned: true, materials: {}, pending: false,
          cooldown_until: new Date(Date.now() + 42000).toISOString()
        },
        error: null
      };
    }
    throw new Error('Unexpected RPC: ' + name);
  });
  await h.ui.loadTimeCrystalStatus(true);
  h.ui.renderGloves();
  const html = h.elements.get('itemWorkshopList').innerHTML;
  assert.match(html, /冷卻中/);
  assert.match(html, /disabled/);
});

test('admin weather rejection shows exact message and does not arm local effect', async () => {
  const h = makeHarness(async name => {
    if (name === 'get_time_crystal_status') {
      return { data: { owned: true, materials: {}, pending: false, cooldown_until: null }, error: null };
    }
    if (name === 'activate_time_crystal') {
      return { data: null, error: { message: '活動進行中...' } };
    }
    throw new Error('Unexpected RPC: ' + name);
  });
  await h.ui.activateTimeCrystal();
  assert.ok(h.messages.includes('活動進行中...'));
  assert.notEqual(h.state.timeCrystalPending, true);
});
