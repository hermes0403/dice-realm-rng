import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { D, G } from '../data/dice.js';
import { createGameStateService } from '../core/game-state.js';
import { createGloveUI } from '../ui/gloves.js';

function makeHarness(rpcHandler = async () => ({ data: null, error: null })) {
  const state = {
    bag: {},
    gloves: { g0: 1 },
    items: {},
    coins: 30_000_000_000,
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
  const baseGlove = G.find(item => item.id === 'g0');
  const ui = createGloveUI({
    getState: () => state,
    D,
    G,
    supabaseClient,
    getCurrentUser: () => ({ id: 'test-user' }),
    byId: id => D.find(item => item.id === id),
    glove: id => G.find(item => item.id === id) || baseGlove,
    currentGlove: () => G.find(item => item.id === state.equipped) || baseGlove,
    format: value => String(value),
    formatWalletScientific: value => value === 5_000_000_000 ? '$5B'
      : value === 18_000_000_000 ? '$18B' : String(value),
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

test('Void and Startrail gloves have the requested catalog values', () => {
  assert.deepEqual(
    G.filter(item => ['g8', 'g9'].includes(item.id)).map(({ id, name, luck, speed, price }) => ({
      id, name, luck, speed, price
    })),
    [
      { id: 'g8', name: '虛空手套', luck: 35, speed: 33, price: 5_000_000_000 },
      { id: 'g9', name: '星軌手套', luck: 38, speed: 36, price: 18_000_000_000 }
    ]
  );
});

test('save normalization preserves ownership and equipped state for g8/g9', () => {
  const service = createGameStateService({
    KEY: 'test',
    D,
    G,
    POTIONS: [],
    ensurePetData() {},
    getCurrentUser: () => null,
    getState: () => ({}),
    localStorageRef: { getItem() {}, setItem() {} }
  });
  const save = {
    gloves: { g8: 1, g9: 1 },
    equipped: 'g9',
    items: { g7: 1 },
    equippedItem: 'g7'
  };
  service.normalizeGloves(save);
  assert.equal(save.gloves.g8, 1);
  assert.equal(save.gloves.g9, 1);
  assert.equal(save.equipped, 'g9');
  assert.equal(save.items.g7, 1);
  assert.equal(save.equippedItem, 'g7');
});

test('workshop displays both new gloves and their prices', () => {
  const h = makeHarness(async name => {
    if (name === 'get_time_crystal_status') {
      return { data: { owned: false, pending: false, cooldown_until: null }, error: null };
    }
    throw new Error('Unexpected RPC: ' + name);
  });
  h.ui.renderGloves();
  const html = h.elements.get('recipeList').innerHTML;
  assert.match(html, /虛空手套/);
  assert.match(html, /運氣 \+35% · 速度 \+33%/);
  assert.match(html, /價格：\$5B/);
  assert.match(html, /星軌手套/);
  assert.match(html, /運氣 \+38% · 速度 \+36%/);
  assert.match(html, /價格：\$18B/);
});

test('purchase sends only the glove id and equips the server-confirmed result', async () => {
  const h = makeHarness(async name => {
    if (name === 'purchase_glove') {
      return {
        data: {
          ok: true,
          coins: 25_000_000_000,
          gloves: { g0: 1, g8: 1 },
          equipped: 'g8'
        },
        error: null
      };
    }
    if (name === 'get_time_crystal_status') {
      return { data: { owned: false, pending: false, cooldown_until: null }, error: null };
    }
    throw new Error('Unexpected RPC: ' + name);
  });
  await h.ui.purchaseGlove('g8');
  const purchase = h.calls.find(call => call.name === 'purchase_glove');
  assert.deepEqual(purchase.args, { p_glove_id: 'g8' });
  assert.equal(h.state.coins, 25_000_000_000);
  assert.equal(h.state.gloves.g8, 1);
  assert.equal(h.state.equipped, 'g8');
  assert.ok(h.messages.some(message => message.includes('購買成功')));
});

test('migration keeps purchase prices server-side and restricts execution to authenticated roles', async () => {
  const sql = await readFile(
    new URL('../docs/migrations/20261117111800_t0102_add_void_startrail_gloves.sql', import.meta.url),
    'utf8'
  );
  assert.match(sql, /WHEN 'g8' THEN 5000000000/);
  assert.match(sql, /WHEN 'g9' THEN 18000000000/);
  assert.match(sql, /SET search_path = ''/);
  assert.match(sql, /AND coalesce\(nullif\(save_data->'gloves'->>p_glove_id/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.purchase_glove\(text\) FROM PUBLIC, anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.purchase_glove\(text\) TO authenticated, service_role/);
});
