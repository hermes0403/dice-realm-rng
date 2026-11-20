import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobalAnnouncements } from '../systems/global-announcements.js';
import { applyEternalPetRarityTheme, ETERNAL_PET_RARITY_CSS } from '../systems/pet-rarity-theme.js';

function createAnnouncementHarness() {
  const elements = new Map();
  const events = [];
  const handlers = {};
  const documentRef = {
    getElementById(id) { return elements.get(id) || null; },
    createElement() {
      const inner = { textContent: '' };
      return {
        id: '', className: '', innerHTML: '', dataset: {}, offsetWidth: 1, inner,
        classList: { remove() {}, add() {} },
        querySelector(selector) { return selector === '.secret-pet-marquee-inner' ? inner : null; }
      };
    },
    body: {
      appendChild(element) { elements.set(element.id, element); }
    },
    querySelector() { return null; }
  };
  const channel = {
    on(_type, filter, callback) { handlers[filter.event] = callback; return this; },
    subscribe() { return this; },
    async send(event) { events.push(event); }
  };
  const supabaseClient = {
    channel() { return channel; },
    from() { return { insert: async () => ({ error: null }) }; }
  };
  const system = createGlobalAnnouncements({
    getState: () => ({ name: 'ccc' }),
    getCurrentUser: () => ({ id: 'user-1', email: 'player@example.invalid' }),
    weatherApi: { applyForcedWeather() {}, applyServerWeatherRow() {} },
    supabaseClient,
    toast() {},
    isAdmin: () => false,
    petById: () => ({ name: 'xxxx' }),
    escapeHTML: value => String(value),
    format: String,
    WEATHER_TYPES: {},
    documentRef,
    timerManager: { clearTimeout() {}, setTimeout() { return 1; } }
  });
  system.setupGlobalAnnouncements();
  return { system, elements, events, handlers };
}

for (const [rarity, label] of [['mythic', '神話'], ['secret', '秘密'], ['eternal', '永恆']]) {
  test(`${label}寵物合成會顯示本地彈幕並廣播全服`, async () => {
    const { system, elements, events, handlers } = createAnnouncementHarness();
    await system.recordPetFusion({ name: '材料骰', den: 12345 }, { id: 'pet-x', uid: 'pet-u', kg: 12 }, rarity);
    const marquee = elements.get('secretPetMarquee');
    assert.ok(marquee);
    assert.equal(marquee.inner.textContent, `玩家ccc 召喚到${label}寵物 xxxx`);
    const broadcast = events.find(event => event.event === 'rare_pet_fusion');
    assert.ok(broadcast);
    assert.equal(broadcast.payload.rarity, rarity);
    assert.equal(broadcast.payload.name, 'ccc');
    assert.equal(broadcast.payload.petName, 'xxxx');
    handlers.rare_pet_fusion({ payload: broadcast.payload });
    assert.equal(marquee.inner.textContent, `玩家ccc 召喚到${label}寵物 xxxx`);
    if (rarity === 'secret') {
      assert.ok(events.some(event => event.event === 'secret_pet' && event.payload.announcementVersion === 2));
    } else {
      assert.equal(events.some(event => event.event === 'secret_pet'), false);
    }
  });
}

test('普通、稀有與傳奇寵物不會觸發稀有寵物彈幕', async () => {
  for (const rarity of ['common', 'rare', 'legendary']) {
    const { system, elements, events } = createAnnouncementHarness();
    await system.recordPetFusion({ name: '材料骰', den: 12345 }, { id: 'pet-x', uid: 'pet-u', kg: 12 }, rarity);
    assert.equal(elements.has('secretPetMarquee'), false);
    assert.equal(events.some(event => event.event === 'rare_pet_fusion'), false);
  }
});

test('新版秘密寵物相容事件不會在新版客戶端重複顯示', () => {
  const { handlers, elements } = createAnnouncementHarness();
  handlers.secret_pet({ payload: { name: 'ccc', petName: 'xxxx', announcementVersion: 2 } });
  assert.equal(elements.has('secretPetMarquee'), false);
});

test('永恆稀有度套用較深普通藍至普通粉漸層，且只注入一次', () => {
  const elements = new Map();
  const documentRef = {
    head: { appendChild(style) { elements.set(style.id, style); } },
    getElementById(id) { return elements.get(id) || null; },
    createElement() { return { id: '', textContent: '' }; }
  };
  assert.equal(applyEternalPetRarityTheme(documentRef), true);
  assert.equal(applyEternalPetRarityTheme(documentRef), false);
  assert.match(elements.get('eternal-pet-rarity-theme').textContent, /#0755d9/);
  assert.match(elements.get('eternal-pet-rarity-theme').textContent, /#ffaddd/);
  assert.equal(ETERNAL_PET_RARITY_CSS.includes('.pet-rarity-eternal'), true);
});
