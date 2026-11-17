import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAuthEmailRateLimitMessage,
  getLoginFailureMessage,
  runCloudSessionInitialization
} from '../services/auth.js';

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
