const CACHE_PREFIX = 'dice-realm-shell-';
const CACHE_NAME = 'dice-realm-shell-v1.60';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './data/dice.js?v=20261117-t0102-void-startrail-gloves',
  './script.js?v=20261117-t0103-auth-flow',
  './services/auth.js?v=20261117-t0103-auth-flow',
  './ui/equipment.js?v=20261117-t0102-void-startrail-gloves',
  './ui/gloves.js?v=20261117-t0102-void-startrail-gloves',
  './systems/weather.js?v=20261117-t0098-time-crystal',
  './ui/onboarding.js?v=20261117-t0101-tutorial-milestone',
  './systems/glitch-weather-drops.js?v=20261114-t0089-glitch-potion-drops',
  './systems/secret-pet-skills.js?v=20261114-t0090-secret-pet-skills',
  './data/eternal-update.js?v=20261115-t0098-eternal',
  './systems/pets.js?v=20261115-t0098-eternal-pets',
  './systems/dice.js?v=20261117-t0097-dice-lock-cleanup',
  './systems/dice-locks.js',
  './core/game-state.js',
  './systems/weekly-realm-event.js?v=20261117-v154-auto-rewards',
  './systems/heaven-potion-odds.js?v=20261115-t0098-eternal-dice',
  './assets/pets/eternal-dawn-guardian.svg',
  './assets/pets/eternal-starwish-deer.svg',
  './style.css?v=20261117-t0101-tutorial-milestone',
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
