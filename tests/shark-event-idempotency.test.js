import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createSharkEventUI } from '../ui/shark-event.js';

const originalCrypto = globalThis.crypto;

function installDocument() {
  const elements = new Map();
  for (const [id, value] of Object.entries({
    sharkGrantUserId: '123e4567-e89b-42d3-a456-426614174000',
    sharkGrantAmount: '2.5',
    sharkGrantReason: '活動補發',
    sharkGrantStatus: '',
    sharkEventStatus: '',
    sharkCoinBalance: '',
    dragonEggBalance: '',
    sharkTaskCount: '',
    sharkCurrentTaskTitle: '',
    sharkTaskProgress: '',
    sharkTaskReward: '',
    sharkTaskProgressBar: '',
    grantSharkCoinsBtn: '',
    refreshSharkEventBtn: ''
  })) {
    elements.set(id, {
      value,
      textContent: '',
      style: {},
      disabled: false,
      addEventListener(type, handler) {
        this.listeners ||= {};
        this.listeners[type] = handler;
      }
    });
  }
  return {
    elements,
    documentRef: { getElementById: id => elements.get(id) || null }
  };
}

afterEach(() => {
  if (originalCrypto === undefined) delete globalThis.crypto;
  else Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
});

test('admin coin grant reuses the same idempotency key after an uncertain failure', async () => {
  let generatedKeys = 0;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { randomUUID: () => 'stable-grant-key-' + (++generatedKeys) }
  });
  const { elements, documentRef } = installDocument();
  const grantCalls = [];
  let grantAttempt = 0;
  const supabaseClient = {
    async rpc(name, args) {
      if (name === 'admin_grant_shark_coins') {
        grantCalls.push(args);
        grantAttempt += 1;
        if (grantAttempt === 1) return { data: null, error: { message: 'network timeout' } };
        return { data: { shark_coins: 2.5 }, error: null };
      }
      if (name === 'get_shark_event_state') {
        return {
          data: {
            shark_coins: 2.5,
            dragon_eggs: 0,
            completed_tasks: 0,
            total_tasks: 25,
            current_task: { order: 1, title: '擲骰 100 次', progress: 0, target: 100, reward: 1, event_key: 'roll_count' }
          },
          error: null
        };
      }
      throw new Error('Unexpected RPC: ' + name);
    }
  };
  const ui = createSharkEventUI({
    supabaseClient,
    getCurrentUser: () => ({ id: 'admin-user' }),
    isAdmin: () => true,
    toast: () => {},
    documentRef
  });
  const click = elements.get('grantSharkCoinsBtn').listeners.click;

  await click();
  await click();

  assert.equal(grantCalls.length, 2);
  assert.equal(grantCalls[0].p_idempotency_key, 'stable-grant-key-1');
  assert.equal(grantCalls[1].p_idempotency_key, 'stable-grant-key-1');
  assert.equal(generatedKeys, 1);
  assert.match(elements.get('sharkGrantStatus').textContent, /發放成功/);
  assert.equal(elements.get('grantSharkCoinsBtn').disabled, false);
  assert.equal(await ui.load(), true);
});

test('changing the grant payload creates a new idempotency key', async () => {
  let generatedKeys = 0;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { randomUUID: () => 'grant-key-' + (++generatedKeys) }
  });
  const { elements, documentRef } = installDocument();
  const grantCalls = [];
  const supabaseClient = {
    async rpc(name, args) {
      if (name === 'admin_grant_shark_coins') {
        grantCalls.push(args);
        return { data: null, error: { message: 'network timeout' } };
      }
      throw new Error('Unexpected RPC: ' + name);
    }
  };
  const ui = createSharkEventUI({
    supabaseClient,
    getCurrentUser: () => ({ id: 'admin-user' }),
    isAdmin: () => true,
    toast: () => {},
    documentRef
  });
  const click = elements.get('grantSharkCoinsBtn').listeners.click;

  await click();
  elements.get('sharkGrantAmount').value = '3';
  await click();

  assert.equal(grantCalls.length, 2);
  assert.notEqual(grantCalls[0].p_idempotency_key, grantCalls[1].p_idempotency_key);
  assert.equal(generatedKeys, 2);
});
