import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAuthEmailRateLimitMessage,
  getEdgeFunctionFailureMessage,
  getLoginFailureMessage,
  runCloudSessionInitialization,
  shouldReuseReadySessionInitialization
} from '../services/auth.js';

test('Edge Function 409 response shows the server Chinese duplicate-name message and preserves the response body', async () => {
  const response = new Response(JSON.stringify({ error: '這個玩家名稱已被使用，請換一個名稱。' }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' }
  });
  const message = await getEdgeFunctionFailureMessage({
    message: 'Edge Function returned a non-2xx status code',
    context: response
  });

  assert.equal(message, '這個玩家名稱已被使用，請換一個名稱。');
  assert.equal((await response.json()).error, '這個玩家名稱已被使用，請換一個名稱。');
});

test('Edge Function 400 response displays its Chinese input validation reason', async () => {
  const response = new Response(JSON.stringify({ error: '玩家名稱需為 3 至 20 個字元。' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
  assert.equal(await getEdgeFunctionFailureMessage({ context: response }), '玩家名稱需為 3 至 20 個字元。');
});

test('Edge Function 429 response displays the server Chinese rate limit message', async () => {
  const response = new Response(JSON.stringify({ error: '註冊操作太頻繁，請稍後再試。' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json' }
  });
  assert.equal(await getEdgeFunctionFailureMessage({ context: response }), '註冊操作太頻繁，請稍後再試。');
});

test('Edge Function status fallbacks remain localized when no JSON response body exists', async () => {
  assert.match(await getEdgeFunctionFailureMessage({ context: new Response('', { status: 401 }) }), /帳號或密碼不正確/);
  assert.match(await getEdgeFunctionFailureMessage({ context: new Response('', { status: 409 }) }), /玩家名稱已被使用/);
  assert.match(await getEdgeFunctionFailureMessage({ context: new Response('', { status: 429 }) }), /操作太頻繁/);
  assert.match(await getEdgeFunctionFailureMessage({ context: new Response('', { status: 503 }) }), /稍後再試/);
});

test('invalid credentials guide first-time players without revealing account existence', () => {
  const message = getLoginFailureMessage({ message: 'Invalid login credentials' });
  assert.match(message, /帳號或密碼不正確/);
  assert.match(message, /建立新帳號/);
  assert.match(message, /忘記密碼/);
});

test('login rate limits tell players to stop retrying', () => {
  const message = getLoginFailureMessage({ status: 429, message: 'Too many requests' });
  assert.match(message, /登入嘗試太頻繁/);
  assert.match(message, /停止重複操作/);
});

test('signup rate limit reports the server supplied cooldown and confirms no email was sent', () => {
  const message = getAuthEmailRateLimitMessage('signup', {
    status: 429,
    message: 'For security purposes, you can only request this after 19 seconds.'
  });
  assert.match(message, /等待 19 秒/);
  assert.match(message, /沒有寄出註冊驗證信/);
});

test('password reset rate limit names the correct email type', () => {
  const message = getAuthEmailRateLimitMessage('reset', {
    status: 429,
    message: 'email rate limit exceeded'
  });
  assert.match(message, /沒有寄出密碼重設信/);
});

test('cloud initialization waits for cloud save before starting dependent services', async () => {
  const calls = [];
  let ready = false;
  const result = await runCloudSessionInitialization({
    userId: 'player-1',
    loadCloudSave: async () => { calls.push('cloud-save'); ready = true; },
    isCloudSaveReady: () => ready,
    isCurrentUser: () => true,
    applyPetLoginSkill: async () => calls.push('pet-skill'),
    loadPetFusionOdds: async () => calls.push('pet-odds'),
    heartbeat: async () => calls.push('heartbeat'),
    loadWeatherSummonData: async refresh => { assert.equal(refresh, false); calls.push('weather'); },
    recordGameVisit: async () => calls.push('visit'),
    setupPlayerWeatherSubscription: () => calls.push('personal-weather'),
    onboardingMaybeShow: () => calls.push('onboarding')
  });

  assert.equal(result, true);
  assert.deepEqual(calls, [
    'cloud-save', 'pet-skill', 'pet-odds', 'heartbeat', 'weather',
    'visit', 'personal-weather', 'onboarding'
  ]);
});

test('cloud save egress restriction is reported to auth and stops initialization', async () => {
  const calls = [];
  let restricted = false;
  const result = await runCloudSessionInitialization({
    userId: 'player-1',
    loadCloudSave: async () => calls.push('cloud-save'),
    isCloudSaveReady: () => false,
    getCloudLoadError: () => Object.assign(new Error('exceed_egress_quota'), { status: 402 }),
    isCurrentUser: () => true,
    loadPetFusionOdds: async () => calls.push('pet-odds'),
    onCloudRestriction: () => { restricted = true; }
  });

  assert.equal(result, false);
  assert.equal(restricted, true);
  assert.deepEqual(calls, ['cloud-save']);
});

test('cloud save failure prevents all post-login cloud requests', async () => {
  const calls = [];
  const result = await runCloudSessionInitialization({
    userId: 'player-1',
    loadCloudSave: async () => calls.push('cloud-save'),
    isCloudSaveReady: () => false,
    isCurrentUser: () => true,
    loadPetFusionOdds: async () => calls.push('pet-odds'),
    heartbeat: async () => calls.push('heartbeat'),
    loadWeatherSummonData: async () => calls.push('weather')
  });

  assert.equal(result, false);
  assert.deepEqual(calls, ['cloud-save']);
});

test('an egress restriction stops later initialization requests', async () => {
  const calls = [];
  let restricted = false;
  const result = await runCloudSessionInitialization({
    userId: 'player-1',
    loadCloudSave: async () => { calls.push('cloud-save'); },
    isCloudSaveReady: () => true,
    isCurrentUser: () => true,
    applyPetLoginSkill: async () => calls.push('pet-skill'),
    loadPetFusionOdds: async () => {
      calls.push('pet-odds');
      throw Object.assign(new Error('exceed_egress_quota'), { status: 402 });
    },
    heartbeat: async () => calls.push('heartbeat'),
    onCloudRestriction: () => { restricted = true; }
  });

  assert.equal(result, false);
  assert.equal(restricted, true);
  assert.deepEqual(calls, ['pet-skill', 'pet-odds']);
});

test('already-loaded account reuses its session without reopening login or reloading cloud save', () => {
  let readinessChecks = 0;
  const isCloudSaveReady = userId => { readinessChecks++; return userId === 'player-1'; };
  assert.equal(shouldReuseReadySessionInitialization({
    attemptedUserId: 'player-1', userId: 'player-1', isCloudSaveReady
  }), true);
  assert.equal(shouldReuseReadySessionInitialization({
    attemptedUserId: 'player-1', userId: 'player-2', isCloudSaveReady
  }), false);
  assert.equal(shouldReuseReadySessionInitialization({
    force: true, attemptedUserId: 'player-1', userId: 'player-1', isCloudSaveReady
  }), false);
  assert.equal(readinessChecks, 1);
});


test('authentication controls bootstrap before optional game UI and use the same service-worker script version', async () => {
  const { readFileSync } = await import('node:fs');
  const script = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const serviceWorker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

  const authBootstrap = script.indexOf('authService=createAuthService({');
  const authListener = script.indexOf('authService.registerAuthStateListener();');
  const optionalUiSetup = script.indexOf('setupGlobalAnnouncements();weatherSystem.setupServerWeatherSubscription();loadWeatherSummonData(false);');

  assert.notEqual(authBootstrap, -1, 'auth service should be created');
  assert.notEqual(authListener, -1, 'auth state listener should be registered');
  assert.notEqual(optionalUiSetup, -1, 'optional UI setup marker should exist');
  assert.ok(authBootstrap < optionalUiSetup, 'auth service must initialize before optional UI setup');
  assert.ok(authListener < optionalUiSetup, 'auth state listener must register before optional UI setup');
  assert.match(script, /bindAuthClick\('authLoginBtn'/, 'login button should be bound during auth bootstrap');
  assert.doesNotMatch(script, /document\.getElementById\('authLoginBtn'\)\.onclick/, 'legacy late binding should be removed');

  const htmlVersion = html.match(/script\.js\?v=([^'"]+)/)?.[1];
  const workerVersion = serviceWorker.match(/\.\/script\.js\?v=([^'"]+)/)?.[1];
  assert.ok(htmlVersion, 'index.html should declare the script version');
  assert.equal(workerVersion, htmlVersion, 'service worker must precache the same script URL');
  assert.match(serviceWorker, /CACHE_NAME = 'dice-realm-shell-v2\.34'/);
});
