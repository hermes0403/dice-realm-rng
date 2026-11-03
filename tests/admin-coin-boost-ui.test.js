import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bindings = readFileSync(new URL('../admin/ui-bindings.js', import.meta.url), 'utf8');

test('coin boost fold is located once inside the admin activities section', () => {
  const activity = html.indexOf('🎉 管理員活動');
  const button = html.indexOf('id="adminActivityButton"');
  const boost = html.indexOf('id="adminCoinBoostFold"');
  const weather = html.indexOf('🌦 召喚與天氣');
  assert.ok(activity >= 0 && activity < button && button < boost && boost < weather);
  assert.equal((html.match(/id="adminCoinBoostFold"/g) || []).length, 1);
  assert.equal(html.slice(0, activity).includes('id="adminCoinBoostFold"'), false);
  assert.match(html, /開啟收益倍率設定/);
});

test('admin activity button opens and focuses the relocated coin boost fold', () => {
  const start = bindings.indexOf("document.getElementById('adminActivityButton')");
  const end = bindings.indexOf("document.getElementById('adminApplyGlobalBoostBtn')", start);
  assert.ok(start >= 0 && end > start);
  let click;
  let focused = false;
  let scrolled = false;
  const elements = {
    adminActivityButton: { addEventListener: (_type, fn) => { click = fn; } },
    adminCoinBoostFold: { open: false, scrollIntoView: () => { scrolled = true; } },
    adminCoinBoostScope: { focus: () => { focused = true; } },
    adminCoinBoostStatus: { textContent: '' }
  };
  const document = { getElementById: id => elements[id] || null };
  new Function('document', 'isAdmin', 'toast', bindings.slice(start, end))(document, () => true, () => {});
  click();
  assert.equal(elements.adminCoinBoostFold.open, true);
  assert.equal(focused, true);
  assert.equal(scrolled, true);
});

test('non-admin cannot submit coin boost and admin submission refreshes the active multiplier', async () => {
  const start = bindings.indexOf("document.getElementById('adminCoinBoostScope')");
  const end = bindings.indexOf("document.getElementById('adminCoinBoostPlayer').innerHTML", start);
  assert.ok(start >= 0 && end > start);
  let admin = false;
  let calls = 0;
  let refreshes = 0;
  const elements = {
    adminCoinBoostScope: { value: 'all', addEventListener() {} },
    adminCoinBoostPlayerWrap: { hidden: true },
    adminCoinBoostPlayer: { value: '' },
    adminCoinBoostMultiplier: { value: '2' },
    adminCoinBoostSeconds: { value: '60' },
    adminCoinBoostStatus: { textContent: '' },
    adminCoinBoostApply: { disabled: false, addEventListener(_type, fn) { this.click = fn; } }
  };
  const document = { getElementById: id => elements[id] || null };
  new Function('document', 'isAdmin', 'toast', 'adminApi', 'refreshCoinBoosts', 'confirm', bindings.slice(start, end))(
    document,
    () => admin,
    () => {},
    async payload => { calls++; assert.equal(payload.action, 'set_coin_boost'); return { success: true }; },
    async force => { assert.equal(force, true); refreshes++; return true; },
    () => true
  );
  await elements.adminCoinBoostApply.click();
  assert.equal(calls, 0);
  admin = true;
  await elements.adminCoinBoostApply.click();
  assert.equal(calls, 1);
  assert.equal(refreshes, 1);
  assert.match(elements.adminCoinBoostStatus.textContent, /重新同步/);
});


test('successful global coin boost setting immediately rerenders realm activity', async () => {
  const start = bindings.indexOf("document.getElementById('adminCoinBoostScope')");
  const end = bindings.indexOf("document.getElementById('adminCoinBoostPlayer').innerHTML", start);
  let renderCalls = 0;
  const elements = {
    adminCoinBoostScope: { value: 'all', addEventListener() {} },
    adminCoinBoostPlayerWrap: { hidden: true },
    adminCoinBoostPlayer: { value: '' },
    adminCoinBoostMultiplier: { value: '2' },
    adminCoinBoostSeconds: { value: '60' },
    adminCoinBoostStatus: { textContent: '' },
    adminCoinBoostApply: { disabled: false, addEventListener(_type, fn) { this.click = fn; } }
  };
  const document = { getElementById: id => elements[id] || null };
  new Function('document', 'isAdmin', 'toast', 'adminApi', 'refreshCoinBoosts', 'confirm', 'renderRealmActivity', bindings.slice(start, end))(
    document,
    () => true,
    () => {},
    async () => ({ success: true }),
    async () => true,
    () => true,
    () => { renderCalls++; }
  );
  await elements.adminCoinBoostApply.click();
  assert.equal(renderCalls, 1);
  assert.match(elements.adminCoinBoostStatus.textContent, /收益計算已重新同步/);
});
