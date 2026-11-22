const CACHE_PREFIX = 'dice-realm-shell-';
const CACHE_NAME = 'dice-realm-shell-v1.92';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './data/dice.js?v=20261117-t0102-void-startrail-gloves',
  './script.js?v=20261122-weekly-700k-trade-audit-v1',
  './ui/navigation.js?v=20261121-t0026-trade-exclusive-v5',
  './services/auth.js?v=20261121-t0130-persisted-session-restore-v1',
  './services/cloud-save.js?v=20261121-t0115-pet-save-race',
  './ui/equipment.js?v=20261117-t0098-time-crystal',
  './ui/gloves.js?v=20261117-t0102-void-startrail-gloves',
  './systems/weather.js?v=20261118-shark-weather-speed-v1',
  './systems/progression.js?v=20261118-roll-milestones-v2',
  './services/account-actions.js?v=20261119-settings-rpc-fix',
  './ui/pet-selling.js?v=20261121-pet-inventory-sync-guard',
  './services/pet-trading-search.js?v=20261122-trade-expired-session-v1',
  './ui/display-controls.js?v=20261119-settings-buttons-v2',
  './admin/ui-bindings.js?v=20261118-t0114-login-name-management',
  './config.js?v=20261118-shark-weather',
  './ui/onboarding.js?v=20261119-settings-buttons-v2',
  './systems/glitch-weather-drops.js?v=20261114-t0089-glitch-potion-drops',
  './systems/secret-pet-skills.js?v=20261114-t0090-secret-pet-skills',
  './data/eternal-update.js?v=20261121-t0118-eternal-income',
  './systems/pets.js?v=20261115-t0098-eternal-pets',
  './systems/dice.js?v=20261121-t0121-heaven-mode-persistence',
  './systems/pet-income.js?v=20261118-pet-income-mutation-v2',
  './systems/realm-social.js?v=20261119-pet-audit-metadata',
  './systems/global-announcements.js?v=20261119-pet-audit-metadata',
  './admin/monitoring.js?v=20261118-shark-weather-history',
  './systems/dice-locks.js',
  './core/game-state.js',
  './systems/weekly-realm-event.js?v=20261122-weekly-700k-v1',
  './systems/heaven-potion-odds.js?v=20261121-t0121-heaven-mode-persistence',
  './assets/pets/eternal-dawn-guardian.svg',
  './assets/pets/eternal-starwish-deer.svg',
  './style.css?v=20261122-trade-scroll-accept-v2',
  './assets/pwa-icon-192.png',
  './assets/pwa-icon-512.png'
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
