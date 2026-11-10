import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService } from '../services/auth.js';

function installDocument(values = {}) {
  const elements = new Map();
  for (const [id, value] of Object.entries(values)) {
    elements.set(id, { value, disabled: false, textContent: '' });
  }
  for (const id of ['authMessage', 'authLoginBtn', 'authSignupBtn', 'authResetBtn', 'authGoogleBtn']) {
    if (!elements.has(id)) elements.set(id, { value: '', disabled: false, textContent: '' });
  }
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: '', disabled: false, textContent: '' });
      return elements.get(id);
    }
  };
  return elements;
}

afterEach(() => {
  delete globalThis.document;
});

test('Google sign-in requests account selection and returns to the GitHub Pages game', async () => {
  const elements = installDocument();
  const calls = [];
  const service = createAuthService({
    DEVICE_ACCOUNT_LIMIT: 3,
    supabaseClient: {
      auth: {
        signInWithOAuth: async options => {
          calls.push(options);
          return { data: { url: 'https://accounts.google.com/' }, error: null };
        }
      }
    }
  });

  await service.googleSignIn();

  assert.deepEqual(calls, [{
    provider: 'google',
    options: {
      redirectTo: 'https://hermes0403.github.io/dice-realm-rng/',
      queryParams: { prompt: 'select_account' }
    }
  }]);
  assert.match(elements.get('authMessage').textContent, /Google 帳號選擇/);
  assert.equal(elements.get('authGoogleBtn').disabled, false);
});

test('Google sign-in is blocked after the project reports a quota restriction', async () => {
  const elements = installDocument({
    authEmail: 'player@example.com',
    authPassword: 'valid-password'
  });
  let oauthCalls = 0;
  const service = createAuthService({
    DEVICE_ACCOUNT_LIMIT: 3,
    supabaseClient: {
      auth: {
        signInWithPassword: async () => ({
          data: null,
          error: { status: 402, message: 'exceed_egress_quota' }
        }),
        signInWithOAuth: async () => {
          oauthCalls += 1;
          return { data: {}, error: null };
        }
      }
    }
  });

  await service.authAction('login');
  await service.googleSignIn();

  assert.equal(oauthCalls, 0);
  assert.match(elements.get('authMessage').textContent, /流量額度限制/);
  assert.equal(elements.get('authGoogleBtn').disabled, false);
});
