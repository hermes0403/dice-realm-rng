import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setupDisplayControls } from '../ui/display-controls.js';

function createFixture({ requestFullscreen, exitFullscreen, pwaFullscreen = false, secure = true, serviceWorker = true } = {}) {
  const buttonListeners = new Map();
  const documentListeners = new Map();
  const messages = [];
  const registrations = [];
  const button = {
    textContent: '',
    disabled: false,
    attributes: {},
    addEventListener(name, callback) { buttonListeners.set(name, callback); },
    removeEventListener(name) { buttonListeners.delete(name); },
    setAttribute(name, value) { this.attributes[name] = value; }
  };
  const documentRef = {
    documentElement: { requestFullscreen },
    fullscreenElement: null,
    exitFullscreen,
    getElementById(id) { return id === 'fullscreenToggleBtn' ? button : null; },
    addEventListener(name, callback) { documentListeners.set(name, callback); },
    removeEventListener(name) { documentListeners.delete(name); }
  };
  const windowRef = {
    isSecureContext: secure,
    navigator: {},
    matchMedia() { return { matches: pwaFullscreen }; }
  };
  const navigatorRef = serviceWorker ? {
    serviceWorker: {
      register: async (url, options) => {
        registrations.push({ url, options });
        return { scope: options.scope };
      }
    }
  } : {};
  return { button, buttonListeners, documentListeners, documentRef, windowRef, navigatorRef, messages, registrations, toast: message => messages.push(message) };
}

test('全螢幕按鈕可進入與退出原生全螢幕', async () => {
  const fixture = createFixture({
    requestFullscreen: async function(options) {
      this.options = options;
      fixture.documentRef.fullscreenElement = {};
    },
    exitFullscreen: async () => { fixture.documentRef.fullscreenElement = null; }
  });
  setupDisplayControls(fixture);
  assert.equal(fixture.button.textContent, '全螢幕');
  await fixture.buttonListeners.get('click')();
  assert.deepEqual(fixture.documentRef.documentElement.options, { navigationUI: 'hide' });
  assert.equal(fixture.button.textContent, '退出全螢幕');
  assert.equal(fixture.button.attributes['aria-pressed'], 'true');
  await fixture.buttonListeners.get('click')();
  assert.equal(fixture.button.textContent, '全螢幕');
  assert.equal(fixture.button.attributes['aria-pressed'], 'false');
});

test('瀏覽器不接受 navigationUI 選項時會重試一般全螢幕 API', async () => {
  let calls = 0;
  const fixture = createFixture({
    requestFullscreen: async function(options) {
      calls += 1;
      if (options) throw new TypeError('unsupported option');
      fixture.documentRef.fullscreenElement = {};
    }
  });
  setupDisplayControls(fixture);
  await fixture.buttonListeners.get('click')();
  assert.equal(calls, 2);
  assert.equal(fixture.button.textContent, '退出全螢幕');
});

test('不支援 Fullscreen API 時不會阻斷頁面，並提供簡短提示', async () => {
  const fixture = createFixture();
  setupDisplayControls(fixture);
  await fixture.buttonListeners.get('click')();
  assert.deepEqual(fixture.messages, ['此瀏覽器不支援全螢幕']);
});

test('PWA 已以 fullscreen 顯示時按鈕標示已啟用且不重複要求全螢幕', () => {
  const fixture = createFixture({ pwaFullscreen: true });
  setupDisplayControls(fixture);
  assert.equal(fixture.button.disabled, true);
  assert.equal(fixture.button.attributes['aria-pressed'], 'true');
});

test('僅在安全來源註冊 Service Worker，並使用專案根目錄 scope', async () => {
  const fixture = createFixture();
  const controls = setupDisplayControls(fixture);
  await controls.serviceWorkerReady;
  assert.equal(fixture.registrations.length, 1);
  assert.ok(fixture.registrations[0].url.endsWith('/sw.js'));
  assert.ok(fixture.registrations[0].options.scope.endsWith('/'));
  const insecure = createFixture({ secure: false });
  const blocked = setupDisplayControls(insecure);
  await blocked.serviceWorkerReady;
  assert.equal(insecure.registrations.length, 0);
});

test('PWA manifest 使用專案相對路徑、fullscreen 優先顯示模式與安裝圖示', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.display_override, ['fullscreen', 'standalone', 'minimal-ui']);
  assert.equal(manifest.orientation, 'any');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512'));
  for (const size of [192, 512]) {
    const png = await readFile(new URL(`../assets/pwa-icon-${size}.png`, import.meta.url));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
});

test('首頁啟用 viewport-fit、安全區與設定頁全螢幕按鈕', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /id="fullscreenToggleBtn"/);
  assert.match(html, /V1.17/);
});

test('Service Worker 僅處理同源靜態資源與頁面導覽，不攔截 Supabase API', async () => {
  const worker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /request\.method !== 'GET'/);
  assert.match(worker, /request\.destination/);
  assert.match(worker, /\/rest\/v1\//);
  assert.match(worker, /\/auth\/v1\//);
  assert.match(worker, /\/functions\/v1\//);
});
