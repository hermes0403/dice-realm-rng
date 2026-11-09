import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminGrantService } from '../admin/grants.js';

function createService({ fetchRef, isCloudSyncBlocked = () => false, markCloudSyncBlocked = () => {} }) {
  let sessionReads = 0;
  const service = createAdminGrantService({
    supabaseClient: {
      auth: {
        async getSession() {
          sessionReads++;
          return { data: { session: { access_token: 'test-token' } } };
        }
      }
    },
    isAdmin: () => true,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_KEY: 'test-key',
    D: [],
    ADMIN_GRANT_LABELS: {},
    escapeHTML: value => String(value),
    format: value => String(value),
    fetchRef,
    isCloudSyncBlocked,
    markCloudSyncBlocked
  });
  return { service, getSessionReads: () => sessionReads };
}

test('admin API stops after HTTP 402 egress restriction', async () => {
  let blocked = false;
  let requests = 0;
  const { service, getSessionReads } = createService({
    fetchRef: async () => {
      requests++;
      return { ok: false, status: 402, json: async () => ({ error: 'exceed_egress_quota' }) };
    },
    isCloudSyncBlocked: () => blocked,
    markCloudSyncBlocked: error => {
      if (error.status === 402) blocked = true;
    }
  });

  await assert.rejects(service.adminApi({ action: 'dashboard' }), /HTTP 402/);
  await assert.rejects(service.adminApi({ action: 'dashboard' }), /雲端服務受限/);
  assert.equal(requests, 1);
  assert.equal(getSessionReads(), 1);
});

test('admin API does not permanently block ordinary HTTP 503 failures', async () => {
  let requests = 0;
  const { service } = createService({
    fetchRef: async () => {
      requests++;
      return { ok: false, status: 503, json: async () => ({ error: 'temporarily unavailable' }) };
    },
    markCloudSyncBlocked: () => false
  });

  await assert.rejects(service.adminApi({ action: 'dashboard' }), /HTTP 503/);
  await assert.rejects(service.adminApi({ action: 'dashboard' }), /HTTP 503/);
  assert.equal(requests, 2);
});

test('admin API makes no session or network request when already restricted', async () => {
  let requests = 0;
  const { service, getSessionReads } = createService({
    fetchRef: async () => {
      requests++;
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    },
    isCloudSyncBlocked: () => true
  });

  await assert.rejects(service.adminApi({ action: 'dashboard' }), /雲端服務受限/);
  assert.equal(requests, 0);
  assert.equal(getSessionReads(), 0);
});
