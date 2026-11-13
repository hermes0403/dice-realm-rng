import test from 'node:test';
import assert from 'node:assert/strict';
import { setupAccountActions } from '../services/account-actions.js';

function createAccountActions({ flushResult }) {
  const elements = new Map();
  const toasts = [];
  let signOutCalls = 0;
  let logoutHandler = null;
  const documentRef = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          textContent: '',
          value: '',
          disabled: false,
          addEventListener(event, handler) {
            if (id === 'profileLogoutBtn' && event === 'click') logoutHandler = handler;
          }
        });
      }
      return elements.get(id);
    }
  };
  const supabaseClient = {
    auth: {
      async signOut() {
        signOutCalls += 1;
        return { error: null };
      }
    }
  };

  setupAccountActions({
    documentRef,
    getState: () => ({}),
    setState() {},
    getCurrentUser: () => ({ id: 'user-a' }),
    setCurrentUser() {},
    supabaseClient,
    SUPABASE_URL: '',
    SUPABASE_KEY: '',
    totalUnique: () => 0,
    achievementStats: () => ({}),
    save() {},
    render() {},
    syncCloudSave: async () => true,
    flushCloudSave: async () => flushResult,
    toast: message => toasts.push(message),
    stopAuto() {},
    KEY: 'diceRealmTest',
    localStorageRef: { removeItem() {}, setItem() {} },
    fresh: () => ({}),
    refreshLeaderboards: async () => {}
  });

  return {
    clickLogout: () => logoutHandler?.(),
    get signOutCalls() { return signOutCalls; },
    toasts
  };
}

test('profile logout is blocked when final cloud save fails', async () => {
  const harness = createAccountActions({ flushResult: false });

  await harness.clickLogout();

  assert.equal(harness.signOutCalls, 0);
  assert.ok(harness.toasts.some(message => message.includes('暫時未登出')));
});

test('profile logout signs out only after final cloud save succeeds', async () => {
  const harness = createAccountActions({ flushResult: true });

  await harness.clickLogout();

  assert.equal(harness.signOutCalls, 1);
  assert.ok(harness.toasts.some(message => message.includes('已登出雲端帳號')));
});
