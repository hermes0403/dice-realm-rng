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
  assert.match(html, /V1\.\d+/);
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


test('手機版頂部額外避開狀態列，背包依可用寬度增加每行格數', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /padding-top:\s*calc\(env\(safe-area-inset-top, 0px\) \+ 18px\)/);
  assert.match(css, /#inventoryGrid\s*\{[\s\S]*?repeat\(auto-fill, minmax\(clamp\(64px, 12vw, 92px\), 1fr\)\)/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-width: 1024px\)/);
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  for (const char of withoutComments) {
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    assert.ok(depth >= 0, 'CSS closing brace must have a matching opening brace');
  }
  assert.equal(depth, 0, 'CSS blocks must all be closed');
});


test('橫向模式全頁縮放且保留歡迎文字，直向不套用全頁縮放', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  const landscape = css.slice(css.indexOf('T-0085 landscape correction: scale the entire game surface'));
  assert.match(landscape, /@media \(orientation: landscape\) and \(max-width: 1024px\) and \(max-height: 620px\)/);
  assert.match(landscape, /\.shell\s*\{[\s\S]*?zoom:\s*var\(--landscape-scale\)/);
  assert.match(landscape, /body\s*\{[\s\S]*?padding-top:\s*max\(42px, env\(safe-area-inset-top, 0px\)\)/);
  assert.match(landscape, /#page-roll\s*>\s*\.hero\s+#realmHeroWelcome\s*\{\s*display:\s*block !important/);
  assert.match(landscape, /--landscape-scale:\s*\.64/);
  assert.match(landscape, /--landscape-scale:\s*\.84/);
});


test('翡翠綠主題說明面板保留區塊配色，主頁骰子底框降低綠色飽和度', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(css, /#page-roll\s*>\s*#realmHero\s*\{[\s\S]*?background:[\s\S]*?!important/);
  assert.match(css, /#page-codex\s*>\s*\.hero\s*\{[\s\S]*?background:[\s\S]*?!important/);
  assert.match(css, /#page-pets\s*>\s*\.hero\s*\{[\s\S]*?background:[\s\S]*?!important/);
  assert.match(css, /#page-event\s+#eventLockedPanel\s*\{[\s\S]*?background:[\s\S]*?!important/);
  assert.match(css, /#workshop-potions-panel\s+\.hero\s*\{[\s\S]*?background:[\s\S]*?!important/);
  assert.match(css, /#page-weather-summon\s+\.weather-summon-card\s*\{[\s\S]*?background:[\s\S]*?!important/);
  assert.match(css, /#page-roll\s*>\s*\.rollbox\s*>\s*\.dice\s*\{[\s\S]*?background:[\s\S]*?border-color:[\s\S]*?box-shadow:[\s\S]*?!important/);
});


test('文字對比與 V1.33 PWA 快取殼同步更新', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(html, /V1\.33/);
  assert.match(html, /script\.js\?v=20261114-t0091-heaven-glitch-no-x10/);
  assert.match(worker, /dice-realm-shell-v1\.33/);
  assert.match(worker, /systems\/glitch-weather-drops\.js\?v=20261114-t0089-glitch-potion-drops/);
  assert.match(worker, /systems\/secret-pet-skills\.js\?v=20261114-t0090-secret-pet-skills/);
});

test('深色背景的次要文字與導覽不再使用深藍前景', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  const finalRules = css.slice(css.lastIndexOf('T-0075 final contrast pass:'));
  assert.match(finalRules, /--text:\s*#edf0ff/i);
  assert.match(finalRules, /--muted:\s*#c5d5e6/i);
  assert.match(finalRules, /color:\s*#c5d5e6\s*!important/i);
  assert.match(finalRules, /\.nav button:not\(\.active\)[\s\S]*?color:\s*#e8edf9\s*!important/i);
  assert.doesNotMatch(finalRules, /color:\s*#(?:0b1433|17203f|303d69)\b/i);
});


test('主頁最新骰子名稱清楚，成就顏色與五種天氣骰子門檻正確', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  const progression = await readFile(new URL('../systems/progression.js', import.meta.url), 'utf8');
  assert.match(css, /#page-roll\s*>\s*\.rollbox\s*>\s*\.result-name[\s\S]*?background:\s*#07111ee8\s*!important[\s\S]*?color:\s*#ffffff\s*!important/);
  assert.match(css, /\.achievement-rainCollect2\s*\{\s*--achievement-accent:\s*#63aaff/i);
  assert.match(css, /\.achievement-snowCollect2\s*\{\s*--achievement-accent:\s*#c7eeff/i);
  assert.match(css, /\.achievement-thunderCollect2\s*\{\s*--achievement-accent:\s*#ffe36b/i);
  assert.match(css, /\.achievement-crystalCollect2\s*\{\s*--achievement-accent:\s*#d59aff/i);
  assert.match(css, /\.achievement-hellCollect2\s*\{\s*--achievement-accent:\s*#ff806d/i);
  for (const weather of ['rain', 'snow', 'thunder', 'crystal', 'hell']) {
    assert.match(progression, new RegExp("weather==='" + weather + "'.*?\\.length>=5,'獲得 5 種"));
    assert.match(progression, new RegExp("weather==='" + weather + "'.*?\\.length,5\\)}/5 種"));
  }
  assert.match(progression, /achievement-\$\{id\}/);
});
