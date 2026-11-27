const CACHE_PREFIX = 'dice-realm-shell-';
const CACHE_NAME = 'dice-realm-shell-v2.52';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './script.js?v=20261127-t0160-guild-xp-console',
  './data/dice.js?v=20261117-t0102-void-startrail-gloves',
  './data/equipment.js?v=20261121-t0123-money-potions',
  './data/pets.js?v=20261122-pet-skill-swap-v1',
  './data/pets.js',
  './data/eternal-update.js?v=20261122-eternal-income-v1',
  './data/progression.js',
  './config.js?v=20261123-daily-shop-v1',
  './config.js',
  './services/supabase.js',
  './core/format.js',
  './ui/navigation.js?v=20261127-t0157-trade-navigation-cache',
  './ui/inventory.js?v=20261126-t0142-inventory-selection',
  './systems/pet-income.js?v=20261118-pet-income-mutation-v2',
  './admin/pet-odds.js?v=20261115-t0100-eternal-odds-db-guard',
  './services/device-lock.js',
  './services/visit-tracking.js',
  './ui/pet-selling.js?v=20261121-pet-inventory-sync-guard',
  './systems/progression.js?v=20261118-roll-milestones-v2',
  './admin/grants.js?v=20261127-t0160-guild-xp-console',
  './systems/weather.js?v=20261120-t0110-crystal-weather-purple',
  './systems/glitch-weather-drops.js?v=20261114-t0089-glitch-potion-drops',
  './services/cloud-save.js?v=20261127-t0156-guild-potion-gifting',
  './systems/coin-boost.js',
  './systems/leaderboards.js',
  './services/auth.js?v=20261126-t0139-account-isolation',
  './systems/pets.js?v=20261122-secret-skill-swap-v1',
  './services/pet-trading-search.js?v=20261122-trade-slot-picker-v2',
  './systems/pet-rarity-theme.js?v=20261120-t0113-eternal-blue-pink',
  './systems/pet-skills.js',
  './systems/dice.js?v=20261122-auto-roll-rare-continue-v1',
  './systems/weekly-realm-event.js?v=20261122-weekly-claim-only-v1',
  './systems/heaven-potion-odds.js?v=20261121-t0121-heaven-mode-persistence',
  './systems/global-boost.js?v=20261117-realtime-boost-polling',
  './systems/realm-social.js?v=20261120-t0113-rare-pet-fusion',
  './ui/equipment.js?v=20261123-t0126-click-capture-fix',
  './systems/daily-shop.js?v=20261123-t0126-click-capture-fix',
  './admin/player-management.js?v=20261127-t0160-guild-xp-console',
  './admin/monitoring.js?v=20261118-shark-weather-history',
  './core/game-state.js?v=20261123-daily-shop-v1',
  './services/presence.js',
  './services/activity-logs.js',
  './ui/pet-notices.js',
  './ui/codex.js',
  './ui/main-render.js',
  './admin/ui-bindings.js?v=20261127-t0160-guild-xp-console',
  './services/account-actions.js?v=20261119-settings-rpc-fix',
  './ui/display-controls.js?v=20261126-t0149-guild-module-refresh',
  './core/timer-manager.js',
  './ui/onboarding.js?v=20261119-settings-buttons-v2',
  './ui/guild.js?v=20261127-t0157-trade-top-gap',
  './systems/weather-summon-odds.js',
  './systems/glitch-dice.js?v=20261114-t0087-heaven-probability',
  './systems/dice-locks.js',
  './systems/heaven-potion-odds.js?v=20261122-heaven2-min-denominator',
  './systems/global-announcements.js?v=20261120-t0113-rare-pet-fusion',
  './systems/realm-polls.js',
  './ui/gloves.js?v=20261123-t0126-click-capture-fix',
  './ui/potions.js?v=20261121-t0123-money-potions',
  './systems/secret-pet-skills.js?v=20261122-secret-skill-swap-v1',
  './assets/pets/eternal-dawn-guardian.svg',
  './assets/pets/eternal-starwish-deer.svg',
  './style.css?v=20261127-t0161-global-boost-layout',
  './guild.css?v=20261127-t0157-trade-top-gap',
  './favicon.ico',
  './assets/pwa-icon-192.png',
  './assets/pwa-icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (['/rest/v1/', '/auth/v1/', '/functions/v1/'].some(path => url.pathname.includes(path))) return;

  const isNavigation = request.mode === 'navigate';
  const isStaticAsset = ['script', 'style', 'image', 'font'].includes(request.destination);
  if (!isNavigation && !isStaticAsset) return;

  event.respondWith(
    fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        event.waitUntil(
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()))
        );
      }
      return response;
    }).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(request))
        || (isNavigation ? await cache.match('./index.html') : Response.error());
    })
  );
});
