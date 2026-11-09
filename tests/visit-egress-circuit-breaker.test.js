import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisitTrackingService } from '../services/visit-tracking.js';

function installBrowserStubs() {
  const previousStorage = globalThis.localStorage;
  const previousDocument = globalThis.document;
  let visibilityHandler = null;
  const removedHandlers = [];
  globalThis.localStorage = {
    getItem() { return 'visitor-test-id'; },
    setItem() {}
  };
  globalThis.document = {
    hidden: false,
    addEventListener(event, handler) {
      if (event === 'visibilitychange') visibilityHandler = handler;
    },
    removeEventListener(event, handler) {
      if (event === 'visibilitychange') removedHandlers.push(handler);
      if (visibilityHandler === handler) visibilityHandler = null;
    }
  };
  return {
    get visibilityHandler() { return visibilityHandler; },
    removedHandlers,
    restore() {
      if (previousStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previousStorage;
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    }
  };
}

test('HTTP 402 stops visit writes, interval and visibility listener', async () => {
  const browser = installBrowserStubs();
  let blocked = false;
  let inserts = 0;
  const clearedScopes = [];
  const timerManager = {
    clearScope(scope) { clearedScopes.push(scope); },
    setInterval() { return 1; }
  };
  const service = createVisitTrackingService({
    getCurrentUser: () => ({ id: 'user-1' }),
    getState: () => ({ name: 'Player' }),
    supabaseClient: {
      from(table) {
        assert.equal(table, 'game_visit_events');
        return {
          async insert() {
            inserts++;
            return {
              error: {
                status: 402,
                message: 'Service for this project is restricted due to exceed_egress_quota'
              }
            };
          }
        };
      }
    },
    timerManager,
    isCloudSyncBlocked: () => blocked,
    markCloudSyncBlocked(error) {
      if (Number(error?.status) !== 402) return false;
      blocked = true;
      return true;
    }
  });

  try {
    assert.equal(service.startGameVisitTracking(), true);
    assert.equal(inserts, 1);
    assert.equal(typeof browser.visibilityHandler, 'function');
    await Promise.resolve();

    assert.equal(blocked, true);
    assert.ok(clearedScopes.includes('visit-tracking'));
    assert.equal(browser.visibilityHandler, null);
    assert.equal(browser.removedHandlers.length, 1);

    await service.recordGameVisit('visible');
    assert.equal(inserts, 1, 'blocked tracking must not send another insert');
    assert.equal(service.startGameVisitTracking(), false);
  } finally {
    browser.restore();
  }
});

test('ordinary visit tracking errors do not stop tracking', async () => {
  const browser = installBrowserStubs();
  let blocked = false;
  let inserts = 0;
  const clearedScopes = [];
  const timerManager = {
    clearScope(scope) { clearedScopes.push(scope); },
    setInterval() { return 1; }
  };
  const service = createVisitTrackingService({
    getCurrentUser: () => ({ id: 'user-1' }),
    getState: () => ({ name: 'Player' }),
    supabaseClient: {
      from() {
        return {
          async insert() {
            inserts++;
            return { error: { status: 503, message: 'temporary service unavailable' } };
          }
        };
      }
    },
    timerManager,
    isCloudSyncBlocked: () => blocked,
    markCloudSyncBlocked(error) {
      if (Number(error?.status) !== 402) return false;
      blocked = true;
      return true;
    }
  });

  try {
    assert.equal(service.startGameVisitTracking(), true);
    await Promise.resolve();
    await service.recordGameVisit('visible');
    assert.equal(blocked, false);
    assert.equal(inserts, 2);
    assert.deepEqual(clearedScopes, []);
    assert.equal(typeof browser.visibilityHandler, 'function');
  } finally {
    service.stopGameVisitTracking();
    browser.restore();
  }
});
