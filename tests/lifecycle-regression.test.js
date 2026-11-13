import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimerManager } from '../core/timer-manager.js';
import { WEATHER_TYPES } from '../config.js';
import { createAuthService } from '../services/auth.js';
import { createVisitTrackingService } from '../services/visit-tracking.js';
import { createDiceSystem } from '../systems/dice.js';
import { createGlobalBoostSystem } from '../systems/global-boost.js';
import { createRealmPolls } from '../systems/realm-polls.js';
import { createCodexUI } from '../ui/codex.js';
import { createGloveUI } from '../ui/gloves.js';
import { createPotionUI } from '../ui/potions.js';
import { createPetSystem } from '../systems/pets.js';
import { createWeatherSystem } from '../systems/weather.js';
import { createGlobalAnnouncements } from '../systems/global-announcements.js';

function createFakeDocument(ids = []) {
  const listeners = new Map();
  const elements = new Map(ids.map(id => [id, {
    id,
    onclick: null,
    disabled: false,
    addEventListener(type, handler) {
      const key = `${id}:${type}`;
      const handlers = listeners.get(key) || [];
      handlers.push(handler);
      listeners.set(key, handlers);
    }
  }]));
  return {
    hidden: false,
    listeners,
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    removeEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      listeners.set(type, handlers.filter(item => item !== handler));
    },
    getElementById(id) { return elements.get(id) || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

function createFakeTimerManager() {
  let nextHandle = 1;
  const intervals = new Map();
  const timeouts = new Map();
  const manager = createTimerManager({
    setIntervalFn(callback, delay) {
      const handle = nextHandle++;
      intervals.set(handle, { callback, delay });
      return handle;
    },
    clearIntervalFn(handle) { intervals.delete(handle); },
    setTimeoutFn(callback, delay) {
      const handle = nextHandle++;
      timeouts.set(handle, { callback, delay });
      return handle;
    },
    clearTimeoutFn(handle) { timeouts.delete(handle); }
  });
  return { manager, intervals, timeouts };
}

test('Auth state listener registration is idempotent and can be unsubscribed', () => {
  let registrations = 0;
  let unsubscriptions = 0;
  const subscription = { unsubscribe() { unsubscriptions++; } };
  const service = createAuthService({
    supabaseClient: { auth: { onAuthStateChange() {
      registrations++;
      return { data: { subscription } };
    } } }
  });

  const first = service.registerAuthStateListener();
  const second = service.registerAuthStateListener();
  assert.equal(registrations, 1);
  assert.equal(second, first);
  service.unregisterAuthStateListener();
  assert.equal(unsubscriptions, 1);
  service.registerAuthStateListener();
  assert.equal(registrations, 2);
});

test('visit tracking start does not duplicate listeners or heartbeat intervals', () => {
  const previousDocument = globalThis.document;
  const documentRef = createFakeDocument();
  globalThis.document = documentRef;
  const timers = createFakeTimerManager();
  try {
    const service = createVisitTrackingService({
      getCurrentUser: () => null,
      getState: () => ({}),
      supabaseClient: null,
      timerManager: timers.manager
    });
    assert.equal(service.startGameVisitTracking(), true);
    assert.equal(service.startGameVisitTracking(), false);
    assert.equal(documentRef.listeners.get('visibilitychange').length, 1);
    assert.equal(timers.manager.getStats().scopes['visit-tracking'].intervals, 1);
    assert.equal(service.stopGameVisitTracking(), true);
    assert.equal(documentRef.listeners.get('visibilitychange').length, 0);
    assert.equal(timers.manager.getStats().total, 0);
    assert.equal(service.startGameVisitTracking(), true);
    assert.equal(documentRef.listeners.get('visibilitychange').length, 1);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('dice, global boost, realm poll and codex setup are idempotent', () => {
  const timers = createFakeTimerManager();

  const diceDocument = createFakeDocument(['autoBtn', 'stopBtn']);
  const dice = createDiceSystem({
    timerManager: timers.manager,
    documentRef: diceDocument,
    totalDice: () => 0,
    getState: () => ({ bagCapacity: 35 })
  });
  assert.equal(dice.setupAutoRollUI(), true);
  assert.equal(dice.setupAutoRollUI(), false);
  assert.equal(diceDocument.listeners.get('visibilitychange').length, 1);
  assert.equal(typeof diceDocument.getElementById('autoBtn').onclick, 'function');

  const boostDocument = createFakeDocument();
  const boost = createGlobalBoostSystem({
    getBoostState: () => null,
    setBoostState() {},
    documentRef: boostDocument,
    timerManager: timers.manager
  });
  assert.equal(boost.setupGlobalBoostUI(), true);
  assert.equal(boost.setupGlobalBoostUI(), false);
  assert.equal(boostDocument.listeners.get('click').length, 1);
  assert.equal(timers.manager.getStats().scopes['global-boost-refresh'].intervals, 1);

  const realmDocument = createFakeDocument(['adminBroadcastSendBtn', 'adminPollStartBtn', 'realmPollButtons']);
  const realm = createRealmPolls({
    getState: () => ({}),
    getCurrentUser: () => null,
    supabaseClient: null,
    isAdmin: () => false,
    escapeHTML: String,
    format: String,
    documentRef: realmDocument,
    timerManager: timers.manager
  });
  assert.equal(realm.setupRealmSocialUI(), true);
  assert.equal(realm.setupRealmSocialUI(), false);
  assert.equal(realmDocument.listeners.get('realmPollButtons:click').length, 1);
  assert.equal(timers.manager.getStats().scopes['realm-poll-sync']?.intervals || 0, 0); // no active poll means no background polling

  const codexDocument = createFakeDocument();
  const codex = createCodexUI({
    D: [], getState: () => ({}), format: String, chanceText: String,
    renderPetCodex() {}, weatherDiceStats: {}, loadWeatherDiceExistCounts() {},
    documentRef: codexDocument
  });
  assert.equal(codex.setupCodexUI(), true);
  assert.equal(codex.setupCodexUI(), false);
  assert.equal(codexDocument.listeners.get('click').length, 1);
});

test('glove, potion and pet UI setup do not multiply delegated handlers', () => {
  const gloveDocument = createFakeDocument();
  const gloves = createGloveUI({ documentRef: gloveDocument });
  assert.equal(gloves.setupGloveUI(), true);
  assert.equal(gloves.setupGloveUI(), false);
  assert.equal(gloveDocument.listeners.get('click').length, 1);

  const potionDocument = createFakeDocument();
  const potions = createPotionUI({ documentRef: potionDocument });
  assert.equal(potions.setupPotionUI(), true);
  assert.equal(potions.setupPotionUI(), false);
  assert.equal(potionDocument.listeners.get('click').length, 1);
  assert.equal(potionDocument.listeners.get('change').length, 1);

  const petDocument = createFakeDocument([
    'petSortMode', 'petAutoEquipBestBtn', 'petInventoryGrid',
    'petDiceSlotA', 'petDiceSlotB', 'petDiceCraftBtn'
  ]);
  const pets = createPetSystem({
    getState: () => ({ pets: [], equippedPetUids: [] }),
    PETS: [], PET_RARITIES: [], PET_TIER_CONFIG: {}, PET_TIER_RATES: {},
    PET_MUTATIONS: [], PET_IMAGE_ASSETS: {}, D: [], documentRef: petDocument
  });
  assert.equal(pets.setupPetSystemUI(), true);
  assert.equal(pets.setupPetSystemUI(), false);
  const petListenerTypes = {
    petSortMode: 'change',
    petAutoEquipBestBtn: 'click',
    petInventoryGrid: 'click',
    petDiceSlotA: 'change',
    petDiceSlotB: 'change',
    petDiceCraftBtn: 'click'
  };
  for (const [id, type] of Object.entries(petListenerTypes)) {
    assert.equal(petDocument.listeners.get(`${id}:${type}`).length, 1);
  }
});

test('player weather subscription replaces the previous account channel', async () => {
  const previousStorage = globalThis.localStorage;
  const previousDocument = globalThis.document;
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const weatherElements = new Map();
  globalThis.document = {
    addEventListener() {},
    getElementById(id) { return weatherElements.get(id) || null; },
    createElement() { return { setAttribute() {}, classList: { add() {}, remove() {} } }; },
    body: { classList: { toggle() {} }, appendChild(element) { if (element.id) weatherElements.set(element.id, element); } }
  };
  let currentUser = { id: 'user-a' };
  const channels = [];
  const removedChannels = [];
  const originalDebug = console.debug;
  console.debug = () => {};
  const supabaseClient = {
    channel(name) {
      const channel = {
        name,
        on() { return this; },
        subscribe() { channels.push(this); return this; }
      };
      return channel;
    },
    removeChannel(channel) { removedChannels.push(channel); },
    from() {
      return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null, error: null }; } };
    }
  };
  try {
    const weather = createWeatherSystem({
      WEATHER_TYPES,
      supabaseClient,
      getCurrentUser: () => currentUser,
      timerManager: createFakeTimerManager().manager,
      renderCodex() {}
    });
    weather.setupPlayerWeatherSubscription();
    currentUser = { id: 'user-b' };
    weather.setupPlayerWeatherSubscription();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(channels.map(channel => channel.name), ['player-weather-user-a', 'player-weather-user-b']);
    assert.deepEqual(removedChannels, [channels[0]]);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    console.debug = originalDebug;
  }
});

test('global announcement setup does not create duplicate realtime channels', () => {
  let channelCreations = 0;
  const channel = { on() { return this; }, subscribe() { return this; } };
  const announcements = createGlobalAnnouncements({
    supabaseClient: { channel() { channelCreations++; return channel; } },
    documentRef: createFakeDocument()
  });
  announcements.setupGlobalAnnouncements();
  announcements.setupGlobalAnnouncements();
  assert.equal(channelCreations, 1);
  assert.equal(announcements.getAnnouncementChannel(), channel);
});

test('timer manager removes fired timeouts and clearAll removes remaining intervals', () => {
  const timers = createFakeTimerManager();
  const timeout = timers.manager.setTimeout(() => {}, 10, 'one-shot');
  const interval = timers.manager.setInterval(() => {}, 20, 'recurring');
  assert.equal(timers.manager.getStats().total, 2);
  timers.timeouts.get(timeout).callback();
  assert.equal(timers.manager.getStats().timeouts, 0);
  assert.equal(timers.manager.clearAll(), 1);
  assert.equal(timers.manager.getStats().total, 0);
  assert.equal(timers.intervals.has(interval), false);
});
